// Supabase Edge Function: google-oauth-callback
//
// Flow:
// 1. Staff clicks "Connect Google Calendar" in admin UI, which redirects to
//    Google's OAuth consent screen with redirect_uri pointing here.
// 2. Google redirects back here with `code` and `state` (clinic_id).
// 3. We exchange the code for tokens and store them in clinic_google_tokens.
//
// Required env vars (set via `supabase secrets set`):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI   (must match the one registered in Google Cloud Console)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Step A: generate the Google consent URL (called by admin UI)
  if (url.pathname.endsWith("/start")) {
    const clinicId = url.searchParams.get("clinic_id");
    if (!clinicId) {
      return new Response("Missing clinic_id", { status: 400 });
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/calendar",
      state: clinicId,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return Response.redirect(authUrl, 302);
  }

  // Step B: handle the OAuth redirect with the auth code
  const code = url.searchParams.get("code");
  const clinicId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`Google OAuth error: ${error}`, { status: 400 });
  }
  if (!code || !clinicId) {
    return new Response("Missing code or state", { status: 400 });
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("Token exchange failed:", text);
    return new Response("Failed to exchange code for tokens", { status: 500 });
  }

  const tokens = await tokenRes.json();
  // tokens: { access_token, refresh_token, expires_in, scope, token_type, id_token }

  if (!tokens.refresh_token) {
    // Happens if the user previously granted access without `prompt=consent`.
    // Ask them to revoke access in their Google account and retry, or always
    // pass prompt=consent (already done above) to force a fresh refresh_token.
    return new Response(
      "No refresh token returned. Please revoke prior access in your Google account and reconnect.",
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Upsert into the locked-down tokens table
  const { error: upsertError } = await supabase
    .from("clinic_google_tokens")
    .upsert({
      clinic_id: clinicId,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      scope: tokens.scope,
      calendar_id: "primary",
    });

  if (upsertError) {
    console.error("Failed to store tokens:", upsertError);
    return new Response("Failed to store tokens", { status: 500 });
  }

  // Mark clinic as connected
  await supabase
    .from("clinic_settings")
    .update({ google_connected: true, google_calendar_id: "primary" })
    .eq("id", clinicId);

  // Redirect back to admin dashboard with a success indicator
  return Response.redirect(`${SUPABASE_URL.replace(".supabase.co", "")}/admin/settings?calendar=connected`, 302);
});
