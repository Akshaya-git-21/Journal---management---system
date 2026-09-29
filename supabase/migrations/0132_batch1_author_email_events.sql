-- ==========================================
-- Module 132: Batch 1 -- Author email events.
--
-- EXISTING WORKFLOW IS LOCKED. Every function below is reproduced with its
-- entire existing body byte-for-byte unchanged -- same signature, same
-- return type, same status transitions, same permission checks, same
-- existing _notify()/workflow_notifications calls, same return value. The
-- ONLY addition in each is exactly one new
--   perform public._notify(m.author_id, '<NEW_TYPE>', ...);
-- line, appended after the function's existing logic, so the author also
-- gets an in-app notification (and, via email_outbox, an email) for an
-- action that already happens today. No status, stage, role, permission,
-- assignment, or RPC output changes. If email delivery fails later, none
-- of this is affected -- that failure is isolated entirely inside the
-- separate send-workflow-email Edge Function.
--
-- 7 of the 12 requested Batch-1 events need NO RPC change at all, because
-- an author-only notification already exists for them:
--   PROOF_SENT              -- already author-only (send_proof_to_author and
--                              every "send to author" production step)
--                              covers: PROOF_SENT, CORRECTIONS_REQUESTED,
--                              FINAL_APPROVAL_REQUESTED (same type, the
--                              email template below distinguishes the exact
--                              wording from the notification's own title)
--   DECISION_PUBLISHED      -- already author-only (publish_decision)
--                              covers: REVISION_REQUESTED, MANUSCRIPT_ACCEPTED,
--                              MANUSCRIPT_REJECTED (same type, the email
--                              template distinguishes by the manuscript's
--                              current status, read at send time)
--   MANUSCRIPT_PUBLISHED    -- already author-only (mark_published, which
--                              gd_member_publish_article already calls
--                              internally -- so the GD Member production
--                              path already triggers this notification too)
--
-- Only these 3 types are enabled for email below with zero RPC edits.
--
-- The other 5 requested events have no existing author-facing notification
-- at all today, so one new _notify() line is added to their existing RPC,
-- using a brand-new type name that cannot collide with or change any
-- existing recipient's notification:
--   MANUSCRIPT_SUBMITTED_AUTHOR_ACK   -- added to submit_manuscript
--   EDITORIAL_REVIEW_STARTED          -- added to assign_editor
--   REVISION_SUBMITTED_AUTHOR_ACK     -- added to submit_revision
--   CORRECTIONS_SUBMITTED_AUTHOR_ACK  -- added to author_submit_corrections
--   FINAL_APPROVAL_COMPLETED_AUTHOR_ACK -- added to author_final_review_proof
-- ==========================================

insert into public.email_enabled_types (type) values
  ('PROOF_SENT'),
  ('DECISION_PUBLISHED'),
  ('MANUSCRIPT_PUBLISHED'),
  ('MANUSCRIPT_SUBMITTED_AUTHOR_ACK'),
  ('EDITORIAL_REVIEW_STARTED'),
  ('REVISION_SUBMITTED_AUTHOR_ACK'),
  ('CORRECTIONS_SUBMITTED_AUTHOR_ACK'),
  ('FINAL_APPROVAL_COMPLETED_AUTHOR_ACK')
on conflict (type) do nothing;

-- ------------------------------------------
-- submit_manuscript: identical to 0002_manuscripts_workflow.sql except for
-- the one new _notify() line for the author at the end.
-- ------------------------------------------
create or replace function public.submit_manuscript(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Only the author may submit this manuscript'; end if;
  if m.status is distinct from 'DRAFT' then raise exception 'Manuscript is not in draft (status=%)', m.status; end if;

  update public.manuscripts set status = 'SUBMITTED', submitted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'DRAFT', 'SUBMITTED', 'submit_manuscript');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'MANUSCRIPT_SUBMITTED', p_manuscript_id, 'New submission: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  perform public._notify(m.author_id, 'MANUSCRIPT_SUBMITTED_AUTHOR_ACK', p_manuscript_id,
    'Submission received: ' || m.title, 'Your manuscript has been received and is awaiting editorial assignment.');

  return m;
