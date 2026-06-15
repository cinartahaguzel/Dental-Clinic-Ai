// Shared helper for finding/creating a conversation row, used by
// channel webhooks (WhatsApp, LINE) running in the Deno Edge runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Find an existing open conversation for this channel/user, or create one.
 */
export async function getOrCreateConversation({
  clinicId,
  channel,
  channelUserId,
}: {
  clinicId: string;
  channel: string;
  channelUserId: string;
}): Promise<{ data: any; error: any }> {
  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("channel", channel)
    .eq("channel_user_id", channelUserId)
    .eq("status", "open")
    .maybeSingle();

  if (findError) return { data: null, error: findError };
  if (existing) return { data: existing, error: null };

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({
      clinic_id: clinicId,
      channel,
      channel_user_id: channelUserId,
      status: "open",
      messages: [],
    })
    .select()
    .single();

  return { data: created, error: createError };
}
