-- ==========================================
-- Module 109: NotificationBell.tsx already subscribes to workflow_notifications
-- via postgres_changes (0023_notifications_realtime.sql was supposed to add
-- this table to the supabase_realtime publication so that subscription
-- actually receives events) -- but this environment shows the same drift
-- pattern already hit repeatedly (0104-0108): the migration that was
-- supposed to run apparently never took effect here, so the bell only ever
-- reflected real data on page load/reload, never live.
--
-- Purely additive, idempotent -- re-applies 0023 unconditionally so this is
-- guaranteed to actually be set regardless of what ran before.
-- ==========================================

do $$
begin
  if to_regclass('public.workflow_notifications') is not null
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workflow_notifications'
    )
  then
    alter publication supabase_realtime add table public.workflow_notifications;
  end if;
end $$;

-- Also verify replica identity is set so UPDATE/DELETE events carry the old
-- row (needed for the client to know WHICH notification changed, e.g. when
-- marked read) -- default replica identity only includes the primary key
-- for UPDATEs unless FULL is set, and Postgres requires it to be set
-- explicitly for realtime UPDATE payloads to include all columns.
alter table public.workflow_notifications replica identity full;
