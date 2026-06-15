# LINE integration — setup

## 1. LINE Developers setup
1. Create a provider and a **Messaging API** channel at
   developers.line.biz.
2. Under Basic settings, note:
   - Channel secret
   - Your bot's **Basic ID** / **User ID** (this is the `destination`
     value LINE sends in webhook payloads — found as "Bot user ID" under
     Messaging API tab)
3. Under Messaging API tab, issue a **Channel access token** (long-lived).
4. Disable "Auto-reply messages" and "Greeting messages" in LINE Official
   Account Manager if you want the AI to fully control responses.

## 2. Insert the clinic's LINE config
`channel_configs` table already exists from the WhatsApp migration
(`004_channel_configs.sql`). Insert a LINE row:

```sql
insert into channel_configs (
  clinic_id, channel,
  line_channel_id, line_channel_secret, line_channel_access_token
) values (
  '<clinic_uuid>', 'line',
  '<bot_user_id>', '<channel_secret>', '<channel_access_token>'
);
```

`line_channel_id` here stores the bot's **user ID** (the `destination`
field), which is how incoming webhooks are matched to a clinic — not the
numeric Channel ID from the console.

## 3. Deploy
```
supabase functions deploy line-webhook --no-verify-jwt
```
`--no-verify-jwt` is required because LINE calls this endpoint without a
Supabase auth header — the function verifies LINE's own signature instead.

## 4. Configure the webhook in LINE
In the Messaging API tab:
- Webhook URL: `https://<project-ref>.functions.supabase.co/line-webhook`
- Webhook: enabled
- Click "Verify" — LINE sends a test event; the function should respond 200

## 5. Test
Add the bot as a friend (scan the QR code in the console) and send a
message. The webhook:
1. Reads `destination` from the payload, looks up the clinic's
   `channel_configs` row
2. Verifies the signature using that clinic's channel secret
3. Finds/creates a `conversations` row (`channel = 'line'`,
   `channel_user_id` = LINE userId)
4. Calls `conversation-engine` (same AI logic as web/WhatsApp)
5. Replies via the LINE reply API using the event's `replyToken`

## Notes
- One LINE channel = one clinic (1:1), unlike WhatsApp where one Meta App
  serves multiple clinics. Each clinic needs its own LINE Official Account
  and Messaging API channel.
- Reply tokens expire quickly (~1 minute) — if `conversation-engine` /
  Claude is slow, the reply call may fail. For production, consider:
  falling back to `pushToLine` (push API) if the reply token has expired,
  though this consumes the monthly free push-message quota.
- Currently handles text messages only. Sticker/image/location messages get
  a polite fallback — extend `handleEvent` in `line-webhook/index.ts` for
  more types.
- Follow/unfollow events are ignored; add handling there if you want a
  custom welcome message when a user adds the bot.
