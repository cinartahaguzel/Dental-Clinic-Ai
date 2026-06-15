# Follow-up automation — setup

## What this adds
- `follow_ups` table tracking scheduled/sent reminders (idempotent —
  one row per `(appointment_id, type)`)
- Per-clinic toggles on `clinic_settings`:
  - `followups_enabled` (master switch)
  - `reminder_24h_enabled` (default on)
  - `reminder_2h_enabled` (default off)
  - `no_response_followup_enabled` (default on)
  - `no_response_followup_hours` (default 24)
- `process-followups` Edge Function: schedules new follow-ups, then sends
  any that are due, via the patient's original channel (WhatsApp/LINE).

## Follow-up types
| Type | Trigger | Sent to |
|---|---|---|
| `appointment_reminder_24h` | Confirmed appointment, 24h before | Patient |
| `appointment_reminder_2h` | Confirmed appointment, 2h before (opt-in) | Patient |
| `booking_no_response` | `requested` appointment older than N hours with no status change | Patient (nudge) |

Web-channel patients are skipped for proactive sends (no push capability)
— their follow-up rows are marked `failed` with a reason, visible later in
the admin dashboard for manual staff follow-up.

## 1. Run the migration
```
supabase/migrations/005_followups.sql
```
Requires `pg_cron` and `pg_net` extensions — both available by default on
Supabase projects (enable under Database > Extensions if not already on).

## 2. Deploy
```
supabase functions deploy process-followups
```

## 3. Schedule the cron job
After deploying, run this in the SQL editor (replace placeholders):

```sql
select cron.schedule(
  'process-followups-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/process-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <service-role-key>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

To verify it's running:
```sql
select * from cron.job_run_details order by start_time desc limit 10;
```

## 4. Test manually
You can invoke the function directly to test without waiting for cron:
```
curl -X POST https://<project-ref>.functions.supabase.co/process-followups \
  -H "Authorization: Bearer <service-role-key>"
```

Response shows counts: `{ "scheduled": {...}, "sent": {...} }`.

## Notes
- 24h/2h reminders only fire for `confirmed` appointments — staff must
  confirm `requested` appointments (via the future admin dashboard) for
  reminders to schedule.
- `booking_no_response` follow-ups send immediately once the threshold is
  crossed (scheduled_for = now), then are marked `skipped` automatically if
  staff later change the appointment status.
- All sends are logged in `follow_ups` with `sent`/`failed`/`skipped`
  status — this becomes a useful admin dashboard view later (e.g. "reminders
  that failed to send — needs manual follow-up").
- LINE push messages count against the channel's monthly free quota; for
  high-volume clinics consider disabling `reminder_2h_enabled` or using
  WhatsApp templates instead (requires Meta template approval, not covered
  here).
