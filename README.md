# DevDocs Copilot

Turns a public GitHub repository into a browsable, semantically searchable
source library. Phase 2 chunks source files and stores OpenAI
`text-embedding-3-small` vectors through OpenRouter in Supabase pgvector.

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. In the SQL editor, run these migrations in order:
   - [`supabase/migrations/001_repos_and_files.sql`](supabase/migrations/001_repos_and_files.sql)
   - [`supabase/migrations/002_chunks_and_vector_search.sql`](supabase/migrations/002_chunks_and_vector_search.sql)
3. Copy env vars:

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; used to write ingested files)
- `GITHUB_TOKEN` (optional, but recommended — unauthenticated GitHub access is 60 requests/hour)
- `OPENROUTER_API_KEY` (required for indexing and semantic search)

4. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to test Phase 2

1. Paste a **small public repo**, such as `octocat/Hello-World` or `sindresorhus/is`.
2. Wait for ingest and embedding generation to finish. You should land on `/repos/{owner}/{name}`.
3. Confirm:
   - Status badge is `ready`
   - File count is greater than 0
   - Chunk count is greater than 0
   - The left tree lists source files
   - Clicking a file shows its contents
4. Search using a concept rather than an exact identifier, such as “where are
   errors handled?” Results should include paths, line ranges, and similarity
   scores.
5. Click a result and confirm the corresponding file opens.
6. Ingest the same URL again. Stored files and chunks should be replaced, not
   duplicated.
7. Try an invalid URL and a private/missing repo. You should see a clear error
   on the home page.

Avoid huge repos for the first test (`vercel/next.js` will hit the 250-file cap and many GitHub API calls).

## What is implemented

- Parses `https://github.com/owner/repo` or `owner/repo`
- Fetches the default-branch tree and blob contents from the GitHub REST API
- Skips binaries, vendor folders, lockfiles, and files over 200KB
- Stores at most 250 files in Postgres
- Lets you browse the ingested snapshot
- Splits source into overlapping, line-aware chunks
- Generates 1,536-dimensional embeddings through OpenRouter
- Stores vectors in Supabase pgvector with an HNSW cosine index
- Performs repository-scoped semantic similarity search

## Next (not built)

- Phase 3: chat with source citations
- Phase 4: jump from a citation to the matching line
