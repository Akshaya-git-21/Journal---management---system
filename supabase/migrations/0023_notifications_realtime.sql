-- ==========================================
-- Migration 0023: Enable Realtime replication for workflow_notifications.
--
-- NotificationBell.tsx subscribes via supabase.channel(...).on('postgres_changes',
-- { table: 'workflow_notifications' }, ...) so the unread badge and dropdown
-- update live, but 0013_enable_realtime.sql never added this table to the
-- supabase_realtime publication -- the subscription connects but never
-- receives events, so the bell only reflects real data at initial load/reload.
--
-- Purely additive: no RLS, RPC, or status-machine change. Same pattern as
-- 0013. Safe to re-run.
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
