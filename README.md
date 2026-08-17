# DevDocs Copilot

Turns a public GitHub repository into a browsable, semantically searchable
source library with grounded question answering. Source files are embedded with
OpenAI `text-embedding-3-small` through OpenRouter and answers are generated
from retrieved repository chunks.

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

## How to test Phase 3

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
6. Ask a repository question in the chat. The answer should contain exact
   `[path:Lstart-Lend]` citations from retrieved chunks.
7. Click a citation. The matching file should open, scroll to the cited range,
   and highlight those lines. The external-link button opens the same range on
   GitHub.
8. Ask about something absent from the repository. The assistant should report
   that it could not find enough evidence instead of inventing an answer.
9. Ingest the same URL again. Stored files and chunks should be replaced, not
   duplicated.
10. Try an invalid URL and a private/missing repo. You should see a clear error
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
- Answers repository questions with `openai/gpt-oss-20b:free`
- Restricts answers to retrieved context and normalizes citations to exact
  stored file/line ranges
- Makes chat citations and semantic-search results navigate to highlighted
  source ranges
- Links highlighted ranges to the exact GitHub commit

## Possible next improvements

- Persist chat history
- Add authentication and usage limits
- Support private repositories
