alter table public.va_events add column if not exists created_by uuid references public.crew_members(id) on delete set null;
create index if not exists va_events_status_starts_idx on public.va_events(status, starts_at);
