// Shared helper module for LINE Messaging API operations.
// Used by: line-webhook function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const LINE_API_BASE = "https://api.line.me/v2/bot";

export interface LineChannelConfig {
  clinic_id: string;
  line_channel_id: string;
  line_channel_secret: string;
  line_channel_access_token: string;
}

/**
 * Look up the channel config (and clinic_id) for a given LINE channel id.
 * LINE webhooks don't include the destination channel id in a way that's
 * trivial to multiplex without it — `destination` in the webhook body is
 * the bot's user id, which we store alongside the channel id at setup time.
 * Simpler approach: one LINE channel = one clinic, looked up by
 * `destination` (the bot's userId) matched against `line_channel_id`.
 */
export async function getChannelConfigByDestination(
  destination: string
): Promise<LineChannelConfig | null> {
  const { data, error } = await supabase
    .from("channel_configs")
    .select("*")
    .eq("channel", "line")
    .eq("line_channel_id", destination)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as LineChannelConfig;
}

/**
 * Reply to a message using the replyToken (preferred — free, no rate limit
 * concerns, but only valid for a short time after the webhook event).
 */
export async function replyToLine(
  config: LineChannelConfig,
  replyToken: string,
  text: string
): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.line_channel_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: truncateForLine(text) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("LINE reply failed:", errText);
    throw new Error("Failed to send LINE reply");
  }
}

/**
 * Push a message to a user proactively (e.g. for reminders).
 * Uses the push API, which counts against the monthly free message quota.
 */
export async function pushToLine(config: LineChannelConfig, userId: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.line_channel_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: truncateForLine(text) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("LINE push failed:", errText);
    throw new Error("Failed to send LINE push message");
  }
}

/**
 * LINE text messages are capped at 5000 characters.
 */
function truncateForLine(text: string): string {
  const LIMIT = 5000;
  return text.length > LIMIT ? text.slice(0, LIMIT - 1) + "…" : text;
}

/**
 * Verify the X-Line-Signature header: HMAC-SHA256 of the raw body using the
 * channel secret, base64-encoded.
 */
export async function verifyLineSignature(
  rawBody: string,
  signatureHeader: string | null,
  channelSecret: string
): Promise<boolean> {
  if (!signatureHeader) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const macBase64 = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return macBase64 === signatureHeader;
}
