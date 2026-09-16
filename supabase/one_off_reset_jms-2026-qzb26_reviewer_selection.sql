-- One-off: clear the Editor's pending reviewer selections for
-- JMS-2026-QZB26 so they can re-select exactly 2 from scratch, now that
-- 0089_cap_editor_reviewer_selection_at_two.sql prevents a 3rd. Only
-- touches suggestions the Coordinator has NOT yet acted on (no
-- editor_reviewer_actions row) -- safe no-op for anything already
-- accepted/declined/replaced or already turned into a reviewer_assignment.
-- Run this once in the Supabase SQL editor, then run the 0089 migration if
-- you haven't already.

delete from public.manuscript_suggested_reviewers
where manuscript_id = 'JMS-2026-QZB26'
  and suggested_by = 'EDITOR'
  and not exists (
    select 1 from public.editor_reviewer_actions
    where suggestion_id = manuscript_suggested_reviewers.id
  );

select id, name, email, suggested_by, promoted_from
from public.manuscript_suggested_reviewers
where manuscript_id = 'JMS-2026-QZB26'
order by created_at;
