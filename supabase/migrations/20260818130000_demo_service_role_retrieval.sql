-- Allow the trusted service-role client to retrieve demo (and other
-- server-side) chunks. Authenticated callers still require repos.user_id =
-- auth.uid(). EXECUTE stays revoked from anon.

create or replace function public.match_chunks(
  query_embedding extensions.vector(1536),
  match_repo_id uuid,
  match_threshold real,
  match_count integer,
  match_snapshot_id uuid default null
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
  join public.repos on repos.id = chunks.repo_id
  where chunks.repo_id = match_repo_id
    and (
      repos.user_id = (select auth.uid())
      or coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
    )
    and chunks.snapshot_id = coalesce(match_snapshot_id, repos.active_snapshot_id)
    and 1 - (
      chunks.embedding OPERATOR(extensions.<=>) query_embedding
    ) >= match_threshold
  order by chunks.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 40);
$$;

create or replace function public.search_chunks_lexical(
  match_repo_id uuid,
  match_query text,
  match_count integer,
  match_snapshot_id uuid default null
)
returns table (
  chunk_id uuid,
  file_id uuid,
  path text,
  language text,
  start_line integer,
  end_line integer,
  content text,
  rank real
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
    ts_rank_cd(chunks.fts, websearch_to_tsquery('simple', match_query))::real as rank
  from public.chunks
  join public.files on files.id = chunks.file_id
  join public.repos on repos.id = chunks.repo_id
  where chunks.repo_id = match_repo_id
    and (
      repos.user_id = (select auth.uid())
      or coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
    )
    and chunks.snapshot_id = coalesce(match_snapshot_id, repos.active_snapshot_id)
    and chunks.fts @@ websearch_to_tsquery('simple', match_query)
  order by rank desc
  limit least(greatest(match_count, 1), 40);
$$;

revoke all on function public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer,
  uuid
) from public, anon;

revoke all on function public.search_chunks_lexical(
  uuid,
  text,
  integer,
  uuid
) from public, anon;

grant execute on function public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer,
  uuid
) to authenticated, service_role;

grant execute on function public.search_chunks_lexical(
  uuid,
  text,
  integer,
  uuid
) to authenticated, service_role;
