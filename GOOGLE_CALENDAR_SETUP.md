# Conversation engine + availability checking — setup

## What changed
- AI logic moved out of the frontend into `conversation-engine`, an Edge
  Function called by web/WhatsApp/LINE alike.
- Claude now uses tool calls: `check_availability`, `collect_patient_info`,
  `book_appointment`, `escalate_to_human`.
- The frontend `ClinicReceptionist.jsx` no longer calls the Anthropic API or
  shows a manual booking form — the AI collects patient info and books
  conversationally.

## 1. Run migrations
```
supabase/migrations/003_scheduling_config.sql
```
(after 001 and 002 from previous steps)

## 2. Set additional secrets
```
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
```
(GOOGLE_CLIENT_ID/SECRET already set from the calendar integration step)

## 3. Deploy functions
```
supabase functions deploy check-availability
supabase functions deploy conversation-engine
```
Note: `conversation-engine` calls `check-availability` and `calendar-sync`
internally via their Edge Function URLs using the service role key — make
sure all three are deployed to the same project.

## 4. Frontend env
No new env vars beyond `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
(already set). The widget now calls:
`${VITE_SUPABASE_URL}/functions/v1/conversation-engine`

## 5. Verify the tool loop
Test with a message like "Do you have anything available this Friday for a
cleaning?" — Claude should call `check_availability`, get real slots back
(clinic hours minus existing appointments minus Google Calendar busy times),
and offer specific times.

Then "My name is Somchai, phone 081-111-2222, book me for Friday at 10am" —
Claude should call `collect_patient_info`, then `book_appointment`, which:
- re-verifies the slot is still free
- inserts into `appointments` with status `requested`
- fires `calendar-sync` to create the Google Calendar event (if connected)

## 6. Emergency handling check
A message like "I have severe pain and my tooth is broken" should trigger
`escalate_to_human` with `urgent: true`, set `conversations.status =
'needs_human'`, and the reply should surface the emergency phone number.
The web widget shows a "staff notified" banner when this happens.

## What's next
#4 (WhatsApp) and #5 (LINE) are now straightforward: webhook handlers that
normalize incoming messages, call `getOrCreateConversation` +
`conversation-engine` with `channel: "whatsapp"`/`"line"`, and send the
reply back via each platform's send API.
