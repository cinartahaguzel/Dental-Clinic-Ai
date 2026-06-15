// Shared helper for sending proactive (non-reply) messages to a patient
// via whichever channel their conversation is on.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppMessage, ChannelConfig as WhatsAppConfig } from "./whatsapp.ts";
import { pushToLine, LineChannelConfig } from "./line.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export interface SendResult {
  sent: boolean;
  reason?: string;
}

/**
 * Send a proactive message to a patient, routing via the channel of their
 * most recent conversation. Falls back gracefully if no channel is
 * configured or the patient has no WhatsApp/LINE conversation on file.
 */
export async function sendProactiveMessage(
  clinicId: string,
  patientId: string,
  text: string
): Promise<SendResult> {
  // Find the patient's most recent conversation to determine channel + user id
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("channel, channel_user_id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (convError || !conversation) {
    return { sent: false, reason: "No conversation found for patient" };
  }

  if (conversation.channel === "whatsapp") {
    const { data: config } = await supabase
      .from("channel_configs")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("channel", "whatsapp")
      .eq("is_active", true)
      .maybeSingle();

    if (!config) return { sent: false, reason: "WhatsApp not configured for clinic" };

    try {
      await sendWhatsAppMessage(config as WhatsAppConfig, conversation.channel_user_id, text);
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: String(e) };
    }
  }

  if (conversation.channel === "line") {
    const { data: config } = await supabase
      .from("channel_configs")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("channel", "line")
      .eq("is_active", true)
      .maybeSingle();

    if (!config) return { sent: false, reason: "LINE not configured for clinic" };

    try {
      await pushToLine(config as LineChannelConfig, conversation.channel_user_id, text);
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: String(e) };
    }
  }

  // Web channel: no proactive push possible. Logged as skipped so it
  // doesn't retry forever; staff can follow up manually via the dashboard.
  return { sent: false, reason: `Cannot push to channel '${conversation.channel}'` };
}