end;
$$;

-- ------------------------------------------
-- assign_editor: identical to 0097_editorial_timeline_and_reminder.sql
-- except for the one new _notify() line for the author at the end.
-- ------------------------------------------
create or replace function public.assign_editor(p_manuscript_id text, p_editor_id uuid, p_start_date date, p_end_date date)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may assign an editor'; end if;
  if not exists (select 1 from public.profiles where id = p_editor_id and role = 'EDITOR' and status = 'ACTIVE') then
    raise exception 'Target is not an active Editor';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'An editorial timeline start and end date are required';
  end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'SUBMITTED' then raise exception 'Manuscript is not awaiting editor assignment (status=%)', m.status; end if;

  insert into public.editor_assignments (manuscript_id, editor_id, assigned_by, status, assessment_status, timeline_start_date, timeline_end_date)
  values (p_manuscript_id, p_editor_id, auth.uid(), 'INVITED', 'NOT_STARTED', p_start_date, p_end_date);

  update public.manuscripts set assigned_editor_id = p_editor_id, status = 'EDITOR_REVIEW', updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'SUBMITTED', 'EDITOR_REVIEW', 'assign_editor');
  perform public._notify(p_editor_id, 'EDITOR_ASSIGNED', p_manuscript_id,
    'You have been assigned: ' || m.title,
    'Editorial Timeline: ' || to_char(p_start_date, 'DD Mon YYYY') || ' - ' || to_char(p_end_date, 'DD Mon YYYY'));

  perform public._notify(m.author_id, 'EDITORIAL_REVIEW_STARTED', p_manuscript_id,
    'Your manuscript has entered editorial review: ' || m.title, '');

  return m;
end;
$$;

-- ------------------------------------------
-- submit_revision: identical to 0038_revision_loop_accept_and_author_response.sql
-- except for the one new _notify() line for the author (self-confirmation)
-- at the end.
-- ------------------------------------------
create or replace function public.submit_revision(p_manuscript_id text, p_response_note text default '')
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rev public.manuscript_revisions;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Only the author may submit a revision'; end if;
  if m.status is distinct from 'REVISION_REQUESTED' then raise exception 'No revision is pending (status=%)', m.status; end if;

  select * into rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id and status = 'AWAITING_AUTHOR_UPLOAD' order by revision_number desc limit 1;
  if rev.id is null then raise exception 'No pending revision record found'; end if;

  update public.manuscript_revisions
  set status = 'REVISION_SUBMITTED', submitted_at = timezone('utc', now()),
      author_response = nullif(trim(coalesce(p_response_note, '')), '')
  where id = rev.id;

  perform public._record_transition(p_manuscript_id, 'REVISION_REQUESTED', 'REVISION_REQUESTED', 'submit_revision', p_response_note);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'REVISION_SUBMITTED', p_manuscript_id, 'Revision submitted for review: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  perform public._notify(m.author_id, 'REVISION_SUBMITTED_AUTHOR_ACK', p_manuscript_id,
    'Your revision has been submitted: ' || m.title, 'Your revised manuscript is now with the editorial team for review.');

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

