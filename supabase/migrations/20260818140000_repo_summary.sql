-- Cached repository overview generated after a successful ingest.

alter table public.repos
  add column if not exists summary text;
