-- ==========================================
-- Module 20: Coordinator confirmation gate between the Editor's revision
-- decision and the next revision cycle actually opening.
--
-- Previously submit_editor_recommendation(), for a MINOR_REVISION or
-- MAJOR_REVISION decision on a revision cycle, immediately inserted the next
-- manuscript_revisions row and flipped manuscripts.status straight to
-- REVISION_REQUESTED -- the Coordinator never got a chance to review the
-- editor's comments/checklist/decision before the author saw "Revision N+1
-- requested." That's inconsistent with the original round (where an ACCEPT
-- recommendation stops at AWAITING_DECISION for the Coordinator to publish)
-- and with the explicit workflow: Editor Decision -> Coordinator Review ->
-- Coordinator Final Decision -> Next Revision.
--
-- Now every editor decision on a revision cycle (ACCEPT/MINOR_REVISION/
-- MAJOR_REVISION alike) just stamps the decision onto the revision and
-- parks the manuscript at AWAITING_DECISION. publish_decision() (unchanged
-- from 0019) is what actually opens the next cycle (or accepts/rejects) once
-- the Coordinator confirms -- see the "Send Back to Author for Revision N"
-- action in DecisionTab.tsx.
--
-- Depends on: 0019_revision_comments_checklist.sql. Safe to re-run.
-- ==========================================

create or replace function public.submit_editor_recommendation(
  p_manuscript_id text,
  p_recommendation text,
  p_comments text default null,
  p_checklist jsonb default '[]'::jsonb
)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  a public.editor_assignments;
  latest_rev public.manuscript_revisions;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may recommend'; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null then raise exception 'No active editor assignment found'; end if;

  select * into latest_rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;

  if not (latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and m.status = 'EDITOR_REVIEW')
     and a.assessment_status is distinct from 'SUBMITTED' then
    raise exception 'You must submit your evaluation before making a recommendation';
  end if;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  update public.editor_assignments
  set recommendation = p_recommendation, recommendation_submitted_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  returning * into a;

  if a.id is null then raise exception 'No active editor assignment found'; end if;

  if latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and m.status = 'EDITOR_REVIEW' then
    -- Stamp the editor's comments/checklist/decision onto the revision
    -- being decided, then hand off to the Coordinator -- whatever the
    -- editor recommended (accept, minor, major), the next revision cycle
    -- (or final accept/reject) only actually opens once the Coordinator
    -- confirms via publish_decision().
    update public.manuscript_revisions
    set editor_comments = coalesce(p_comments, editor_comments),
        editor_checklist = coalesce(p_checklist, editor_checklist),
        editor_decision = p_recommendation,
        editor_decision_at = timezone('utc', now()),
        status = 'COMPLETED'
    where id = latest_rev.id;

    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;

    perform public._record_transition(p_manuscript_id, 'EDITOR_REVIEW', 'AWAITING_DECISION', 'submit_editor_recommendation');
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  -- Original review round: just record the recommendation, no auto-transition.
  perform public._record_transition(p_manuscript_id, m.status, m.status, 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;
