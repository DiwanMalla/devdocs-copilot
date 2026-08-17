-- Phase 5: authenticated ownership, persistent chats, and private RLS.

create extension if not exists pgcrypto with schema extensions;

alter table public.repos
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.repos
  add column if not exists last_indexed_at timestamptz;

do $$
declare
  demo_id constant uuid := '00000000-0000-4000-8000-0000000000d1';
  demo_email constant text := 'demo@devdocs-copilot.local';
  auth_instance uuid;
begin
  select coalesce(
    (select instance_id from auth.users limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  )
  into auth_instance;

  if not exists (select 1 from auth.users where id = demo_id) then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      auth_instance,
      demo_id,
      'authenticated',
      'authenticated',
      demo_email,
      extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"system_demo":true}'::jsonb,
      '{"system_demo":true}'::jsonb,
      now(),
      now()
    );
  end if;

  if not exists (
    select 1
    from auth.identities
    where user_id = demo_id
      and provider = 'email'
  ) then
    insert into auth.identities (
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      demo_id,
      jsonb_build_object(
        'sub', demo_id::text,
        'email', demo_email
      ),
      'email',
      demo_id::text,
      now(),
      now(),
      now()
    );
  end if;

  update public.repos
  set user_id = demo_id
  where user_id is null;
end
$$;

update public.repos
set last_indexed_at = updated_at
where last_indexed_at is null
  and status = 'ready';

alter table public.repos
  alter column user_id set not null;

alter table public.repos
  drop constraint if exists repos_owner_name_key;

drop index if exists public.repos_owner_name_idx;

alter table public.repos
  drop constraint if exists repos_user_owner_name_key;

alter table public.repos
  add constraint repos_user_owner_name_key unique (user_id, owner, name);

create index if not exists repos_user_id_idx on public.repos (user_id);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  repo_id uuid not null references public.repos (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_user_id_idx on public.chats (user_id);
create index if not exists chats_repo_id_idx on public.chats (repo_id);
create index if not exists chats_repo_updated_idx on public.chats (repo_id, updated_at desc);

drop trigger if exists chats_set_updated_at on public.chats;
create trigger chats_set_updated_at
  before update on public.chats
  for each row
  execute function public.set_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_chat_id_idx on public.messages (chat_id, created_at);

alter table public.chats enable row level security;
alter table public.messages enable row level security;

drop policy if exists repos_select_public on public.repos;
drop policy if exists files_select_public on public.files;

drop policy if exists repos_select_own on public.repos;
create policy repos_select_own
  on public.repos
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists repos_insert_own on public.repos;
create policy repos_insert_own
  on public.repos
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists repos_update_own on public.repos;
create policy repos_update_own
  on public.repos
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists repos_delete_own on public.repos;
create policy repos_delete_own
  on public.repos
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists files_select_own on public.files;
create policy files_select_own
  on public.files
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.repos
      where repos.id = files.repo_id
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
      select 1
      from public.repos
      where repos.id = chunks.repo_id
        and repos.user_id = auth.uid()
    )
  );

drop policy if exists chats_select_own on public.chats;
create policy chats_select_own
  on public.chats
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.repos
      where repos.id = chats.repo_id
        and repos.user_id = auth.uid()
    )
  );

drop policy if exists chats_insert_own on public.chats;
create policy chats_insert_own
  on public.chats
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.repos
      where repos.id = chats.repo_id
        and repos.user_id = auth.uid()
    )
  );

drop policy if exists chats_update_own on public.chats;
create policy chats_update_own
  on public.chats
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists chats_delete_own on public.chats;
create policy chats_delete_own
  on public.chats
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chats
      where chats.id = messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
  on public.messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.chats
      where chats.id = messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own
  on public.messages
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.chats
      where chats.id = messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

revoke all on table public.chats from anon;
revoke all on table public.messages from anon;
revoke select on table public.repos from anon;
revoke select on table public.files from anon;
grant select, insert, update, delete on table public.repos to authenticated;
grant select on table public.files to authenticated;
grant select on table public.chunks to authenticated;
grant select, insert, update, delete on table public.chats to authenticated;
grant select, insert, delete on table public.messages to authenticated;
grant all on table public.chats to service_role;
grant all on table public.messages to service_role;

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
  join public.repos on repos.id = chunks.repo_id
  where chunks.repo_id = match_repo_id
    and repos.user_id = auth.uid()
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

revoke all on function public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer
) from anon;

grant execute on function public.match_chunks(
  extensions.vector,
  uuid,
  real,
  integer
) to authenticated, service_role;
