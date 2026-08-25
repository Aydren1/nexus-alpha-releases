# STARLADDER product map

This map translates the major FACEIT product surfaces into an original Star Citizen competitive desktop client. It tracks functional parity, not FACEIT branding, artwork, source code, or proprietary anti-cheat technology.

## 1. Identity and onboarding

- Account creation, login, session recovery, and age/region requirements
- Star Citizen handle verification and RSI account linking
- Launcher and installation detection
- Region, language, timezone, and notification preferences
- Player profile, banner, avatar, badges, friends, follows, blocks, and privacy
- Separate ratings and statistics for Arena Duel, Squadron Battle, Marine FPS, racing, and future modes

## 2. Matchmaking and parties

- Public ranked and unranked queues
- Queue rules, eligibility, region, party-size, trust, subscription, and rating requirements
- Solo, duo, full-party, and role-aware matchmaking
- Ready checks, queue cooldowns, dodge and no-show handling
- Party creation, invitations, captain transfer, kick, privacy, party chat, and party voice
- Party Finder listings with skill, language, role, region, and play-style filters
- Match balancing, map/scenario veto, sides, roster lock, and match-room creation

## 3. Match rooms and verification

- Platform match ID generated before play
- Associated Star Citizen match/session ID
- Rosters, captain controls, rules, server/region details, live chat, and voice
- Result submission with score, outcome, notes, screenshot, and video evidence
- Opponent confirmation or automatic approval after a configured dispute window
- Immediate review when submissions conflict
- Frozen Elo, brackets, standings, and rewards during a dispute
- Moderator verdicts, reversals, rating recalculation, penalties, and immutable audit history
- Trust-weighted approval windows and escalating penalties for fraudulent reports

## 4. Competition

- Player and team Elo, placement matches, skill tiers, seasons, decay, and provisional ratings
- Global, regional, country, organization, friend, and mode leaderboards
- Tournaments with discovery, filters, solo/party/team entry, check-in, seeding, brackets, substitutes, and prizes
- Automated weekly STARLADDER circuit: Friday 1v1, Saturday 3v3, Sunday 5v5, recurring registration, check-in, bracket generation, and circuit points
- Leagues with divisions, schedules, standings, promotion, and relegation
- Ladders, leaderboards, daily events, championships, and invitationals
- Organizer tooling, tournament admins, rulebooks, announcements, and participant communication

## 5. Teams, organizations, clubs, and hubs

- Persistent teams with roster, captain, coach, analyst, logo, banner, and history
- Organization linking through Spectrum ID
- Organization roles, recruitment, feed, members, rules, channels, internal leaderboards, and events
- Public/private community queues with custom requirements and moderation
- Organization-versus-organization clashes and seasonal standings
- Invitations, applications, bans, role permissions, and audit logs

## 6. Social and communication

- Friends, follows, online presence, recent teammates, suggested players, and blocking
- Direct messages, party chat, match chat, organization channels, and tournament channels
- Text, emoji, image attachments, mentions, unread counts, and moderation controls
- Party/match voice, push-to-talk, mute, deafening, device selection, and connection health
- Desktop, tray, sound, email, and optional Discord notifications

## 7. Progression and engagement

- Daily, weekly, seasonal, and sponsored missions
- Season XP, levels, badges, banners, titles, frames, and profile customization
- Win streaks, activity streaks, achievements, records, and match highlights
- Premium membership, organizer plans, subscriber-only queues, and cosmetic rewards
- News, events, patch notes, promotional campaigns, and referral programs

## 8. Trust, safety, and support

- Player reports, match disputes, cheating/griefing allegations, and evidence handling
- Automated sanctions for dodges, no-shows, AFK behavior, verbal abuse, and result fraud
- Warning, cooldown, ban, appeal, pardon, and sanction-history systems
- Moderator console, case assignment, internal notes, saved responses, and escalation
- Support tickets, status page, FAQs, known issues, and incident communication
- Trust scores and verified-player status
- Anti-cheat is a separate long-term integration and requires strict CIG/legal review

## 9. Desktop platform

- Signed Windows installer, uninstall, auto-update, release channels, and rollback
- System tray, run-at-startup, deep links, desktop notifications, and protocol handlers
- RSI Launcher detection and safe launch handoff
- Permitted local log/event monitoring with explicit consent
- Crash reporting, diagnostics bundle, connection status, and self-repair
- Hardware acceleration controls, accessibility, localization, and low-bandwidth mode
- Optional overlay only after technical, anti-cheat, and policy validation

## 10. Operations and administration

- Admin dashboard, roles and permissions, feature flags, announcements, and maintenance mode
- Queue health, matchmaking metrics, dispute SLAs, sanction metrics, and moderation quality
- Ratings jobs, season rollover, tournament workers, notifications, and audit retention
- Payments, entitlements, refunds, prize verification, tax/compliance, and fraud controls
- Privacy exports/deletion, consent, retention, terms, code of conduct, and regional compliance

## Delivery phases

### Phase 1 — Interactive desktop foundation (started)

Navigation shell, account onboarding, RSI bio-code ownership verification, 1v1/3v3/5v5 ranked matchmaking, persistent parties with team queueing, working local chat, large-source optimized custom avatars, match center, automatic approval/dispute workflow, tournament creation and registration, automated Friday/Saturday/Sunday weekly circuit scheduling, local circuit registration and leaderboard, interactive rankings, organizations, missions, support, settings, notifications, search, and social presence.

### Phase 2 — Real product core

Authentication, PostgreSQL schema, realtime API, persistent profiles, parties, queues, matchmaking, match rooms, results, disputes, and rating updates.

### Phase 3 — Competitive operations

Tournament engine, organization tools, moderation console, evidence storage, notifications, season progression, and organizer administration.

### Phase 4 — Desktop integration and release

RSI linking, launcher detection, permitted local signals, installer signing, updater, telemetry controls, crash recovery, and production deployment.
