# Air Astana Virtual Crew Center (KCVA)

A crew workspace for Air Astana Virtual with pilot profiles, PIREP submission and review, logbook, leaderboard, events, fleet management, and Infinite Flight live tracking. Built with React, TypeScript, Vite and Supabase.

## Requirements
- Node.js 18 or newer
- npm
- A Supabase project for authentication and backend functions

## Run locally
```bash
git clone https://github.com/Gurnoor1-dev/crew-center-air-astana-virtual.git
cd crew-center-air-astana-virtual
npm install
cp .env.example .env
npm run dev
```

On Windows, copy `.env.example` to `.env` manually. Fill in the public Supabase URL and anon key expected by the app. Never place a Supabase service-role key in frontend environment variables.

## Build and preview
```bash
npm run build
npm run preview
npm run lint
```

## Supabase setup
1. Create or select the Supabase project used by this app.
2. Deploy the project's Edge Functions and apply the SQL migrations/schema included in the repository, if present.
3. Configure required function secrets in Supabase, including `INFINITE_FLIGHT_API_KEY` for live traffic.
4. Confirm authentication redirect URLs and allowed origins match local and production URLs.

## Deploy from a terminal
Install the Vercel CLI and deploy from the repository root:

```bash
npm install -g vercel
vercel
vercel --prod
```

## Deploy on Vercel
1. Import this repository into Vercel and select Vite.
2. Use `npm install` as the install command and `npm run build` as the build command.
3. Set the output directory to `dist` if it is not auto-detected.
4. Add the public Supabase URL and anon key in Vercel Environment Variables.
5. Configure Supabase Edge Function secrets separately in Supabase; do not add service-role keys to Vercel's client-exposed variables.
6. Deploy a preview, test sign-in and PIREP workflows, and verify live tracking before production.

## Security
Never commit real `.env` files, service-role keys, bot tokens, or API secrets. Use `.env.example` only for placeholder names and example values.