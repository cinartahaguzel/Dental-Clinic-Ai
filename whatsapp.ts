// Shared helper module for Google Calendar operations.
// Used by: availability-check, book-appointment, calendar-sync functions.
//
// Import via: import { getValidAccessToken, ... } from "../_shared/googleCalendar.ts"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Returns a valid Google access token for a clinic, refreshing it
 * via the stored refresh_token if the current one is expired or
 * about to expire.
 */
export async function getValidAccessToken(clinicId: string): Promise<{
  accessToken: string;
  calendarId: string;
}> {
  const { data: tokenRow, error } = await supabase
    .from("clinic_google_tokens")
    .select("*")
    .eq("clinic_id", clinicId)
    .single();

  if (error || !tokenRow) {
    throw new Error("Clinic has not connected Google Calendar");
  }

  const expiresAt = tokenRow.access_token_expires_at
    ? new Date(tokenRow.access_token_expires_at).getTime()
    : 0;

  const isExpiringSoon = expiresAt - Date.now() < 60_000; // refresh if <60s left

  if (!isExpiringSoon && tokenRow.access_token) {
    return { accessToken: tokenRow.access_token, calendarId: tokenRow.calendar_id };
  }

  // Refresh the access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Token refresh failed:", text);
    throw new Error("Failed to refresh Google access token");
  }

  const refreshed = await res.json();
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("clinic_google_tokens")
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: newExpiresAt,
    })
    .eq("clinic_id", clinicId);

  return { accessToken: refreshed.access_token, calendarId: tokenRow.calendar_id };
}

/**
 * Query Google Calendar FreeBusy API for busy windows in a date range.
 */
export async function getFreeBusy(
  clinicId: string,
  timeMin: string,
  timeMax: string
): Promise<Array<{ start: string; end: string }>> {
  const { accessToken, calendarId } = await getValidAccessToken(clinicId);

  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("FreeBusy query failed:", text);
    throw new Error("Failed to query calendar availability");
  }

  const data = await res.json();
  return data.calendars?.[calendarId]?.busy ?? [];
}

/**
 * Create a calendar event for an appointment.
 */
export async function createCalendarEvent(
  clinicId: string,
  event: {
    summary: string;
    description?: string;
    startDateTime: string; // ISO 8601 with timezone
    endDateTime: string;
    timeZone: string;
    attendeeEmail?: string;
  }
): Promise<{ eventId: string; htmlLink: string }> {
  const { accessToken, calendarId } = await getValidAccessToken(clinicId);

  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startDateTime, timeZone: event.timeZone },
    end: { dateTime: event.endDateTime, timeZone: event.timeZone },
  };

  if (event.attendeeEmail) {
    body.attendees = [{ email: event.attendeeEmail }];
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Create event failed:", text);
    throw new Error("Failed to create calendar event");
  }

  const created = await res.json();
  return { eventId: created.id, htmlLink: created.htmlLink };
}

/**
 * Update an existing calendar event (e.g. when an appointment is
 * rescheduled or cancelled).
 */
export async function updateCalendarEvent(
  clinicId: string,
  eventId: string,
  patch: {
    summary?: string;
    description?: string;
    startDateTime?: string;
    endDateTime?: string;
    timeZone?: string;
    status?: "confirmed" | "cancelled";
  }
): Promise<void> {
  const { accessToken, calendarId } = await getValidAccessToken(clinicId);

  const body: Record<string, unknown> = {};
  if (patch.summary) body.summary = patch.summary;
  if (patch.description) body.description = patch.description;
  if (patch.startDateTime && patch.timeZone) {
    body.start = { dateTime: patch.startDateTime, timeZone: patch.timeZone };
  }
  if (patch.endDateTime && patch.timeZone) {
    body.end = { dateTime: patch.endDateTime, timeZone: patch.timeZone };
  }
  if (patch.status) body.status = patch.status;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Update event failed:", text);
    throw new Error("Failed to update calendar event");
  }
}

/**
 * Delete (cancel) a calendar event.
 */
export async function deleteCalendarEvent(clinicId: string, eventId: string): Promise<void> {
  const { accessToken, calendarId } = await getValidAccessToken(clinicId);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  // 410 Gone = already deleted, treat as success
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    const text = await res.text();
    console.error("Delete event failed:", text);
    throw new Error("Failed to delete calendar event");
  }
}
