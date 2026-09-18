-- One-off: Dr. Liam Chen's replacement suggestion for JMS-2026-D5OZB was
-- created BEFORE migration 0106 added replaces_assignment_id, so it has no
-- link to the assignment it's actually replacing (Dr. Maya's). Backfill it
-- retroactively by matching manuscript + Dr. Maya's email to her current
-- (non-declined) reviewer_assignments row.
-- Any replacement picked AFTER 0106 links automatically -- this is only
-- needed for this one pre-existing case.
-- Run this once in the Supabase SQL editor.

update public.manuscript_suggested_reviewers sr
set replaces_assignment_id = ra.id
from public.reviewer_assignments ra
where sr.manuscript_id = 'JMS-2026-D5OZB'
  and sr.email = 'demo.reviewer2@example.com'
  and sr.suggested_by = 'EDITOR'
  and sr.replaces_assignment_id is null
  and ra.manuscript_id = 'JMS-2026-D5OZB'
  and ra.status != 'DECLINED'
  and ra.reviewer_id = (select id from public.profiles where email = 'maya@gmail.com');

select sr.id as suggestion_id, sr.name, sr.email, sr.replaces_assignment_id,
       ra.id as assignment_id, ra.status as assignment_status
from public.manuscript_suggested_reviewers sr
left join public.reviewer_assignments ra on ra.id = sr.replaces_assignment_id
where sr.manuscript_id = 'JMS-2026-D5OZB'
order by sr.created_at;
