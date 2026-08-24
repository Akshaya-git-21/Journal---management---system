-- ==========================================
-- Module 31 (Phase 2, Checkpoint C): Reviewer re-review loop.
--
-- Today, revisions are Editor<->Author only (submit_revision,
-- coordinator_send_revision_to_editor) -- confirmed by grepping
-- 0017/0018 for reviewer_assignments (zero references). This adds the
-- second loop the spec calls for: when a revision originates from a
-- peer-review decision (manuscript_revisions.origin = 'PEER_REVIEW', set by
-- publish_decision() in 0029), the Coordinator routes the author's upload
-- back to the same Reviewers instead of the Editor.
--
-- Reuses reviewer_assignments as-is (same table Phase 1/2 already built)
-- rather than a parallel table -- a new row per revision cycle, tagged with
-- which cycle it belongs to, exactly like manuscript_revisions.revision_number
-- already scopes editor-side revisions.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0026_editor_reviewer_selection.sql,
-- 0028_reviewer_peer_review_questionnaire.sql, 0029_editor_peer_review_decision_gate.sql,
-- 0030_fix_reviewer_accept_count.sql.
-- Safe to re-run.
-- ==========================================

alter table public.reviewer_assignments add column if not exists revision_number int not null default 0;

-- Step: Coordinator forwards a submitted PEER_REVIEW-origin revision to the
-- same reviewers who reviewed the prior round (skips anyone who declined --
-- the Editor/Coordinator can still use the existing Phase 1 replacement
-- flow if a reviewer becomes unavailable for the re-review too). Mirrors
-- coordinator_send_revision_to_editor() (0018) but targets Reviewers.
create or replace function public.coordinator_send_revision_to_reviewers(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  rev public.manuscript_revisions;
  prior_round int;
  ra public.reviewer_assignments;
  invited_count int := 0;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send a revision to the reviewers';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'REVISION_REQUESTED' then
    raise exception 'Manuscript is not awaiting a revision decision (status=%)', m.status;
  end if;

  select * into rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;
  if rev.id is null or rev.status is distinct from 'REVISION_SUBMITTED' then
    raise exception 'No submitted revision is ready to send to the reviewers';
  end if;
  if rev.origin is distinct from 'PEER_REVIEW' then
    raise exception 'This revision did not originate from a peer-review decision -- send it to the Editor instead';
  end if;

  select coalesce(max(revision_number), 0) into prior_round
  from public.reviewer_assignments where manuscript_id = p_manuscript_id and revision_number < rev.revision_number;

  for ra in
    select * from public.reviewer_assignments
    where manuscript_id = p_manuscript_id and revision_number = prior_round and status != 'DECLINED'
  loop
    insert into public.reviewer_assignments (manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number)
    values (p_manuscript_id, ra.reviewer_id, auth.uid(), 'INVITED', timezone('utc', now()), rev.revision_number);
    perform public._notify(
      ra.reviewer_id, 'REVISION_READY_FOR_REVIEW', p_manuscript_id,
      'Revision ' || rev.revision_number || ' is ready for your re-review: ' || m.title
    );
    invited_count := invited_count + 1;
  end loop;

  if invited_count = 0 then
    raise exception 'No prior reviewers are available to re-invite -- assign replacements first';
  end if;

  update public.manuscript_revisions set status = 'UNDER_REVIEW' where id = rev.id;
  update public.manuscripts set status = 'UNDER_REVIEW', updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'REVISION_REQUESTED', 'UNDER_REVIEW', 'coordinator_send_revision_to_reviewers');

  return m;
end;
$$;

revoke all on function public.coordinator_send_revision_to_reviewers(text) from public;
grant execute on function public.coordinator_send_revision_to_reviewers(text) to authenticated;

-- Let the Author read their own manuscript's SUBMITTED reviewer reports
-- (Comments to Author only, surfaced by the frontend -- reviewer identity
-- stays hidden since the Author has no RLS access to the profiles table for
-- non-self accounts, preserving double-blind). Extends reviewer_assignments_select
-- (0002) with an additional OR clause; nothing else about that policy
-- changes.
drop policy if exists "reviewer_assignments_select" on public.reviewer_assignments;
create policy "reviewer_assignments_select" on public.reviewer_assignments
  for select using (
    reviewer_id = auth.uid()
    or public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.assigned_editor_id = auth.uid())
    or (
      status = 'SUBMITTED'
      and exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
    )
  );
