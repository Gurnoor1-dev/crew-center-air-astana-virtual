-- KCVA crew-center schema extension. Additive migration: preserves existing crew/bot tables and data.
-- Apply only to the intended AirArabiaVirtual Supabase project after reviewing the target project.
create extension if not exists pgcrypto;

alter table public.crew_members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists avatar_url text,
  add column if not exists total_flight_time_minutes integer not null default 0 check (total_flight_time_minutes >= 0),
  add column if not exists discord_avatar_url text;
create unique index if not exists crew_members_auth_user_id_uidx
  on public.crew_members(auth_user_id) where auth_user_id is not null;

alter table public.pireps
  add column if not exists operator text default 'Air Astana Virtual',
  add column if not exists notes text,
  add column if not exists rejection_reason text;
alter table public.pireps drop constraint if exists pireps_status_check;
alter table public.pireps add constraint pireps_status_check
  check (status in ('pending','approved','rejected','on hold'));
create index if not exists pireps_member_date_idx on public.pireps(crew_member_id, created_at desc);
create index if not exists pireps_status_idx on public.pireps(status, created_at desc);

create table if not exists public.username_change_requests (
  id uuid primary key default gen_random_uuid(),
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  requested_username text not null check (char_length(trim(requested_username)) between 2 and 40),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.crew_members(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists username_change_requests_pending_idx on public.username_change_requests(status, created_at desc);

create table if not exists public.pilot_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  route text,
  aircraft text,
  image_url text,
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_by uuid references public.crew_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pilot_events_published_idx on public.pilot_events(starts_at) where status = 'published';

create table if not exists public.fleet_aircraft (
  id uuid primary key default gen_random_uuid(),
  registration text not null unique,
  aircraft_type text not null,
  if_aircraft_id text,
  status text not null default 'available' check (status in ('available','in flight','stopped','stored','maintenance')),
  current_pilot_id uuid references public.crew_members(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Enable RLS for every newly exposed table. Existing crew/pirep policies are preserved;
-- profile access policies use the auth_user_id mapping and do not trust user metadata for roles.
alter table public.username_change_requests enable row level security;
alter table public.pilot_events enable row level security;
alter table public.fleet_aircraft enable row level security;

 drop policy if exists "Pilots can read own username requests" on public.username_change_requests;
create policy "Pilots can read own username requests" on public.username_change_requests
  for select to authenticated using (
    exists (select 1 from public.crew_members cm where cm.id = crew_member_id and cm.auth_user_id = (select auth.uid()))
  );
drop policy if exists "Pilots can submit own username requests" on public.username_change_requests;
create policy "Pilots can submit own username requests" on public.username_change_requests
  for insert to authenticated with check (
    status = 'pending' and reviewed_by is null and reviewed_at is null and
    exists (select 1 from public.crew_members cm where cm.id = crew_member_id and cm.auth_user_id = (select auth.uid()))
  );
drop policy if exists "Authenticated users can read published events" on public.pilot_events;
create policy "Authenticated users can read published events" on public.pilot_events
  for select to authenticated using (status = 'published');
drop policy if exists "Authenticated users can read fleet" on public.fleet_aircraft;
create policy "Authenticated users can read fleet" on public.fleet_aircraft
  for select to authenticated using (true);

-- Admin write permissions are intentionally not granted by these policies.
-- Provision admin status only through trusted server-side tooling; avoid self-service role updates.
