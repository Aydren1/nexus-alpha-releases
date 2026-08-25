# STARLADDER legacy compatibility

STARLADDER is the current and only public product name. A small number of internal `NEXUS` identifiers remain intentionally so existing alpha testers do not lose local data or verification compatibility after updating.

The retained identifiers are limited to:

- Previous Electron user-data and screenshot-settings folders, which are read and migrated when present.
- Previous local-storage keys and the established Supabase realtime channel key, which preserve signed-in sessions, preferences, parties, chat history, and seen-state data across the rename.
- The previous `NEXUS-` RSI bio-code prefix, accepted alongside the current `SL-` prefix so an in-progress verification is not invalidated.
- Historical database migration text that replaces the former name in already-deployed function definitions.
- Existing `NX-` match and event identifiers, which remain valid while all newly generated identifiers use `SL-`.
- Portable-release verification checks that confirm the legacy migration paths remain supported.

These identifiers are not displayed as current branding and must not be used for new public assets, documentation, release names, executable names, or repository metadata.
