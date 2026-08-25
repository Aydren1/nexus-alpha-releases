# STARLADDER

Windows-first competitive matchmaking and tournament client for Star Citizen. Version `0.5.0-alpha.8.0` adds creator-owned channel moderation with posting timeouts, kicks, delegated channel admins, and prominent channel deletion controls. It retains invite-only personal and organization channels, live tournament brackets, and separate Ranked and Unranked 1v1, 3v3, and 5v5 pools.

[Download the current alpha](../../releases) · [Report a bug](../../issues) · [Security policy](./SECURITY.md)

> STARLADDER is an independent community project and is not affiliated with or endorsed by Cloud Imperium Games. Star Citizen and related marks belong to their respective owners.

Alpha releases use revision numbers for small changes: UI, styling, and minor behavior fixes advance `7.1`, `7.2`, and so on. Only major features or substantial system changes advance the main alpha number to `8`, `9`, and beyond.

## Current prototype

- Electron desktop shell with a custom title bar
- Account registration/sign-in onboarding and persistent local prototype sessions
- Mandatory Star Citizen ownership verification using a unique RSI profile bio code
- Verified RSI handle used as the player's only public STARLADDER name
- Electron-side lookup of the public RSI Citizen Dossier; RSI credentials are never requested
- Play dashboard with exactly three ranked formats: 1v1, 3v3, and 5v5
- Queue selection, join, elapsed-time state, and cancellation
- Functional persistent parties with captain controls, join-code invitations/removal, mode-specific roster limits, and team queueing
- Account-scoped Match Center with live platform and Star Citizen match IDs when available
- Automatic result approval and dispute records backed by the alpha database
- Live tournament discovery, rankings, social presence, and shared channel chat; unfinished organization and mission services use explicit empty states
- Automated weekly circuit: Friday 1v1, Saturday 3v3, and Sunday 5v5 at 8:00 PM Eastern
- Persistent weekly event registration with exact party-size eligibility, live countdowns, automation stages, and a dedicated circuit leaderboard
- Working local channel/direct-message chat with Enter-to-send and persistent history
- Custom profile avatar sources up to 20 MB with automatic 768 × 768 cropping, optimization, preview, removal, validation, and persistence
- Responsive desktop layout and production Vite build
- Supabase alpha schema, row-level security, authentication, shared chat, join-code parties, queue entries, lightweight matchmaking, recurring tournament jobs, cloud standings, and avatar storage
- One-time global screenshot hotkey setup with collision checks, an in-app capture test, and durable device-level persistence shared by development and packaged builds
- Full-resolution local PNG evidence organized under `Pictures\\STARLADDER\\Captures`, linked to active matches, previewable in Match Center, and never uploaded automatically
- Persistent notification read state and an eye-friendly pure-black night theme
- Shared browser build with PWA metadata and browser-safe evidence selection
- One-click operation cards that immediately queue exact-size 1v1, 3v3 and 5v5 rosters

## Run locally

### Requirements

- Windows 10 or Windows 11 for the complete Electron and screenshot-capture workflow
- Node.js 22 or newer
- pnpm 10
- A Supabase project only when testing shared cloud features; local fallback mode works without one

Clone the repository, copy `.env.example` to `.env.local` if you have a Supabase development project, then run:

```powershell
pnpm install
pnpm run dev
```

Never place a Supabase service-role key or another secret in a `VITE_` variable. Vite renderer variables are bundled into public client code. Only the project URL and publishable/anonymous client key belong in `.env.local`.

`pnpm run dev` intentionally keeps a Vite console open and is reserved for development. The desktop shortcut launches the packaged `STARLADDER.exe` directly so players see only the application window.

For the browser-only renderer during UI development:

```powershell
pnpm run dev:web
```

Build the production renderer with `pnpm run build`. Create a portable Windows x64 release with `pnpm run release:windows`; the resulting ZIP is written to `release/` and launches through `STARLADDER.exe` after extraction.

The permanent Windows shortcut launches `release/STARLADDER-Desktop-win32-x64/STARLADDER.exe`. Rebuilding the release updates that same target without requiring a new shortcut. [Start-STARLADDER.ps1](./Start-STARLADDER.ps1) remains available for development work that needs the live Vite server.

The current workspace is connected to the shared cloud alpha through the ignored `.env.local` file. If those public values are absent on another development machine, the app falls back to local alpha mode. See [ALPHA_DEPLOYMENT.md](./ALPHA_DEPLOYMENT.md) for deployment and recovery details, and [WEB_PLATFORM_PLAN.md](./WEB_PLATFORM_PLAN.md) for the shared website architecture.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | React interface, matchmaking flows, and Supabase client integration |
| `electron/` | Desktop shell, single-instance behavior, native notifications, and local screenshot capture |
| `supabase/` | Database migrations and server-side Edge Functions |
| `public/` | Web/PWA metadata and versioned STARLADDER artwork |
| `scripts/` | Windows packaging, portable-release verification, and logo-asset generation |
| `build/` | Native multi-resolution Windows icon consumed by Electron Packager |

Intentional references to the former product name remain only where required to migrate existing alpha settings, sessions, capture folders, and verification codes. See [LEGACY_COMPATIBILITY.md](./LEGACY_COMPATIBILITY.md) for the audited list.

## Contributing and security

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Do not commit `.env.local`, passwords, access tokens, service-role keys, private messages, player evidence screenshots, or generated release packages. Sensitive vulnerabilities should be reported using [SECURITY.md](./SECURITY.md), not a public issue.

Run `pnpm run verify:public-source` before publishing. The same check runs in CI and rejects tracked developer-home paths, Codex runtime paths, hard-coded repository-owner URLs, live Supabase project URLs, and common private-key or token formats.

The source is published for project transparency. No open-source license has been granted yet; all rights are reserved unless a license is added later.

## Product direction

See [PRODUCT_MAP.md](./PRODUCT_MAP.md) for the FACEIT-parity inventory, [MVP_AUDIT.md](./MVP_AUDIT.md) for the tested working-state audit, and [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) for the production account-storage design.
