<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- During productization/UI-polish phases, do not add backend, APIs, workers, queues, schema, auth, or CI/CD unless a critical bug fix.
- After CI lint or typecheck fixes, push to GitHub so checks rerun.
- Prefer explicit `bootstrap()` calls at server entry points over import side-effects.
- Keep the repository chat panel a fixed height; scroll the transcript inside the panel instead of growing the page.
- Public README should be recruiter-facing and implementation-accurate (CSP-safe diagrams; do not invent features or change app behavior just to match docs).
- Never lint generated Supabase temp files, never patch those files, and never loosen ESLint globally to silence CI.

## Learned Workspace Facts

- Next.js 16 App Router; request interception lives in `src/proxy.ts`, not `middleware.ts`.
- Backend is Supabase (Postgres + pgvector + RLS), not Convex; embeddings and chat go through OpenRouter.
- ESLint must ignore `supabase/.temp/**`, `supabase/.branches/**`, and `supabase/.output/**`.
- CI `tsc --noEmit` runs before Next typegen, so layout/page props must be explicit types—not generated `LayoutProps`/`PageProps`.
- Integration tests that `describe.skipIf` missing Supabase env must not call `createClient` at suite load; skip first so CI unit tests still pass.
- CSP should use `frame-src 'self'` (not `'none'`), include `object-src 'none'` and `upgrade-insecure-requests`, and allow `connect-src` for self, Supabase, OpenRouter, and GitHub API.
