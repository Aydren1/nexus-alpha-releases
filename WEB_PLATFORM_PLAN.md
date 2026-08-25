# STARLADDER web platform plan

STARLADDER should remain one React application with two delivery shells:

- The web build is deployed as static assets and talks directly to the existing Supabase Auth, PostgreSQL, Realtime and Edge Functions.
- The Windows build packages the same compiled React client inside Electron and adds a small native bridge for global hotkeys, local screenshots, folder access and future auto-updates.

This avoids maintaining separate desktop and website products. Accounts, verified RSI handles, ratings, parties, queues, chat, tournaments, leaderboards, match rooms and notifications use the same backend records and realtime channels on both platforms.

## Recommended alpha hosting

Deploy `pnpm run build:web` to Cloudflare Pages with `dist` as the output directory. Configure only the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables. The repository includes the SPA redirect, security headers, web manifest and icon in `public/`.

Cloudflare Pages is a good fit for the expected few hundred users because static asset requests are free and the Free plan currently permits 500 builds per month. Official limits: https://developers.cloudflare.com/pages/platform/limits/

Continue using the existing Supabase project for accounts and competitive data. Its Free plan currently includes 50,000 monthly active users, 500 MB of database storage, 1 GB of file storage, 500,000 Edge Function calls and 200 peak Realtime connections. Official billing documentation: https://supabase.com/docs/guides/platform/billing-on-supabase

## Authentication configuration

Before publishing:

1. Add the production HTTPS domain as the Supabase Auth Site URL.
2. Add the production domain and Cloudflare preview domains to the allowed redirect list.
3. Enable email confirmation and a production SMTP provider before public registration.
4. Keep the publishable key in the web bundle and keep service-role keys only in Edge Functions.
5. Continue relying on row-level security for every browser-accessible table.

Desktop and web sessions are independent but represent the same Supabase user and verified RSI identity.

## Evidence capture difference

A normal website cannot register a system-wide shortcut or silently capture Star Citizen while another window has focus. This is a browser security boundary.

- Windows app: global hotkey, automatic full-display capture, local match-aware organization and later explicit upload.
- Website: the player uses Windows, Game Bar or another capture tool, then selects the screenshots in the STARLADDER match room.

Both paths should upload selected evidence through a short-lived signed upload URL to a private object bucket. Store only evidence metadata, uploader, match ID, checksum and review state in PostgreSQL. Cloudflare R2 is the recommended evidence bucket once uploads are connected; its Standard free tier currently includes 10 GB-month of storage, one million Class A operations and ten million Class B operations per month with free egress. Official pricing: https://developers.cloudflare.com/r2/pricing/

## Cross-platform work still required

- Move notification read timestamps and user settings from device-local storage into the existing profiles/notifications tables so they synchronize between web and desktop.
- Add durable match-result and evidence-submission endpoints, private R2 uploads, checksums and moderator access controls.
- Add responsive layouts below the current desktop-width breakpoint before advertising phone support.
- Add password recovery, production email delivery, blocking/reporting, rate limiting and audit logs.
- Add a signed Windows installer and auto-update channel while the web client deploys independently.

The website can launch before the signed installer, but public registration should remain invitation-only until moderation and evidence uploads are complete.
