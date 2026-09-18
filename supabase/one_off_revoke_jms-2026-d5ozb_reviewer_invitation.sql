-- One-off: revoke the outstanding (not yet submitted/declined) reviewer
-- invitation(s) on JMS-2026-D5OZB so the Coordinator can resend a fresh
-- invitation with a due date already in the past, to test the Module 104
-- overdue -> Request Replacement flow end to end.
--
-- Deletes the INVITED/ACCEPTED reviewer_assignments row(s) for the current
-- (latest) round of this manuscript, and the matching editor_reviewer_actions
-- row(s) so the underlying suggestion goes back to "pending" and can be
-- re-invited through the normal Review Board "Send Invitations" flow (date
-- picker included) instead of needing a new Editor selection.
-- Never touches a SUBMITTED or already-DECLINED assignment.
-- Run this once in the Supabase SQL editor.

with target_manuscript as (
  select id from public.manuscripts where id = 'JMS-2026-D5OZB'
),
current_round as (
  select coalesce(max(revision_number), 0) as revision_number
  from public.reviewer_assignments
  where manuscript_id = (select id from target_manuscript)
),
revoked as (
  delete from public.reviewer_assignments
  where manuscript_id = (select id from target_manuscript)
    and revision_number = (select revision_number from current_round)
    and status in ('INVITED', 'ACCEPTED')
  returning id, reviewer_id, revision_number
)
select * from revoked;

-- Free up the matching suggestion(s) so they show as pending again (only
-- for reviewers whose invitation was just revoked above).
delete from public.editor_reviewer_actions a
using public.manuscript_suggested_reviewers sr
where a.suggestion_id = sr.id
  and sr.manuscript_id = 'JMS-2026-D5OZB'
  and sr.suggested_by = 'EDITOR'
  and exists (
    select 1 from public.profiles p
    where p.email = sr.email and p.role = 'REVIEWER'
      and not exists (
        select 1 from public.reviewer_assignments ra
        where ra.manuscript_id = sr.manuscript_id
          and ra.reviewer_id = p.id
          and ra.revision_number = sr.revision_number
          and ra.status != 'DECLINED'
      )
  );

select id, name, email, suggested_by, revision_number
from public.manuscript_suggested_reviewers
where manuscript_id = 'JMS-2026-D5OZB'
order by created_at;
