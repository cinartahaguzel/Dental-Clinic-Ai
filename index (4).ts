// Supabase Edge Function: calendar-sync
//
// Called when an appointment's status changes (e.g. from the admin
// dashboard, or programmatically). Creates, updates, or cancels the
// corresponding Google Calendar event.
//
// Trigger options:
//   - Call directly from admin dashboard after updating appointment status
//   - Or wire as a Postgres webhook (Database Webhooks) on `appointments`
//     UPDATE, pointing at this function's URL
//
// Expected POST body:
// {
//   "appointment_id": "uuid"
// }
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (used by _shared/googleCalendar.ts)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../_shared/googleCalendar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DEFAULT_DURATION_MINUTES = 30;

Deno.serve(async (req) => {
  try {
    const { appointment_id } = await req.json();
    if (!appointment_id) {
      return new Response(JSON.stringify({ error: "appointment_id is required" }), { status: 400 });
    }

    const { data: appt, error: apptError } = await supabase
      .from("appointments")
      .select("*, patients(full_name, email, phone), clinic_settings(id, name, timezone, google_connected)")
      .eq("id", appointment_id)
      .single();

    if (apptError || !appt) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), { status: 404 });
    }

    const clinic = appt.clinic_settings;
    const patient = appt.patients;

    if (!clinic?.google_connected) {
      await supabase
        .from("appointments")
        .update({ calendar_sync_status: "not_applicable" })
        .eq("id", appointment_id);
      return new Response(JSON.stringify({ status: "skipped", reason: "Google Calendar not connected" }), {
        status: 200,
      });
    }

    // Cancelled / no-show -> delete the calendar event if it exists
    if (["cancelled", "no_show"].includes(appt.status)) {
      if (appt.google_event_id) {
        await deleteCalendarEvent(clinic.id, appt.google_event_id);
      }
      await supabase
        .from("appointments")
        .update({ calendar_sync_status: "synced", google_event_id: null })
        .eq("id", appointment_id);
      return new Response(JSON.stringify({ status: "cancelled_in_calendar" }), { status: 200 });
    }

    // Need a confirmed date/time to create or update a calendar event
    if (!appt.preferred_date) {
      return new Response(JSON.stringify({ status: "skipped", reason: "No date set on appointment" }), {
        status: 200,
      });
    }

    const startDateTime = combineDateTime(appt.preferred_date, appt.preferred_time);
    const endDateTime = addMinutes(startDateTime, DEFAULT_DURATION_MINUTES);

    const summary = `${appt.reason || "Dental appointment"} — ${patient?.full_name || "Patient"}`;
    const description = [
      `Reason: ${appt.reason || "N/A"}`,
      `Patient phone: ${patient?.phone || "N/A"}`,
      `Patient email: ${patient?.email || "N/A"}`,
      `Status: ${appt.status}`,
      appt.staff_notes ? `Notes: ${appt.staff_notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (appt.google_event_id) {
      // Update existing event
      await updateCalendarEvent(clinic.id, appt.google_event_id, {
        summary,
        description,
        startDateTime,
        endDateTime,
        timeZone: clinic.timezone,
        status: "confirmed",
      });
      await supabase
        .from("appointments")
        .update({ calendar_sync_status: "synced" })
        .eq("id", appointment_id);

      return new Response(JSON.stringify({ status: "updated" }), { status: 200 });
    } else {
      // Create new event
      const { eventId } = await createCalendarEvent(clinic.id, {
        summary,
        description,
        startDateTime,
        endDateTime,
        timeZone: clinic.timezone,
        attendeeEmail: patient?.email || undefined,
      });

      await supabase
        .from("appointments")
        .update({ google_event_id: eventId, calendar_sync_status: "synced" })
        .eq("id", appointment_id);

      return new Response(JSON.stringify({ status: "created", google_event_id: eventId }), { status: 200 });
    }
  } catch (err) {
    console.error("calendar-sync error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

function combineDateTime(date: string, time: string | null): string {
  // date: "2026-06-20", time: "14:30:00" or null
  const t = time || "09:00:00";
  return `${date}T${t}`;
}

function addMinutes(isoDateTime: string, minutes: number): string {
  const d = new Date(isoDateTime);
  d.setMinutes(d.getMinutes() + minutes);
  // Return in the same "YYYY-MM-DDTHH:mm:ss" shape (no Z, since timeZone is passed separately)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}
