import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function getClinicSettings() {
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function getOrCreateConversation({ clinicId, channel, channelUserId }) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('channel', channel)
    .eq('channel_user_id', channelUserId)
    .eq('status', 'open')
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      clinic_id: clinicId,
      channel,
      channel_user_id: channelUserId,
      status: 'open',
      messages: [],
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}
