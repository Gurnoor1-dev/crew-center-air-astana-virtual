-- Flight Operations Center, Smart PIREPs, suffix settings, career and analytics.
-- Additive: existing approved PIREPs remain the source of career totals.
create table if not exists public.va_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.crew_members(id) on delete set null
);
insert into public.va_settings(key,value) values ('accepted_callsign_suffixes','["KC"]'::jsonb)
on conflict (key) do nothing;

create table if not exists public.flight_routes (
  id uuid primary key default gen_random_uuid(),
  route_code text not null unique,
  dep_icao text not null check (dep_icao = upper(dep_icao) and char_length(dep_icao)=4),
  arr_icao text not null check (arr_icao = upper(arr_icao) and char_length(arr_icao)=4),
  dep_name text,
  arr_name text,
  aircraft text,
  distance_nm integer check (distance_nm is null or distance_nm > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (dep_icao <> arr_icao)
);
create index if not exists flight_routes_airports_idx on public.flight_routes(dep_icao,arr_icao) where enabled;

create table if not exists public.smart_pirep_candidates (
  id uuid primary key default gen_random_uuid(),
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  if_flight_id uuid not null,
  flight_number text not null,
  dep_icao text,
  arr_icao text,
  aircraft text,
  flight_time_minutes integer not null default 0 check (flight_time_minutes between 0 and 1440),
  landing_rate_fpm integer,
  flight_date date not null default current_date,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected','expired')),
  expires_at timestamptz not null default now() + interval '24 hours',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique(crew_member_id,if_flight_id)
);
create index if not exists smart_pirep_pending_idx on public.smart_pirep_candidates(status,expires_at) where status='pending';
alter table public.smart_pirep_candidates enable row level security;
drop policy if exists "Pilots can read own smart PIREP candidates" on public.smart_pirep_candidates;
create policy "Pilots can read own smart PIREP candidates" on public.smart_pirep_candidates for select to authenticated
using (exists(select 1 from public.crew_members cm where cm.id=crew_member_id and cm.auth_user_id=(select auth.uid())));
-- Candidate writes and decisions are service-role-only, through the Edge Function.

create table if not exists public.pilot_achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  icon text not null default 'award',
  rule_type text not null check(rule_type in ('approved_flights','approved_minutes','routes','night_flights','perfect_landings')),
  threshold integer not null check(threshold > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.crew_achievements (
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  achievement_id uuid not null references public.pilot_achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key(crew_member_id,achievement_id)
);
alter table public.pilot_achievements enable row level security;
alter table public.crew_achievements enable row level security;
drop policy if exists "Pilots can read enabled achievements" on public.pilot_achievements;
create policy "Pilots can read enabled achievements" on public.pilot_achievements for select to authenticated using(enabled);
drop policy if exists "Pilots can read own earned achievements" on public.crew_achievements;
create policy "Pilots can read own earned achievements" on public.crew_achievements for select to authenticated using
(exists(select 1 from public.crew_members cm where cm.id=crew_member_id and cm.auth_user_id=(select auth.uid())));

insert into public.pilot_achievements(code,name,description,icon,rule_type,threshold) values
('first-flight','First Flight','File your first approved flight','plane','approved_flights',1),
('ten-flights','Regular Flyer','Reach 10 approved flights','medal','approved_flights',10),
('fifty-flights','Veteran Pilot','Reach 50 approved flights','trophy','approved_flights',50),
('ten-hours','Ten Hours','Log 10 approved flight hours','clock','approved_minutes',600),
('fifty-hours','Fifty Hours','Log 50 approved flight hours','clock','approved_minutes',3000),
('hundred-hours','Century Club','Log 100 approved flight hours','award','approved_minutes',6000)
on conflict(code) do nothing;

create or replace view public.pilot_career_stats with (security_invoker=true) as
select cm.id as crew_member_id,
       count(p.id) filter(where p.status='approved')::integer as approved_flights,
       coalesce(sum(p.flight_time_minutes) filter(where p.status='approved'),0)::integer as approved_minutes,
       count(distinct (p.dep_icao || '-' || p.arr_icao)) filter(where p.status='approved' and p.dep_icao is not null and p.arr_icao is not null)::integer as unique_routes,
       round(avg(p.landing_rate_fpm) filter(where p.status='approved' and p.landing_rate_fpm is not null))::integer as avg_landing_rate_fpm
from public.crew_members cm left join public.pireps p on p.crew_member_id=cm.id
group by cm.id;
