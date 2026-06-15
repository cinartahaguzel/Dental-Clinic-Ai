// Supabase Edge Function: check-availability
//
// Computes open appointment slots for a clinic on a given date (or the
// next N days), by combining:
//   1. Clinic operating hours (clinic_settings.hours)
//   2. Existing appointments in our DB with status in ('requested','confirmed')
//   3. Google Calendar busy times (if connected)
//
// This is called by the conversation engine as a tool ("check_availability")
// so Claude can offer real slots instead of guessing.
//
// POST body:
// {
//   "clinic_id": "uuid",
//   "date": "2026-06-20",       // optional — specific date
//   "days_ahead": 7              // optional — scan N days starting today/date
// }
//
// Response:
// {
//   "slots": [
//     { "date": "2026-06-20", "time": "09:00", "available": true },
//     ...
//   ]
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFreeBusy } from "../_shared/googleCalendar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

Deno.serve(async (req) => {
  try {
    const { clinic_id, date, days_ahead } = await req.json();
    if (!clinic_id) {
      return new Response(JSON.stringify({ error: "clinic_id is required" }), { status: 400 });
    }

    const { data: clinic, error: clinicError } = await supabase
      .from("clinic_settings")
      .select("*")
      .eq("id", clinic_id)
      .single();

    if (clinicError || !clinic) {
      return new Response(JSON.stringify({ error: "Clinic not found" }), { status: 404 });
    }

    const startDate = date ? new Date(date) : new Date();
    const numDays = days_ahead || (date ? 1 : 7);
    const horizon = Math.min(numDays, clinic.booking_horizon_days || 14);

    // Build list of candidate dates
    const dates: string[] = [];
    for (let i = 0; i < horizon; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.push(toDateString(d));
    }

    // Fetch existing local appointments across the date range
    const { data: existingAppts, error: apptError } = await supabase
      .from("appointments")
      .select("preferred_date, preferred_time")
      .eq("clinic_id", clinic_id)
      .in("status", ["requested", "confirmed"])
      .gte("preferred_date", dates[0])
      .lte("preferred_date", dates[dates.length - 1]);

    if (apptError) {
      console.error("Failed to fetch appointments:", apptError);
    }

    const bookedByDate: Record<string, Set<string>> = {};
    for (const appt of existingAppts || []) {
      if (!appt.preferred_date || !appt.preferred_time) continue;
      const key = appt.preferred_date;
      const time = appt.preferred_time.slice(0, 5); // "HH:MM:SS" -> "HH:MM"
      if (!bookedByDate[key]) bookedByDate[key] = new Set();
      bookedByDate[key].add(time);
    }

    // Fetch Google Calendar busy times for the whole range, if connected
    let googleBusy: Array<{ start: string; end: string }> = [];
    if (clinic.google_connected) {
      try {
        const timeMin = `${dates[0]}T00:00:00`;
        const timeMaxDate = new Date(dates[dates.length - 1]);
        timeMaxDate.setDate(timeMaxDate.getDate() + 1);
        const timeMax = `${toDateString(timeMaxDate)}T00:00:00`;
        googleBusy = await getFreeBusy(clinic_id, timeMin, timeMax);
      } catch (e) {
        console.error("FreeBusy lookup failed, continuing without it:", e);
      }
    }

    const slotMinutes = clinic.slot_duration_minutes || 30;
    const bufferMinutes = clinic.buffer_minutes || 0;
    const hours = clinic.hours || {};

    const slots: Array<{ date: string; time: string; available: boolean }> = [];

    for (const dateStr of dates) {
      const dayKey = DAY_KEYS[new Date(dateStr + "T00:00:00").getDay()];
      const rangeStr = hours[dayKey];

      if (!rangeStr || rangeStr.toLowerCase() === "closed") {
        continue; // skip closed days entirely
      }

      const [openStr, closeStr] = rangeStr.split("-");
      const openMin = timeStrToMinutes(openStr);
      const closeMin = timeStrToMinutes(closeStr);

      for (let t = openMin; t + slotMinutes <= closeMin; t += slotMinutes + bufferMinutes) {
        const timeStr = minutesToTimeStr(t);
        const slotStart = `${dateStr}T${timeStr}:00`;
        const slotEnd = `${dateStr}T${minutesToTimeStr(t + slotMinutes)}:00`;

        const isBookedLocally = bookedByDate[dateStr]?.has(timeStr) ?? false;
        const overlapsGoogle = googleBusy.some((busy) =>
          rangesOverlap(slotStart, slotEnd, busy.start, busy.end)
        );

        slots.push({
          date: dateStr,
          time: timeStr,
          available: !isBookedLocally && !overlapsGoogle,
        });
      }
    }

    return new Response(JSON.stringify({ slots }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-availability error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeStrToMinutes(t: string): number {
  const [h, m] = t.trim().split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

// Simple overlap check between two ISO datetime ranges (no timezone math —
// both Google freebusy results and our slot times are in clinic's local
// representation here; for full correctness ensure clinic.timezone is used
// consistently when querying Google with explicit offsets).
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a1 = new Date(aStart).getTime();
  const a2 = new Date(aEnd).getTime();
  const b1 = new Date(bStart).getTime();
  const b2 = new Date(bEnd).getTime();
  return a1 < b2 && b1 < a2;
}
