-- Phase 7 P1.1: atomically consume fixed-window chat capacity.

create or replace function public.consume_chat_rate_limit(
  p_user_id uuid,
  p_max_requests integer default 60,
  p_window_seconds integer default 600
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_row public.chat_usage%rowtype;
  v_now timestamptz := now();
  window_end timestamptz;
begin
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;
  if p_max_requests < 1 or p_max_requests > 10_000 then
    raise exception 'Maximum request count must be between 1 and 10000';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86_400 then
    raise exception 'Window must be between 1 and 86400 seconds';
  end if;

  -- Establish the row before acquiring its lock. ON CONFLICT makes concurrent
  -- first requests converge on the same counter.
  insert into public.chat_usage (user_id, window_start, request_count)
  values (p_user_id, v_now, 0)
  on conflict (user_id) do nothing;

  select *
  into usage_row
  from public.chat_usage
  where user_id = p_user_id
  for update;

  window_end := usage_row.window_start
    + make_interval(secs => p_window_seconds);

  if v_now >= window_end then
    update public.chat_usage
    set window_start = v_now, request_count = 1
    where user_id = p_user_id;

    return query select true, p_max_requests - 1, 0;
    return;
  end if;

  if usage_row.request_count >= p_max_requests then
    return query
    select
      false,
      0,
      greatest(
        1,
        ceil(extract(epoch from (window_end - v_now)))::integer
      );
    return;
  end if;

  update public.chat_usage
  set request_count = usage_row.request_count + 1
  where user_id = p_user_id;

  return query
  select true, p_max_requests - usage_row.request_count - 1, 0;
end;
$$;

revoke all on function public.consume_chat_rate_limit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_chat_rate_limit(uuid, integer, integer)
  to service_role;
