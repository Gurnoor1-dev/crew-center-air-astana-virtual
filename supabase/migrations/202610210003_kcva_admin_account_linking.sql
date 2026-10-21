alter table public.registration_codes add column if not exists existing_crew_member_id uuid references public.crew_members(id) on delete restrict;
