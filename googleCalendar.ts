# WhatsApp integration — setup

## 1. Meta setup
1. Create a Meta App at developers.facebook.com (type: Business).
2. Add the **WhatsApp** product.
3. Under WhatsApp > API Setup, note:
   - Phone number ID
   - Temporary access token (replace with a permanent System User token
     for production)
   - WhatsApp Business Account ID
4. Under App Settings > Basic, note the **App Secret** — used to verify
   webhook signatures.

## 2. Run the migration
Apply `supabase/migrations/004_channel_configs.sql` — creates the
`channel_configs` table (service-role only, stores WhatsApp/LINE
credentials).

## 3. Insert the clinic's WhatsApp config
Run via SQL editor (service role) or a future admin dashboard form:

```sql
insert into channel_configs (
  clinic_id, channel,
  whatsapp_phone_number_id, whatsapp_access_token,
  whatsapp_business_account_id
) values (
  '<clinic_uuid>', 'whatsapp',
  '<phone_number_id>', '<access_token>',
  '<business_account_id>'
);
```

## 4. Set Edge Function secrets
```
supabase secrets set WHATSAPP_APP_SECRET=<meta_app_secret>
supabase secrets set WHATSAPP_VERIFY_TOKEN=<choose_any_random_string>
```

## 5. Deploy
```
supabase functions deploy whatsapp-webhook --no-verify-jwt
```
`--no-verify-jwt` is required because Meta calls this endpoint without a
Supabase auth header — the function verifies Meta's own signature instead.

## 6. Configure the webhook in Meta
In WhatsApp > Configuration:
- Callback URL: `https://<project-ref>.functions.supabase.co/whatsapp-webhook`
- Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the `messages` webhook field

Meta will call the URL with a GET request to verify; the function checks
the token and echoes back `hub.challenge`.

## 7. Test
Send a WhatsApp message to the business number. The webhook:
1. Verifies the signature
2. Looks up the clinic by `whatsapp_phone_number_id`
3. Finds/creates a `conversations` row (`channel = 'whatsapp'`,
   `channel_user_id` = sender's phone number)
4. Calls `conversation-engine` (same AI logic as the web widget)
5. Sends the reply back via the Cloud API

## Notes
- One Meta App + one verify token serves all clinics; each clinic's
  phone number is distinguished by `whatsapp_phone_number_id` in
  `channel_configs`.
- For production, replace the temporary access token with a permanent
  token from a System User with `whatsapp_business_messaging` permission.
- Currently handles text and simple interactive replies (button/list
  titles). Images, audio, location, etc. get a polite fallback message —
  extend `handleIncomingMessage` in `whatsapp-webhook/index.ts` to support
  more types as needed.