-- ------------------------------------------
-- author_submit_corrections: identical to 0069_editor_final_approval_workflow.sql
-- except for the one new _notify() line for the author (self-confirmation)
-- before the return.
-- ------------------------------------------
create or replace function public.author_submit_corrections(
  p_manuscript_id text, p_comments text, p_storage_path text, p_public_url text, p_file_name text
) returns public.manuscript_production_corrections language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;
  if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to request corrections'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('AUTHOR_PROOF_REVIEW','PROOF_SENT_TO_AUTHOR') then
    raise exception 'No proof awaiting your review (status=%)', p.production_status;
  end if;

  insert into public.manuscript_production_corrections
    (manuscript_id, proof_version, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source)
  values (p_manuscript_id, p.current_proof_version, p_comments, coalesce(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR')
  returning * into c;

  insert into public.manuscript_proof_reviews
    (manuscript_id, proof_version, reviewer_role, decision, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source, decided_by)
  values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FIRST', 'CORRECTIONS_REQUESTED', p_comments,
    nullif(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR', auth.uid());

  update public.manuscript_production
  set production_status = 'CORRECTIONS_IN_PROGRESS', pending_review_role = null, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;

  perform public._record_transition(p_manuscript_id, p.production_status, 'CORRECTIONS_IN_PROGRESS', 'author_submit_corrections',
    'Author submitted corrections for Proof v' || p.current_proof_version);

  if p.assigned_to is not null then
    perform public._notify(p.assigned_to, 'CORRECTIONS_SUBMITTED', p_manuscript_id, 'Author submitted proof corrections: ' || m.title, p_comments);
  end if;

  perform public._notify(m.author_id, 'CORRECTIONS_SUBMITTED_AUTHOR_ACK', p_manuscript_id,
    'Your corrections have been submitted: ' || coalesce(m.title, p_manuscript_id), '');

  return c;
end;
$$;

-- ------------------------------------------
-- author_final_review_proof: identical to 0096_editor_final_publish_decision.sql
-- except for the one new _notify() line for the author (self-confirmation),
-- added only to the APPROVE branch, before the final return.
-- ------------------------------------------
create or replace function public.author_final_review_proof(
  p_manuscript_id text, p_decision text, p_comments text default '',
  p_storage_path text default '', p_public_url text default '', p_file_name text default ''
) returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  if p_decision not in ('APPROVE','CORRECTIONS_REQUIRED') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'PROOF_SENT_TO_AUTHOR_FINAL' then
    raise exception 'No proof is currently awaiting your final review (status=%)', p.production_status;
  end if;

  if p_decision = 'CORRECTIONS_REQUIRED' then
    if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to request corrections'; end if;

    insert into public.manuscript_production_corrections
      (manuscript_id, proof_version, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source)
    values (p_manuscript_id, p.current_proof_version, p_comments, coalesce(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR')
    returning * into c;

    insert into public.manuscript_proof_reviews
      (manuscript_id, proof_version, reviewer_role, decision, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FINAL', 'CORRECTIONS_REQUESTED', p_comments,
      nullif(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR', auth.uid());

    if p.editor_approved_version is not null then
      update public.manuscript_proof_reviews
      set superseded_at = timezone('utc', now())
      where manuscript_id = p_manuscript_id and reviewer_role = 'EDITOR'
        and proof_version = p.editor_approved_version and superseded_at is null;
    end if;

    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED', pending_review_role = null,
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED',
      'author_final_review_proof', p_comments);

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED', p_manuscript_id,
      'Author requested corrections on final review: ' || coalesce(m.title, p_manuscript_id), p_comments
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  else
    if p.editor_approved_version is distinct from p.current_proof_version then
      raise exception 'Editor approval is not current for this proof version -- cannot give final approval';
    end if;

    update public.manuscript_proofs set approved_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id and version = p.current_proof_version;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FINAL', 'APPROVED', coalesce(p_comments, ''), auth.uid());

    -- Module 96 (restoring Module 80): lands with the Coordinator, who must
    -- explicitly send it to the Editor for the final publish decision.
    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_APPROVED', pending_review_role = null,
        author_final_approved_version = current_proof_version, author_final_approved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'AUTHOR_FINAL_APPROVED',
      'author_final_review_proof', 'Author gave final approval on Proof v' || p.current_proof_version);

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_APPROVED', p_manuscript_id, 'Author gave final approval: ' || coalesce(m.title, p_manuscript_id), ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

    perform public._notify(m.author_id, 'FINAL_APPROVAL_COMPLETED_AUTHOR_ACK', p_manuscript_id,
      'Your final approval has been recorded: ' || coalesce(m.title, p_manuscript_id), '');
  end if;

  return p;
end;
$$;
