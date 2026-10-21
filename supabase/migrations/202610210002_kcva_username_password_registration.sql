-- KCVA custom username/password account provisioning.
-- Privileged code handling and username-to-email lookup run only in the crew-auth Edge Function.
create extension if not exists pgcrypto;
alter table public.crew_members
  add column if not exists crew_username text,
  add column if not exists auth_email text;
alter table public.crew_members alter column discord_user_id drop not null;
create unique index if not exists crew_members_crew_username_lower_uidx
  on public.crew_members (lower(crew_username)) where crew_username is not null;
create unique index if not exists crew_members_auth_email_lower_uidx
  on public.crew_members (lower(auth_email)) where auth_email is not null;
create table if not exists public.registration_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  callsign text not null,
  ifc_username text not null,
  discord_username text not null,
  created_by uuid not null references public.crew_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz
);
create index if not exists registration_codes_active_idx
  on public.registration_codes(created_at desc)
  where consumed_at is null and disabled_at is null;
alter table public.registration_codes enable row level security;
revoke all on public.registration_codes from anon, authenticated;
-- Do not let browser users bind identities, change account usernames, or grant staff privileges.
revoke update (auth_user_id, is_admin, crew_username, auth_email, callsign, ifc_username, discord_user_id)
  on public.crew_members from authenticated;
