-- ==========================================
-- Module 16: Private Coordinator <-> Author discussion channel.
--
-- manuscript_discussions had no privacy distinction at all -- the "Editorial
-- Inquiry Forum" / "Coordinator Chat" split in the Author UI was a purely
-- cosmetic client-side filter (matching a "[Coordinator Chat]" text prefix),
-- while discussions_select/discussions_insert let the Author, assigned
-- Editor, any Reviewer, and the Coordinator all read and write every row
-- regardless of that prefix. An Editor or Reviewer querying the table
-- directly could always see "private" coordinator messages.
--
-- Adds a real `channel` column: 'GENERAL' (default, existing broad
-- visibility unchanged) or 'COORDINATOR_AUTHOR' (visible/writable only to
-- the manuscript's author and an active Coordinator -- not the assigned
-- editor, not reviewers).
--
-- Depends on: 0002_manuscripts_workflow.sql. Safe to re-run.
-- ==========================================

alter table public.manuscript_discussions add column if not exists channel text not null default 'GENERAL';
alter table public.manuscript_discussions drop constraint if exists manuscript_discussions_channel_check;
alter table public.manuscript_discussions add constraint manuscript_discussions_channel_check
  check (channel in ('GENERAL', 'COORDINATOR_AUTHOR'));

drop policy if exists "discussions_select" on public.manuscript_discussions;
create policy "discussions_select" on public.manuscript_discussions
  for select using (
    case
      when channel = 'COORDINATOR_AUTHOR' then
        exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
        or public.is_active_coordinator()
      else
        exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
          m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
          or public.is_reviewer_of(m.id) or public.is_active_coordinator()
        ))
    end
  );

drop policy if exists "discussions_insert" on public.manuscript_discussions;
create policy "discussions_insert" on public.manuscript_discussions
  for insert with check (
    sender_id = auth.uid()
    and case
      when channel = 'COORDINATOR_AUTHOR' then
        exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
        or public.is_active_coordinator()
      else
        exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
          m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
          or public.is_reviewer_of(m.id) or public.is_active_coordinator()
        ))
    end
  );
