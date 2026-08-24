-- ==========================================
-- Module 35: bug fix for notify_expired_reviewer_replacements() (0034).
--
-- The "has this slot already been replaced" check compared the candidate
-- replacement's invited_at against the declined row's responded_at -- but
-- the co-reviewer in the SAME round (invited in the same original batch,
-- never declined) also has an invited_at that can land after the declined
-- row's responded_at (e.g. if the decline happens quickly), which wrongly
-- matched as "already replaced" and suppressed the notification. Found live
-- while testing Test 5B: a genuinely un-replaced expired decline produced 0
-- notifications instead of 1.
--
-- Fix: replace the timestamp-based guess with a direct, unambiguous check --
-- notify only when the round currently has fewer than 2 active (non-DECLINED)
-- reviewer_assignments, i.e. it is still genuinely short-staffed. This is
-- immune to invite-timing edge cases and matches the actual intent exactly.
--
-- Depends on: 0034_reviewer_replacement_round_isolation.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.notify_expired_reviewer_replacements()
returns int language plpgsql security definer set search_path = public as $$
declare
  ra public.reviewer_assignments;
  m public.manuscripts;
  active_in_round int;
  notified_count int := 0;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may check reviewer replacement deadlines';
  end if;

  for ra in
    select * from public.reviewer_assignments
    where status = 'DECLINED'
      and responded_at is not null
      and responded_at < timezone('utc', now()) - interval '2 days'
      and not deadline_notified
      -- Editor already picked someone for this exact slot -- not expired.
      and not exists (
        select 1 from public.manuscript_suggested_reviewers sr
        where sr.manuscript_id = reviewer_assignments.manuscript_id
          and sr.suggested_by = 'EDITOR'
          and sr.revision_number = reviewer_assignments.revision_number
      )
  loop
    select count(*) into active_in_round from public.reviewer_assignments
    where manuscript_id = ra.manuscript_id and revision_number = ra.revision_number and status != 'DECLINED';
    if active_in_round >= 2 then
      -- Round is already adequately staffed (a replacement was invited and
      -- is active, or otherwise resolved) -- nothing to notify.
      update public.reviewer_assignments set deadline_notified = true where id = ra.id;
      continue;
    end if;

    select * into m from public.manuscripts where id = ra.manuscript_id;
    if m.id is null or m.status not in ('EDITOR_REVIEW', 'UNDER_REVIEW') then
      update public.reviewer_assignments set deadline_notified = true where id = ra.id;
      continue;
    end if;

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'REPLACEMENT_DEADLINE_EXPIRED', ra.manuscript_id,
      'The reviewer replacement deadline has expired. Please assign a replacement reviewer: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

    update public.reviewer_assignments set deadline_notified = true where id = ra.id;
    notified_count := notified_count + 1;
  end loop;

  return notified_count;
end;
$$;

revoke all on function public.notify_expired_reviewer_replacements() from public;
grant execute on function public.notify_expired_reviewer_replacements() to authenticated;
