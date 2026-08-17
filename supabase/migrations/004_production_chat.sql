-- Phase 6: snapshots, durable chat generations, hybrid retrieval, and tighter RLS.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.repo_snapshots (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos (id) on delete cascade,
  commit_sha text not null,
  status text not null default 'pending'
    check (status in ('pending', 'indexing', 'ready', 'failed')),
  file_count integer not null default 0,
  chunk_count integer not null default 0,
  truncated boolean not null default false,
  capped boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  indexed_at timestamptz
);

create index if not exists repo_snapshots_repo_id_idx
  on public.repo_snapshots (repo_id, created_at desc);

alter table public.repos
  add column if not exists active_snapshot_id uuid references public.repo_snapshots (id) on delete set null;

alter table public.repos
  add column if not exists ingest_lock_until timestamptz;

alter table public.files
  add column if not exists snapshot_id uuid references public.repo_snapshots (id) on delete cascade;

alter table public.chunks
  add column if not exists snapshot_id uuid references public.repo_snapshots (id) on delete cascade;

insert into public.repo_snapshots (
  repo_id,
  commit_sha,
  status,
  file_count,
  chunk_count,
  indexed_at
)
select
  repos.id,
  coalesce(repos.commit_sha, 'unknown'),
  case when repos.status = 'ready' then 'ready' else 'failed' end,
  repos.file_count,
  repos.chunk_count,
  repos.last_indexed_at
from public.repos
where not exists (
  select 1 from public.repo_snapshots snapshots where snapshots.repo_id = repos.id
);

update public.repos
set active_snapshot_id = snapshots.id
from public.repo_snapshots snapshots
where snapshots.repo_id = repos.id
  and repos.active_snapshot_id is null
  and snapshots.status = 'ready';

update public.files
set snapshot_id = repos.active_snapshot_id
from public.repos
where files.repo_id = repos.id
  and files.snapshot_id is null
  and repos.active_snapshot_id is not null;

update public.chunks
set snapshot_id = files.snapshot_id
from public.files
where chunks.file_id = files.id
  and chunks.snapshot_id is null
  and files.snapshot_id is not null;

alter table public.files
  drop constraint if exists files_repo_id_path_key;

create unique index if not exists files_snapshot_path_idx
  on public.files (snapshot_id, path)
  where snapshot_id is not null;

alter table public.messages
  add column if not exists client_request_id text;

alter table public.messages
  add column if not exists status text not null default 'complete'
    check (status in ('pending', 'streaming', 'complete', 'cancelled', 'failed'));

alter table public.messages
  add column if not exists snapshot_id uuid references public.repo_snapshots (id) on delete set null;

alter table public.messages
  add column if not exists citations jsonb not null default '[]'::jsonb;

alter table public.messages
  add column if not exists error_code text;

alter table public.messages
  add column if not exists correlation_id text;

alter table public.messages
  add column if not exists model text;

create unique index if not exists messages_chat_request_idx
  on public.messages (chat_id, client_request_id)
  where client_request_id is not null and role = 'user';

alter table public.chats
  add column if not exists summary text;

create table if not exists public.chat_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.chat_usage enable row level security;
revoke all on table public.chat_usage from anon, authenticated;
grant all on table public.chat_usage to service_role;

create table if not exists public.ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos (id) on delete cascade,
  snapshot_id uuid not null references public.repo_snapshots (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  owner text not null,
  name text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists ingest_jobs_repo_id_idx on public.ingest_jobs (repo_id, created_at desc);

alter table public.repo_snapshots enable row level security;
alter table public.ingest_jobs enable row level security;

drop policy if exists snapshots_select_own on public.repo_snapshots;
create policy snapshots_select_own
  on public.repo_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1 from public.repos
      where repos.id = repo_snapshots.repo_id
        and repos.user_id = auth.uid()
    )
  );

drop policy if exists ingest_jobs_select_own on public.ingest_jobs;
create policy ingest_jobs_select_own
  on public.ingest_jobs
  for select
  to authenticated
  using (user_id = auth.uid());

grant select on table public.repo_snapshots to authenticated;
grant select on table public.ingest_jobs to authenticated;
grant all on table public.repo_snapshots to service_role;
grant all on table public.ingest_jobs to service_role;

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
  on public.messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'user'
    and exists (
      select 1 from public.chats
      where chats.id = messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

drop policy if exists chats_update_own on public.chats;
create policy chats_update_own
  on public.chats
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.repos
      where repos.id = chats.repo_id
        and repos.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.repos
      where repos.id = chats.repo_id
        and repos.user_id = auth.uid()
    )
  );

drop policy if exists chunks_select_own on public.chunks;
create policy chunks_select_own
  on public.chunks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.repos
      where repos.id = chunks.repo_id
        and repos.user_id = auth.uid()
    )
  );

revoke select on table public.chunks from authenticated;
grant select (id, repo_id, file_id, snapshot_id, chunk_index, start_line, end_line, content, created_at)
  on table public.chunks to authenticated;

alter table public.chunks
  add column if not exists fts tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists chunks_fts_idx on public.chunks using gin (fts);

drop function if exists public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer
);

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
    and repos.user_id = auth.uid()
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
    and repos.user_id = auth.uid()
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

grant execute on function public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer,
  uuid
) to authenticated, service_role;

revoke all on function public.search_chunks_lexical(
  uuid,
  text,
  integer,
  uuid
) from public, anon;

grant execute on function public.search_chunks_lexical(
  uuid,
  text,
  integer,
  uuid
) to authenticated, service_role;
