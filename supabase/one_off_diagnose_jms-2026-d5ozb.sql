-- Diagnostic only (no writes): dump the exact current state of everything
-- that feeds the Editor's "needs replacement" alert for JMS-2026-D5OZB, so
-- we can see precisely why it isn't showing instead of guessing.
-- Run this in the Supabase SQL editor and share all three result sets.

select id, status, assigned_editor_id
from public.manuscripts
where id = 'JMS-2026-D5OZB';

select id, reviewer_id, status, revision_number, due_date, timeline_start_date,
       replacement_requested_at, responded_at, invited_at
from public.reviewer_assignments
where manuscript_id = 'JMS-2026-D5OZB'
order by invited_at;

select sr.id as suggestion_id, sr.name, sr.email, sr.suggested_by, sr.revision_number,
       a.id as action_id, a.action
from public.manuscript_suggested_reviewers sr
left join public.editor_reviewer_actions a on a.suggestion_id = sr.id
where sr.manuscript_id = 'JMS-2026-D5OZB'
order by sr.created_at;
