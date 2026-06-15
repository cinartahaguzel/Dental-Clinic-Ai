-- Store Google Calendar credentials per clinic
create table if not exists public.clinic_google_tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references public.clinics(id) on delete cascade,
  access_token text,
  refresh_token text not null,
  access_token_expires_at timestamp with time zone,
  calendar_id text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.clinic_google_tokens enable row level security;

create policy "clinic_google_tokens are service role only"
  on public.clinic_google_tokens
  using (false)
  with check (false);
