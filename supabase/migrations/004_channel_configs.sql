-- Store credentials for external channels (WhatsApp, LINE, etc)
create table if not exists public.channel_configs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  channel text not null,
  is_active boolean default true,
  whatsapp_phone_number_id text,
  whatsapp_access_token text,
  whatsapp_business_account_id text,
  line_channel_id text,
  line_channel_secret text,
  line_channel_access_token text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.channel_configs enable row level security;

create policy "channel_configs are service role only"
  on public.channel_configs
  using (false)
  with check (false);
