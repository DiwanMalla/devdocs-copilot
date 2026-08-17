-- Phase 2 schema: source chunks and 1,536-dimensional semantic search.

create extension if not exists vector with schema extensions;

alter table public.repos
  add column if not exists chunk_count integer not null default 0;

alter table public.repos
  drop constraint if exists repos_status_check;

alter table public.repos
  add constraint repos_status_check
  check (status in ('pending', 'ingesting', 'indexing', 'ready', 'failed'));

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  start_line integer not null check (start_line >= 1),
  end_line integer not null check (end_line >= start_line),
  content text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (file_id, chunk_index)
);

create index if not exists chunks_repo_id_idx on public.chunks (repo_id);
create index if not exists chunks_file_id_idx on public.chunks (file_id);
create index if not exists chunks_embedding_hnsw_idx
  on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.chunks enable row level security;

-- Embeddings are server-owned and are not exposed through direct table reads.
grant all on table public.chunks to service_role;

create or replace function public.match_chunks(
  query_embedding extensions.vector(1536),
  match_repo_id uuid,
  match_threshold real,
  match_count integer
)
returns table (
  chunk_id uuid,
  file_id uuid,
  path text,
  language text,
  start_line integer,
  end_line integer,
  content text,
  similarity real
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    chunks.id as chunk_id,
    chunks.file_id,
    files.path,
    files.language,
    chunks.start_line,
    chunks.end_line,
    chunks.content,
    (
      1 - (
        chunks.embedding OPERATOR(extensions.<=>) query_embedding
      )
    )::real as similarity
  from public.chunks
  join public.files on files.id = chunks.file_id
  where chunks.repo_id = match_repo_id
    and 1 - (
      chunks.embedding OPERATOR(extensions.<=>) query_embedding
    ) >= match_threshold
  order by chunks.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer
) from public;

grant execute on function public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer
) to anon, authenticated, service_role;
