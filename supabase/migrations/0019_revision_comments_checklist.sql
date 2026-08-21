-- ==========================================
-- Module 19: Give every revision cycle its own permanently traceable Editor
-- Comments / Checklist / Editor Decision / Coordinator Decision -- nothing
-- about a revision cycle is ever overwritten by a later one.
--
-- Scope note: this only affects the revision re-review path (the dedicated
-- EditorRevisionReview screen and submit_editor_recommendation). The
-- original first-round Editor Evaluation (submit_editor_assessment, its
-- numerical scoring criteria, and editor_assignments.strengths/weaknesses/
-- etc.) is untouched -- that screen and its data model stay exactly as they
-- were.
--
-- Previously the editor's strengths/weaknesses/comments lived on
-- editor_assignments, ONE row shared across every revision cycle -- each
-- resubmission's re-evaluation silently overwrote the previous cycle's
-- comments. This adds dedicated columns directly on manuscript_revisions --
-- one row per cycle already exists and is never reused -- so each cycle's
-- editor comments, checklist, decision, and the coordinator's final
-- decision on that cycle are all permanently distinct.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0011_publisher_and_reasons.sql,
-- 0018_coordinator_revision_gate.sql. Safe to re-run.
-- ==========================================

alter table public.manuscript_revisions add column if not exists editor_comments text;
alter table public.manuscript_revisions add column if not exists editor_checklist jsonb not null default '[]'::jsonb;
alter table public.manuscript_revisions add column if not exists editor_decision text;
alter table public.manuscript_revisions add column if not exists editor_decision_at timestamptz;
alter table public.manuscript_revisions add column if not exists coordinator_decision text;
alter table public.manuscript_revisions add column if not exists coordinator_decision_at timestamptz;
alter table public.manuscript_revisions add column if not exists coordinator_note text;

alter table public.manuscript_revisions drop constraint if exists manuscript_revisions_editor_decision_check;
alter table public.manuscript_revisions add constraint manuscript_revisions_editor_decision_check
  check (editor_decision is null or editor_decision in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT'));

alter table public.manuscript_revisions drop constraint if exists manuscript_revisions_coordinator_decision_check;
alter table public.manuscript_revisions add constraint manuscript_revisions_coordinator_decision_check
  check (coordinator_decision is null or coordinator_decision in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT'));

-- submit_editor_recommendation now also accepts the editor's comments and
-- checklist (used only by the revision re-review path), stamping them plus
-- the decision itself and a timestamp onto the revision row being decided.
-- The auto-advance logic (accept -> AWAITING_DECISION, minor/major -> next
-- revision cycle, reject -> REJECTED) and the original-review-round
-- fallback are unchanged from 0018.
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
  next_status text;
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

  -- The numerical-scoring evaluation (submit_editor_assessment) only exists
  -- on the original first-round review screen. A revision re-review cycle
  -- goes straight from assignment to EditorRevisionReview.tsx -- comments +
  -- checklist + decision, no scoring step -- so assessment_status never
  -- becomes SUBMITTED for the editor_assignments row created for that
  -- cycle. Only require it outside a revision cycle.
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
    -- being decided, regardless of the outcome below.
    update public.manuscript_revisions
    set editor_comments = coalesce(p_comments, editor_comments),
        editor_checklist = coalesce(p_checklist, editor_checklist),
        editor_decision = p_recommendation,
        editor_decision_at = timezone('utc', now())
    where id = latest_rev.id;

    if p_recommendation = 'ACCEPT' then
      update public.manuscript_revisions set status = 'COMPLETED' where id = latest_rev.id;
      update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      next_status := 'AWAITING_DECISION';
    elsif p_recommendation in ('MINOR_REVISION', 'MAJOR_REVISION') then
      update public.manuscript_revisions set status = 'COMPLETED' where id = latest_rev.id;
      insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, decision_type, status)
      values (p_manuscript_id, latest_rev.revision_number + 1, auth.uid(), '', p_recommendation, 'AWAITING_AUTHOR_UPLOAD');
      update public.manuscripts set status = 'REVISION_REQUESTED', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      next_status := 'REVISION_REQUESTED';
    elsif p_recommendation = 'REJECT' then
      update public.manuscript_revisions set status = 'COMPLETED' where id = latest_rev.id;
      update public.manuscripts set status = 'REJECTED', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      next_status := 'REJECTED';
    end if;

    if next_status is not null then
      perform public._record_transition(p_manuscript_id, 'EDITOR_REVIEW', next_status, 'submit_editor_recommendation');
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
      return a;
    end if;
  end if;

  -- Original review round: just record the recommendation, no auto-transition.
  perform public._record_transition(p_manuscript_id, m.status, m.status, 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;

-- publish_decision now also stamps the coordinator's final decision onto
-- whichever revision cycle was just being finalized (if any), independent
-- of whether the outcome opens a new cycle. The original (no-revision-yet)
-- path is unaffected -- there's no revision row to stamp.
create or replace function public.publish_decision(p_manuscript_id text, p_decision text, p_decision_letter text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rec text; next_status text; rev_count int; latest_rev_id uuid;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may publish a decision'; end if;
  if p_decision not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'AWAITING_DECISION' then raise exception 'Manuscript is not awaiting a decision (status=%)', m.status; end if;

  select recommendation into rec from public.editor_assignments
  where manuscript_id = p_manuscript_id and status = 'ACCEPTED' order by assigned_at desc limit 1;
  if rec is null then raise exception 'Editor has not submitted a recommendation yet'; end if;

  select id into latest_rev_id from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;

  next_status := case p_decision
    when 'ACCEPT' then 'ACCEPTED'
    when 'REJECT' then 'REJECTED'
    else 'REVISION_REQUESTED'
  end;

  update public.manuscripts set status = next_status, updated_at = timezone('utc', now()) where id = p_manuscript_id;

  if latest_rev_id is not null then
    update public.manuscript_revisions
    set coordinator_decision = p_decision, coordinator_decision_at = timezone('utc', now()), coordinator_note = p_decision_letter
    where id = latest_rev_id;
  end if;

  if next_status = 'REVISION_REQUESTED' then
    select count(*) into rev_count from public.manuscript_revisions where manuscript_id = p_manuscript_id;
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, decision_type, status)
    values (p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, p_decision, 'AWAITING_AUTHOR_UPLOAD');
  end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', next_status, 'publish_decision', p_decision_letter);
  perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Decision on your manuscript: ' || m.title, p_decision_letter);

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;
