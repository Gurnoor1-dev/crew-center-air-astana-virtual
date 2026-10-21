# Air Astana Virtual — Crew Center KCVA

A responsive crew workspace for Air Astana Virtual. Built with React, Vite, TypeScript and Supabase.

## Features
- Persistent workspace navigation: Dashboard, Logbook, File PIREP, Leaderboard, Events, Fleet, Tracker and backend-authorised Admin.
- Separate `/profile` page, account menu, System / Light / Dark theme and in-app refresh.
- Flight-time totals and rank derived only from approved PIREPs.
- Supabase-backed profile and PIREP reads/writes when configured.
- DM Serif Display headings and Plus Jakarta Sans interface typography.

## Local development
1. Install Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Apply `supabase/migrations/202610210001_kcva_crew_center.sql` to the Air Astana Virtual Supabase project.
4. Run `npm run dev`; run `npm run build` before deployment.

Never put a Supabase service-role/secret key in a browser environment variable. Staff access must be provisioned through trusted backend/database administration; never allow a pilot to grant themselves admin access.

## Integration notes
The app expects Supabase Auth to establish a session and a matching `crew_members.auth_user_id`. Live Infinite Flight tracking, Discord bot events, and staff PIREP review actions require their server-side credentials/endpoints and are not simulated as live data. Demo rows are illustrative only until the database is connected.
