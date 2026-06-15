# Google Calendar integration — setup

## 1. Google Cloud Console setup
1. Create (or reuse) a Google Cloud project.
2. Enable the **Google Calendar API**.
3. Create OAuth 2.0 credentials (type: Web application).
4. Add an authorized redirect URI:
   `https://<your-project-ref>.functions.supabase.co/google-oauth-callback`
5. Note the Client ID and Client Secret.

## 2. Run the migration
Apply `supabase/migrations/002_google_calendar.sql` — adds:
- `clinic_settings.google_calendar_id`, `google_connected`
- `clinic_google_tokens` table (service-role only, stores refresh/access tokens)
- `appointments.calendar_sync_status`

## 3. Set Edge Function secrets
```
supabase secrets set GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
supabase secrets set GOOGLE_CLIENT_SECRET=xxxx
supabase secrets set GOOGLE_REDIRECT_URI=https://<project-ref>.functions.supabase.co/google-oauth-callback
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided to Edge Functions.)

## 4. Deploy functions
```
supabase functions deploy google-oauth-callback
supabase functions deploy calendar-sync
```

## 5. Connect a clinic's calendar
From the (future) admin dashboard, link to:
```
https://<project-ref>.functions.supabase.co/google-oauth-callback/start?clinic_id=<clinic_uuid>
```
This redirects to Google's consent screen. After approval, Google redirects back to
`google-oauth-callback`, which exchanges the code for tokens, stores them in
`clinic_google_tokens`, and sets `clinic_settings.google_connected = true`.

For now (no dashboard yet), you can trigger this manually by visiting that URL in a
browser while logged into the Google account that should own the clinic's calendar
(typically a shared clinic calendar, not a personal one — recommended: create a
dedicated Google Calendar for the clinic and set `calendar_id` accordingly in
`clinic_google_tokens` after connecting).

## 6. Triggering calendar-sync
Once #3 (availability checking) and #1 (AI booking flow) are built, the conversation
engine will call `calendar-sync` after creating/updating an appointment:

```js
await fetch(`${SUPABASE_FUNCTIONS_URL}/calendar-sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointment_id: appointment.id }),
});
```

## What's next
With this in place, #3 (availability checking) can use `getFreeBusy()` from
`_shared/googleCalendar.ts` to compute open slots before the AI offers times to
patients — preventing double-bookings from the start.
