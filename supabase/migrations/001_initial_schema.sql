-- Create clinics table
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  description text,
  timezone text default 'UTC',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  channel text not null,
  channel_user_id text not null,
  status text default 'open',
  messages jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_conversations_clinic_channel_user 
  on public.conversations(clinic_id, channel, channel_user_id);

alter table public.clinics enable row level security;
alter table public.conversations enable row level security;

create policy "Clinics are viewable by anyone" on public.clinics for select using (true);
create policy "Conversations are accessible to clinic" on public.conversations for select using (true);
create policy "Conversations are insertable" on public.conversations for insert with check (true);
create policy "Conversations are updatable" on public.conversations for update using (true);
