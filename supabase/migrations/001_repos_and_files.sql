-- Phase 1 schema: ingested GitHub repositories and their source files.
-- Apply in the Supabase SQL editor (or `supabase db push` if the CLI is linked).

create table if not exists public.repos (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null,
  description text,
  default_branch text not null,
  commit_sha text,
  html_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'ingesting', 'ready', 'failed')),
  file_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, name)
);

create index if not exists repos_status_idx on public.repos (status);
create index if not exists repos_owner_name_idx on public.repos (owner, name);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos (id) on delete cascade,
  path text not null,
  language text,
  size_bytes integer not null,
  sha text not null,
  content text not null,
  unique (repo_id, path)
);

create index if not exists files_repo_id_idx on public.files (repo_id);
create index if not exists files_repo_id_path_idx on public.files (repo_id, path);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists repos_set_updated_at on public.repos;
create trigger repos_set_updated_at
  before update on public.repos
  for each row
  execute function public.set_updated_at();

alter table public.repos enable row level security;
alter table public.files enable row level security;

drop policy if exists repos_select_public on public.repos;
create policy repos_select_public
  on public.repos
  for select
  to anon, authenticated
  using (true);

drop policy if exists files_select_public on public.files;
create policy files_select_public
  on public.files
  for select
  to anon, authenticated
  using (true);

-- Writes go through the service role (bypasses RLS). Anon cannot insert/update/delete.
grant select on table public.repos to anon, authenticated;
grant select on table public.files to anon, authenticated;
grant all on table public.repos to service_role;
grant all on table public.files to service_role;
