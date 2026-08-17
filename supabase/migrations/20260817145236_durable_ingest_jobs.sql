-- Phase 7 P0: durable, leased, retryable repository indexing jobs.

alter table public.ingest_jobs
  add column if not exists attempt_count integer not null default 0
    check (attempt_count >= 0);

alter table public.ingest_jobs
  add column if not exists max_attempts integer not null default 3
    check (max_attempts > 0);

alter table public.ingest_jobs
  add column if not exists available_at timestamptz not null default now();

alter table public.ingest_jobs
  add column if not exists lease_owner uuid;

alter table public.ingest_jobs
  add column if not exists lease_expires_at timestamptz;

alter table public.ingest_jobs
  add column if not exists heartbeat_at timestamptz;

create unique index if not exists ingest_jobs_one_active_per_repo_idx
  on public.ingest_jobs (repo_id)
  where status in ('queued', 'running');

create index if not exists ingest_jobs_claim_idx
  on public.ingest_jobs (available_at, created_at)
  where status in ('queued', 'running');

create or replace function public.claim_ingest_job(
  p_worker_id uuid,
  p_lease_seconds integer default 360,
  p_job_id uuid default null
)
returns setof public.ingest_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.ingest_jobs%rowtype;
begin
  if p_worker_id is null then
    raise exception 'Worker ID is required';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Lease must be between 30 and 900 seconds';
  end if;

  select jobs.*
  into claimed
  from public.ingest_jobs jobs
  where jobs.attempt_count < jobs.max_attempts
    and (p_job_id is null or jobs.id = p_job_id)
    and (
      (jobs.status = 'queued' and jobs.available_at <= now())
      or
      (
        jobs.status = 'running'
        and jobs.lease_expires_at is not null
        and jobs.lease_expires_at <= now()
      )
    )
  order by jobs.available_at asc, jobs.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.ingest_jobs
  set
    status = 'running',
    attempt_count = attempt_count + 1,
    lease_owner = p_worker_id,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    heartbeat_at = now(),
    started_at = coalesce(started_at, now()),
    finished_at = null
  where id = claimed.id
  returning * into claimed;

  update public.repos
  set ingest_lock_until = claimed.lease_expires_at
  where id = claimed.repo_id;

  return next claimed;
end;
$$;

