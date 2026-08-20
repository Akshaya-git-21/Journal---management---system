-- ==========================================
-- Module 13: Enable Realtime replication for tables the frontend subscribes
-- to via supabase.channel(...).on('postgres_changes', ...).
--
-- Client code across the app (CoordinatorWorkspace, EditorWorkspace,
-- CoordinatorManuscriptDetail, editorWorkspace.ts, workflow.ts, etc.) sets
-- up postgres_changes subscriptions on these tables, but no prior migration
-- ever added them to the `supabase_realtime` publication -- Supabase only
-- streams changes for tables explicitly in that publication. Without this,
-- every .channel(...).on('postgres_changes', ...) call silently connects
-- but never receives an event, so "live" UI (e.g. the Reviewers module
-- picking up a freshly created account, or the Coordinator's Suggested
-- Reviewers card updating without a refresh) never actually updates.
--
-- Safe to re-run: skips any table already in the publication.
-- ==========================================

do $$
declare
  t text;
  tables text[] := array[
    'manuscripts',
    'profiles',
    'editor_assignments',
    'reviewer_assignments',
    'manuscript_suggested_reviewers',
    'manuscript_status_history',
    'manuscript_discussions',
    'manuscript_files',
    'manuscript_revisions',
    'discussion_messages'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
