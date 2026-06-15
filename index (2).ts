// Shared helper module for WhatsApp Cloud API operations.
// Used by: whatsapp-webhook function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const GRAPH_API_VERSION = "v19.0";

export interface ChannelConfig {
  clinic_id: string;
  whatsapp_phone_number_id: string;
  whatsapp_access_token: string;
  whatsapp_verify_token: string;
}

/**
 * Look up the channel config (and clinic_id) for a given
 * WhatsApp phone_number_id (the receiving business number).
 */
export async function getChannelConfigByPhoneNumberId(
  phoneNumberId: string
): Promise<ChannelConfig | null> {
  const { data, error } = await supabase
    .from("channel_configs")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as ChannelConfig;
}

/**
 * Send a text message to a WhatsApp user.
 */
export async function sendWhatsAppMessage(
  config: ChannelConfig,
  to: string,
  text: string
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.whatsapp_phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsapp_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("WhatsApp send failed:", errText);
    throw new Error("Failed to send WhatsApp message");
  }
}

/**
 * Mark an inbound message as read (shows blue ticks).
 */
export async function markWhatsAppMessageRead(config: ChannelConfig, messageId: string): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.whatsapp_phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.whatsapp_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      }
    );
  } catch (e) {
    // Non-critical — log and continue
    console.error("Failed to mark message read:", e);
  }
}

/**
 * Verify the X-Hub-Signature-256 header against the app secret.
 * WHATSAPP_APP_SECRET is the Meta App's secret (shared across clinics,
 * since the webhook endpoint is shared at the app level).
 */
export async function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = signatureHeader.replace("sha256=", "");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const macHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(macHex, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
