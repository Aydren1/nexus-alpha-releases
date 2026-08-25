# NEXUS alpha deployment

This repository can connect to a Supabase project through the public project URL and publishable client key stored only in the ignored `.env.local` file. If those two values are absent, the desktop build deliberately falls back to local alpha mode.

## Expected deployment status

- Project URL: `https://YOUR_PROJECT_REF.supabase.co`
- Database migration applied: 15 public tables, 30 row-level-security policies and 3 scheduled jobs
- Weekly circuit seeded: Friday 1v1, Saturday 3v3 and Sunday 5v5
- Edge Functions deployed: `health` and `verify-rsi`
- Public health check validated on August 20, 2026
- Desktop client connected through the public publishable key; no database password or privileged key is bundled
- Portable Windows x64 build: `release/NEXUS-0.5.0-alpha.7.13-win-x64.zip`
- Exact 1/3/5-pilot ranked queue enforcement deployed to the live database on August 23, 2026

## What the alpha backend provides

- Supabase Auth accounts and persistent desktop sessions
- Unique verified RSI handles, server-side public dossier checks and rate-limited verification attempts
- PostgreSQL profiles, ratings, parties, queue entries, matches, disputes, weekly tournaments, registrations, circuit points and notifications
- Row-level security for every client-accessible table
- Shared channel chat over Supabase Realtime
- Shared parties using six-character join codes and captain-controlled rosters
- Lightweight scheduled matchmaking for equal-size parties in the same format and region
- Automatic Friday 1v1, Saturday 3v3 and Sunday 5v5 tournament generation in `America/New_York`
- Automatic approval of undisputed match results after their deadline
- Public avatar uploads through the `avatars` storage bucket
- Local screenshot evidence through an explicit global hotkey; PNG files remain on the player's PC unless a later submission flow is confirmed

## One-time cloud setup

The live alpha has already completed these steps. Keep them as recovery/redeployment instructions.

1. Create a free project at `https://database.new` and select the region closest to the initial testers.
2. Install or invoke the Supabase CLI and authenticate:

   ```powershell
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Apply the database migration and deploy the two functions:

   ```powershell
   pnpm dlx supabase db push
   pnpm dlx supabase functions deploy verify-rsi
   pnpm dlx supabase functions deploy health --no-verify-jwt
   ```

4. In Supabase **Project Settings → API**, copy the Project URL and publishable key. Copy `.env.example` to `.env.local` and replace the placeholders. Never use the secret or service-role key in this file.
5. Restart NEXUS from the permanent desktop shortcut. The lower-left connection tile should read **ALPHA CLOUD — Services connected**.

## Authentication settings

Email confirmation can remain disabled during a small invitation-only test. Before opening registration publicly, enable email confirmation and configure a custom SMTP provider. The desktop flow already handles a confirmation-required signup by asking the pilot to confirm the email and then sign in.

## Safe alpha operation

- Keep the Supabase spend cap enabled if the project is upgraded.
- Keep match evidence outside PostgreSQL. Cloudflare R2 is the intended evidence store when evidence upload is connected.
- Review RSI verification failures and database size weekly.
- Export the database regularly while using the free plan, which does not include automatic backups.
- Do not expose the Supabase secret key, database password, access tokens or refresh tokens in source control, support logs or desktop builds.

## Known alpha boundaries

- Public channel chat is cloud-backed; direct messages remain device-local until blocking/reporting controls are added.
- The lightweight matchmaker pairs equal-size entries by format and region. Rating-aware balancing and ready checks are the next matchmaking phase.
- Match-room result submission and moderator evidence review still use the current desktop presentation until their server endpoints are connected.
- Local captures are match-linked and reviewable, but the alpha does not yet upload evidence to R2 or submit files to moderators.
- R2 evidence uploads, transactional email, crash reporting, signed installers and auto-update publishing are release-hardening work, not blockers for an invitation-only alpha.
