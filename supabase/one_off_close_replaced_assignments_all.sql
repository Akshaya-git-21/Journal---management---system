-- One-off: generalizes one_off_close_replaced_assignments_jms-2026-xpfoh.sql
-- to EVERY manuscript, not just JMS-2026-XPFOH.
--
-- Any reviewer_assignments row that was superseded by an accepted
-- replacement suggestion (manuscript_suggested_reviewers.replaces_assignment_id)
-- BEFORE migration 0111 was applied never got closed -- it stayed
-- INVITED/ACCEPTED with its original due_date, so it still shows up as
-- "overdue" (getOverdueReviewerAssignments() in src/lib/workflow.ts) even
-- though a replacement reviewer has already been invited. This is the cause
-- of e.g. "Dr. Maya" still appearing in SLA Warning Exceptions after being
-- replaced.
--
-- This applies the exact 0111 rule retroactively to all such rows across
-- every manuscript, then -- for any manuscript that becomes fully
-- submitted/closed as a result -- moves it to AWAITING_DECISION exactly
-- like submit_peer_review() would.
--
-- Run once in the Supabase SQL editor AFTER 0111 is applied. Safe to re-run
-- (the UPDATE only ever touches still-open rows that have an accepted
-- replacement; once closed they're no longer matched).

do $$
declare
  m public.manuscripts;
  still_pending int;
  active_count int;
  submitted_count int;
begin
  -- Close every assignment that an ACCEPTED replacement suggestion
  -- supersedes, across all manuscripts.
  update public.reviewer_assignments ra
  set status = 'DECLINED', responded_at = coalesce(ra.responded_at, timezone('utc', now())),
      decline_reason = coalesce(ra.decline_reason, 'Replaced by another reviewer')
  where ra.status in ('INVITED','ACCEPTED')
    and exists (
      select 1
      from public.manuscript_suggested_reviewers sr
      join public.editor_reviewer_actions a on a.suggestion_id = sr.id and a.action = 'ACCEPTED'
      where sr.replaces_assignment_id = ra.id
    );

  -- For each manuscript still UNDER_REVIEW, check whether closing those
  -- stale rows now leaves a complete round, and if so move it forward --
  -- same logic submit_peer_review() applies on a normal submission.
  for m in select * from public.manuscripts where status = 'UNDER_REVIEW'
  loop
    select count(*) filter (where status in ('INVITED','ACCEPTED')),
           count(*) filter (where status <> 'DECLINED'),
           count(*) filter (where status = 'SUBMITTED')
    into still_pending, active_count, submitted_count
    from public.reviewer_assignments
    where manuscript_id = m.id and revision_number = (
      select revision_number from public.reviewer_assignments
      where manuscript_id = m.id and status = 'SUBMITTED' order by revision_number desc limit 1);

    if still_pending = 0 and active_count >= 2 and submitted_count >= 2 then
      update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = m.id;
      perform public._record_transition(m.id, 'UNDER_REVIEW', 'AWAITING_DECISION', 'all_reviews_submitted');
      if m.assigned_editor_id is not null then
        perform public._notify(m.assigned_editor_id, 'REVIEWS_COMPLETE', m.id, 'All reviews are in for: ' || m.title);
      end if;
    end if;
  end loop;
end $$;

-- Verify: no more INVITED/ACCEPTED reviewer_assignments rows that have an
-- accepted replacement suggestion pointing at them.
select ra.manuscript_id, ra.reviewer_id, ra.status, ra.due_date, ra.decline_reason
from public.reviewer_assignments ra
join public.manuscript_suggested_reviewers sr on sr.replaces_assignment_id = ra.id
join public.editor_reviewer_actions a on a.suggestion_id = sr.id and a.action = 'ACCEPTED'
where ra.status in ('INVITED','ACCEPTED');
