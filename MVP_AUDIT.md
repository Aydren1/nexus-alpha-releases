# NEXUS desktop MVP audit

Audit date: 2026-08-20

## Shared alpha backend implemented

- Optional Supabase cloud mode with local-mode fallback when cloud configuration is absent
- Supabase Auth registration, sign-in, session restoration and sign-out
- Server-side RSI dossier verification with attempt rate limiting and globally unique verified handles
- PostgreSQL schema and row-level security for profiles, ratings, chat, parties, queues, matches, disputes, tournaments, registrations, circuit points and notifications
- Realtime public channels, cloud avatars, join-code parties, captain roster controls and server-backed queue entries
- Lightweight equal-roster matchmaking scheduled once per minute
- Cloud weekly registration, ranked standings and circuit leaderboard
- Recurring weekly tournament creation and automatic undisputed match approval jobs

These paths compile and are integrated into the desktop client. End-to-end multi-user cloud validation begins after the migration and Edge Functions are deployed to the owner's Supabase project.

## Working in the desktop MVP

### Local match evidence

- First-run setup registers a user-selected global screenshot hotkey and requires a successful local test capture
- Full-display PNG captures are stored under the user's `Pictures\\NEXUS\\Captures` folder and associated with the active match ID when available
- Match Center exposes local previews, folder access, hotkey reconfiguration and dispute-time review; files are never uploaded automatically

### Account and identity

- Registration and sign-in presentation with validation
- Mandatory RSI Citizen Dossier verification flow
- Unique bio-code generation, copy control, timeout recovery and actionable errors
- Electron-side public dossier check without requesting RSI credentials
- Verified RSI handle used as the public NEXUS name
- Sign-out and persistent local prototype session

### Profile

- Profile drawer with verified handle and email
- PNG, JPG, WebP and GIF source selection up to 20 MB
- Automatic centered square crop and optimization to 768 × 768 WebP
- Large preview, removal, validation and persistence

### Matchmaking and parties

- Exactly three ranked formats: 1v1, 3v3 and 5v5
- One-click operation cards immediately enter 1v1, 3v3 or 5v5 matchmaking when the roster contains exactly 1, 3 or 5 pilots
- Queue cancellation, switching safeguards, elapsed state and clear incomplete-roster feedback
- Persistent party roster, captain identity, invitations, removal and party code copy
- Format-specific party limits and queue-as-party behavior
- Party Finder listings that add compatible pilots to the roster
- Queue preference persistence

### Communication

- General, looking-for-crew and tournament channels
- Direct-message surfaces from the online friends list
- Button and Enter-to-send behavior
- Persistent local message history

### Matches

- Active, upcoming, completed and dispute tabs
- Match history filters
- Match room details and ranked rules
- Result confirmation, automatic-approval presentation and dispute state
- Rating freeze explanation during disputes

### Competition and community

- Tournament discovery and region filter
- Tournament details, local registration and tournament-draft creation
- Recurring weekly event calculation for Friday 1v1, Saturday 3v3 and Sunday 5v5 at 8:00 PM Eastern
- Live next-event dates/countdowns and exact 1/3/5-player roster eligibility
- Persistent local weekly registration state and automatic registration/check-in/bracket/standings flow presentation
- Dedicated weekly circuit leaderboard with five ranked entries and a visible points key
- Ranked format, region and season filters
- Organization directory search, command views, applications and local organization creation
- Mission tracking persistence and season reward preview

### Desktop utilities

- Global search and Ctrl+K shortcut
- Escape closes active overlays and drawers
- Notifications and mark-all-read
- Settings persistence
- Support-ticket creation and local tracking
- Credit wallet and local cosmetic redemption
- Native Windows title bar for moving, resizing, snapping and multi-monitor use
- Stable desktop shortcut with dependency refresh after updates

## Regression checks completed

- TypeScript and Vite production build
- Electron main/preload syntax
- PowerShell launcher syntax
- Primary navigation and three ranked queue cards
- Global search, settings save and support-ticket creation
- Match tabs and rules
- Tournament-draft creation
- Weekly event date rollover, roster gating and registration persistence
- Three-card weekly circuit layout and five-row circuit leaderboard
- Rankings filter
- Organization search and command view
- Mission tracking and reward display
- Party Finder join and roster counter
- Party creation, invitation, roster limit and team queue entry
- Chat channel switching, send button and Enter-to-send
- 19.4 MB source avatar processing, preview and persistence
- Runtime console: zero warnings and zero errors during the final browser audit

## Requires the production backend

The following cannot become real multi-user behavior through a local-only desktop renderer:

- Shared registration, secure password hashing, email verification and account recovery
- Cloud sessions and device management
- Globally unique RSI-account enforcement
- Live users, friends, presence and blocks
- Realtime party invitations, ready states and captain synchronization
- Authoritative matchmaking and queue workers
- Cross-user chat, moderation and message delivery
- Shared tournaments, scheduled registration opening, authoritative check-in, bracket generation and organizer permissions
- Shared organizations, applications and membership roles
- Durable match submissions, evidence storage, automatic approval jobs and moderator cases
- Authoritative Elo, weekly circuit points, leaderboards, missions, entitlements and credits
- Push notifications, email delivery, analytics and administration

The target database and service design for these capabilities is defined in `BACKEND_ARCHITECTURE.md`.
