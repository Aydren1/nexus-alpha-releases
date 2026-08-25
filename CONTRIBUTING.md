# Contributing to STARLADDER

STARLADDER is in active alpha development. Small, focused pull requests are the easiest to review and test.

## Development workflow

1. Create a branch from `main`.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Run the renderer with `pnpm run dev:web` or the desktop client with `pnpm run dev`.
4. Run `pnpm run build` before opening a pull request.
5. Describe the user-visible behavior, testing performed, and any database migration required.

## Database changes

- Add forward-only SQL files under `supabase/migrations/`.
- Keep row-level security enabled for user data.
- Never expose the service-role key to the renderer or commit it anywhere.
- Document any manual deployment or rollback considerations.

## Pull requests

- Preserve the existing cyan/navy STARLADDER visual system unless the change intentionally updates the brand.
- Do not add fabricated production users, matches, ratings, or chat messages.
- Keep desktop and browser-safe behavior aligned where practical.
- Include screenshots for visible UI changes, but remove personal information and authentication data.

By contributing, you confirm that you have the right to submit your changes. No open-source license has been granted for the repository yet.