create or replace function public.renew_ingest_job_lease(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 360
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  renewed boolean;
  renewed_until timestamptz;
  claimed_repo_id uuid;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Lease must be between 30 and 900 seconds';
  end if;

  renewed_until := now() + make_interval(secs => p_lease_seconds);

  update public.ingest_jobs
  set
    lease_expires_at = renewed_until,
    heartbeat_at = now()
  where id = p_job_id
    and status = 'running'
    and lease_owner = p_worker_id
    and lease_expires_at > now()
  returning repo_id into claimed_repo_id;

  renewed := found;
  if renewed then
    update public.repos
    set ingest_lock_until = renewed_until
    where id = claimed_repo_id;
  end if;

  return renewed;
end;
$$;

create or replace function public.prepare_ingest_job_attempt(
  p_job_id uuid,
  p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.ingest_jobs%rowtype;
  has_active_snapshot boolean;
begin
  select jobs.*
  into claimed
  from public.ingest_jobs jobs
  where jobs.id = p_job_id
    and jobs.status = 'running'
    and jobs.lease_owner = p_worker_id
    and jobs.lease_expires_at > now()
  for update;

  if not found then
    return false;
  end if;

  -- A recovered attempt always rebuilds its unpublished snapshot from scratch.
  -- Deleting files cascades to chunks and never touches the active snapshot.
  delete from public.files
  where snapshot_id = claimed.snapshot_id;

  update public.repo_snapshots
  set
    status = 'indexing',
    file_count = 0,
    chunk_count = 0,
    error = null,
    indexed_at = null
  where id = claimed.snapshot_id
    and repo_id = claimed.repo_id;

  select repos.active_snapshot_id is not null
  into has_active_snapshot
  from public.repos repos
  where repos.id = claimed.repo_id;

  if not coalesce(has_active_snapshot, false) then
    update public.repos
    set status = 'indexing', error = null
    where id = claimed.repo_id;
  end if;

  return true;
end;
$$;

create or replace function public.complete_ingest_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_file_count integer,
  p_chunk_count integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.ingest_jobs%rowtype;
  snapshot_commit_sha text;
  completed_at timestamptz := now();
begin
  select jobs.*
  into claimed
  from public.ingest_jobs jobs
  where jobs.id = p_job_id
    and jobs.status = 'running'
    and jobs.lease_owner = p_worker_id
    and jobs.lease_expires_at > now()
  for update;

  if not found then
    return false;
  end if;

  select snapshots.commit_sha
  into snapshot_commit_sha
  from public.repo_snapshots snapshots
  where snapshots.id = claimed.snapshot_id
    and snapshots.repo_id = claimed.repo_id
  for update;

  if snapshot_commit_sha is null then
    raise exception 'Ingest snapshot not found';
  end if;

  update public.repo_snapshots
  set
    status = 'ready',
    file_count = p_file_count,
    chunk_count = p_chunk_count,
    indexed_at = completed_at,
    error = null
  where id = claimed.snapshot_id;

  -- Snapshot readiness, active pointer publication, and terminal job state are
  -- committed in one database transaction.
  update public.repos
  set
    status = 'ready',
    file_count = p_file_count,
    chunk_count = p_chunk_count,
    error = null,
    commit_sha = snapshot_commit_sha,
    last_indexed_at = completed_at,
    active_snapshot_id = claimed.snapshot_id,
    ingest_lock_until = null
  where id = claimed.repo_id;

  update public.ingest_jobs
  set
    status = 'succeeded',
    error = null,
    finished_at = completed_at,
    lease_owner = null,
    lease_expires_at = null,
    heartbeat_at = completed_at
  where id = claimed.id;

  return true;
end;
$$;

create or replace function public.fail_ingest_job_attempt(
  p_job_id uuid,
  p_worker_id uuid,
  p_error text,
  p_retry_delay_seconds integer default 30
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.ingest_jobs%rowtype;
  retry_at timestamptz;
  keep_previous boolean;
begin
  select jobs.*
  into claimed
  from public.ingest_jobs jobs
  where jobs.id = p_job_id
    and jobs.status = 'running'
    and jobs.lease_owner = p_worker_id
  for update;

  if not found then
    return 'lost';
  end if;

  if claimed.attempt_count < claimed.max_attempts then
    retry_at := now() + make_interval(secs => greatest(p_retry_delay_seconds, 0));
    update public.ingest_jobs
    set
      status = 'queued',
      error = left(coalesce(p_error, 'Indexing failed unexpectedly.'), 2000),
      available_at = retry_at,
      lease_owner = null,
      lease_expires_at = null,
      heartbeat_at = now()
    where id = claimed.id;

    update public.repos
    set ingest_lock_until = retry_at + interval '15 minutes'
    where id = claimed.repo_id;

    return 'retrying';
  end if;

  select repos.active_snapshot_id is not null
  into keep_previous
  from public.repos repos
  where repos.id = claimed.repo_id;

  update public.repo_snapshots
  set
    status = 'failed',
    error = left(coalesce(p_error, 'Indexing failed unexpectedly.'), 2000)
  where id = claimed.snapshot_id;

  update public.repos
  set
    status = case when coalesce(keep_previous, false) then 'ready' else 'failed' end,
    error = case
      when coalesce(keep_previous, false) then null
      else left(coalesce(p_error, 'Indexing failed unexpectedly.'), 2000)
    end,
    ingest_lock_until = null
  where id = claimed.repo_id;

  update public.ingest_jobs
  set
    status = 'failed',
    error = left(coalesce(p_error, 'Indexing failed unexpectedly.'), 2000),
    finished_at = now(),
    lease_owner = null,
    lease_expires_at = null,
    heartbeat_at = now()
  where id = claimed.id;

  return 'failed';
end;
$$;

create or replace function public.recover_expired_ingest_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  exhausted public.ingest_jobs%rowtype;
  recovered_count integer := 0;
  failure_message text := 'Indexing lease expired after the maximum number of attempts.';
begin
  for exhausted in
    select jobs.*
    from public.ingest_jobs jobs
    where jobs.status = 'running'
      and jobs.lease_expires_at <= now()
      and jobs.attempt_count >= jobs.max_attempts
    for update skip locked
  loop
    update public.repo_snapshots
    set status = 'failed', error = failure_message
    where id = exhausted.snapshot_id;

    update public.repos
    set
      status = case when active_snapshot_id is not null then 'ready' else 'failed' end,
      error = case when active_snapshot_id is not null then null else failure_message end,
      ingest_lock_until = null
    where id = exhausted.repo_id;

    update public.ingest_jobs
    set
      status = 'failed',
      error = failure_message,
      finished_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      heartbeat_at = now()
    where id = exhausted.id;

    recovered_count := recovered_count + 1;
  end loop;

  return recovered_count;
end;
$$;

revoke all on function public.claim_ingest_job(uuid, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.renew_ingest_job_lease(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.prepare_ingest_job_attempt(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_ingest_job(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.fail_ingest_job_attempt(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.recover_expired_ingest_jobs()
  from public, anon, authenticated;

grant execute on function public.claim_ingest_job(uuid, integer, uuid) to service_role;
grant execute on function public.renew_ingest_job_lease(uuid, uuid, integer) to service_role;
grant execute on function public.prepare_ingest_job_attempt(uuid, uuid) to service_role;
grant execute on function public.complete_ingest_job(uuid, uuid, integer, integer) to service_role;
grant execute on function public.fail_ingest_job_attempt(uuid, uuid, text, integer) to service_role;
grant execute on function public.recover_expired_ingest_jobs() to service_role;
