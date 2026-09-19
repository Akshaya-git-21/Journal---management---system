-- One-off: JMS-2026-XPFOH has assignments that were replaced (the Editor
-- selected a replacement, the Coordinator accepted it) but were never closed,
-- so they still count as INVITED and block the review round. Applies the 0111
-- rule to existing rows, then -- if that leaves the round complete -- moves the
-- manuscript to AWAITING_DECISION exactly like submit_peer_review() would.
-- Run once in the Supabase SQL editor AFTER applying 0111.

do $$
declare
  m public.manuscripts;
  still_pending int;
  active_count int;
  submitted_count int;
begin
  -- Close only assignments that an ACCEPTED replacement suggestion supersedes.
  update public.reviewer_assignments ra
  set status = 'DECLINED', responded_at = coalesce(ra.responded_at, timezone('utc', now())),
      decline_reason = coalesce(ra.decline_reason, 'Replaced by another reviewer')
  where ra.manuscript_id = 'JMS-2026-XPFOH'
    and ra.status in ('INVITED','ACCEPTED')
    and exists (
      select 1
      from public.manuscript_suggested_reviewers sr
      join public.editor_reviewer_actions a on a.suggestion_id = sr.id and a.action = 'ACCEPTED'
      where sr.replaces_assignment_id = ra.id
    );

  select * into m from public.manuscripts where id = 'JMS-2026-XPFOH' for update;
  select count(*) filter (where status in ('INVITED','ACCEPTED')),
         count(*) filter (where status <> 'DECLINED'),
         count(*) filter (where status = 'SUBMITTED')
  into still_pending, active_count, submitted_count
  from public.reviewer_assignments
  where manuscript_id = m.id and revision_number = (
    select revision_number from public.reviewer_assignments
    where manuscript_id = m.id and status = 'SUBMITTED' order by revision_number desc limit 1);

  if still_pending = 0 and active_count >= 2 and m.status = 'UNDER_REVIEW' then
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = m.id;
    perform public._record_transition(m.id, 'UNDER_REVIEW', 'AWAITING_DECISION', 'all_reviews_submitted');
    if m.assigned_editor_id is not null then
      perform public._notify(m.assigned_editor_id, 'REVIEWS_COMPLETE', m.id, 'All reviews are in for: ' || m.title);
    end if;
  else
    raise notice 'Manuscript left as-is: status=%, still_pending=%, active=%, submitted=%', m.status, still_pending, active_count, submitted_count;
  end if;
end $$;

select m.status as manuscript_status, ra.status, ra.revision_number, ra.decline_reason
from public.manuscripts m join public.reviewer_assignments ra on ra.manuscript_id = m.id
where m.id = 'JMS-2026-XPFOH' order by ra.invited_at;
