# STARLADDER account storage architecture

The invitation-only alpha implementation is contained in `supabase/migrations/202608200001_alpha_core.sql`, `supabase/functions`, and `src/lib/backend.ts`. It follows the target PostgreSQL design below while retaining a local desktop fallback until the hosted project is configured.

## Current prototype

The desktop prototype stores only this record in the renderer's local storage:

```json
{
  "email": "pilot@example.com",
  "handle": "VerifiedRSIHandle",
  "verified": true,
  "verifiedAt": "2026-08-20T02:00:00.000Z"
}
```

The password currently exists only in temporary React form state and is not saved. Local storage is not the production account system; it exists solely so the UI remains unlocked between development launches.

## Production storage

The production service should use managed PostgreSQL as the authoritative database. The desktop client receives an opaque, short-lived session and never receives database credentials or stores password hashes.

### Core account tables

#### `users`

- `id` — UUID primary key
- `email_normalized` — unique login identifier
- `email_verified_at`
- `status` — pending, active, suspended, banned, deleted
- `created_at`, `updated_at`, `last_login_at`

#### `user_credentials`

- `user_id` — unique foreign key
- `password_hash` — Argon2id hash only; never plaintext or reversible encryption
- `password_changed_at`
- `failed_attempts`, `locked_until`

This table may be replaced with a managed identity provider. Social login identities belong in a separate `user_identities` table.

#### `star_citizen_accounts`

- `id` — UUID primary key
- `user_id` — unique foreign key so one user has one linked RSI identity
- `handle`
- `handle_normalized` — globally unique, case-insensitive ownership constraint
- `citizen_record_number` — optional public dossier value when available
- `profile_url`
- `verified_at`, `last_reverified_at`
- `verification_method` — initially `public_bio_code`
- `link_status` — pending, verified, stale, revoked

The verified `handle` is the player's public STARLADDER name everywhere. STARLADDER does not support a separate competitive callsign.

#### `rsi_verification_challenges`

- `id`, `user_id`
- `code_hash` — store a hash of the issued bio code
- `expires_at`, `attempt_count`, `last_attempt_at`
- `completed_at`, `created_at`

Codes should expire, be single-use, rate-limited, and replaced whenever verification is restarted.

#### `sessions`

- `id`, `user_id`
- `refresh_token_hash`
- `device_id`, `device_name`, approximate IP/region metadata
- `created_at`, `last_used_at`, `expires_at`, `revoked_at`

The desktop credential store should contain only the refresh token, protected with Windows Credential Manager/DPAPI. Access tokens should remain short-lived and in memory.

#### `profiles`

- `user_id`
- region, language, timezone, avatar/banner selections, biography, privacy and notification preferences

This table contains STARLADDER preferences; it cannot override the verified RSI handle.

#### `account_audit_log`

- actor, account, action, timestamp, request/correlation ID, safe metadata
- append-only records for verification, login, security changes, sanctions, appeals and administrative access

## Supporting systems

- **Redis:** session/rate-limit caches, queue presence and short-lived verification locks—not authoritative account storage.
- **Object storage:** avatars, match evidence and moderation attachments with private buckets and signed URLs.
- **Secrets manager:** database credentials, signing keys and service secrets; never source control or client builds.
- **Encrypted backups:** point-in-time database recovery with tested restoration and defined retention.

## Weekly tournament automation

The production service should store recurring circuit definitions, generated tournament instances, registrations, check-ins, brackets, match assignments, results, and point-ledger entries in PostgreSQL. A durable job worker should generate the Friday 1v1, Saturday 3v3, and Sunday 5v5 events in the configured Eastern timezone, open registration, enforce exact roster sizes, run check-in, seed brackets, create match rooms, and update the circuit leaderboard idempotently after verified results. The desktop client should display server timestamps and authoritative standings rather than calculate shared tournament state locally.

## Registration sequence

1. Create an inactive user and an expiring email-verification challenge.
2. Verify the email.
3. Create a unique RSI bio-code challenge.
4. Read `https://robertsspaceindustries.com/citizens/{handle}` server-side.
5. Confirm the exact code appears in the public Bio.
6. In one database transaction, enforce the unique RSI handle, mark it verified and activate the user.
7. Issue the desktop session and record the verification audit event.

## Security and privacy requirements

- Never request or store RSI passwords, cookies or authentication tokens.
- Normalize email and RSI handles before uniqueness checks.
- Encrypt connections and sensitive columns; hash passwords with Argon2id.
- Rate-limit registration, login, dossier lookup and recovery endpoints.
- Require email confirmation for recovery and sensitive account changes.
- Reverify an RSI identity when the handle changes or suspicious ownership activity occurs.
- Provide session revocation, account export and account deletion workflows.
- Keep public profile information separate from private identity, security and moderation data.
- Define retention periods for logs, sessions, deleted accounts and match evidence.
