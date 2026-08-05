-- ==========================================
-- Dev-only bootstrap + demo data. NOT part of the migration chain (don't
-- run this against a real/production project) -- it hardcodes real test
-- emails and directly flips role/status the same way approve_user_role()
-- would, plus seeds a few manuscripts across different workflow stages so
-- Modules 3-6 have something real to build and test against.
--
-- Safe to re-run: every statement is an upsert-style UPDATE/ON CONFLICT.
-- ==========================================

-- 1. Bootstrap the real Coordinator (no Coordinator exists yet to approve
--    one through the normal approve_user_role() flow, so this is the one
--    place we bypass that and set it directly).
update public.profiles
set role = 'COORDINATOR', status = 'ACTIVE', requested_role = 'COORDINATOR', approved_at = timezone('utc', now())
where email = 'akshaya.techsupport@guires.com';

-- 2. Activate the demo Editor/Reviewer accounts registered for testing.
update public.profiles set role = requested_role, status = 'ACTIVE', approved_at = timezone('utc', now())
where email in ('demo.editor1@example.com', 'demo.editor2@example.com', 'demo.reviewer1@example.com', 'demo.reviewer2@example.com')
  and status = 'PENDING_APPROVAL';

-- 3. Seed manuscripts across different workflow stages. Triggers are
--    disabled for this block only (session_replication_role = replica) so
--    the author-stamping trigger doesn't try to use auth.uid(), which is
--    null in the SQL editor's own session.
do $$
declare
  v_author uuid; v_editor1 uuid; v_editor2 uuid; v_reviewer1 uuid; v_reviewer2 uuid; v_coordinator uuid;
begin
  set local session_replication_role = replica;

  select id into v_author from public.profiles where email = 'module1-test-author@example.com';
  select id into v_editor1 from public.profiles where email = 'demo.editor1@example.com';
  select id into v_editor2 from public.profiles where email = 'demo.editor2@example.com';
  select id into v_reviewer1 from public.profiles where email = 'demo.reviewer1@example.com';
  select id into v_reviewer2 from public.profiles where email = 'demo.reviewer2@example.com';
  select id into v_coordinator from public.profiles where email = 'akshaya.techsupport@guires.com';

  if v_author is null or v_editor1 is null or v_editor2 is null or v_reviewer1 is null or v_reviewer2 is null or v_coordinator is null then
    raise exception 'One or more demo/coordinator accounts not found -- register them first.';
  end if;

  -- Clear any previous run of this seed script.
  delete from public.manuscripts where id in ('DEMO-101','DEMO-102','DEMO-103','DEMO-104','DEMO-105');

  -- DEMO-101: just submitted, unassigned -- sits in the Coordinator's queue.
  insert into public.manuscripts (id, title, abstract, is_double_blind, status, author_id, author_name, author_email, submitted_at)
  values ('DEMO-101', 'Federated Learning Privacy Guarantees under Byzantine Attacks',
    'We analyze differential privacy bounds for federated learning systems operating under adversarial Byzantine node behavior.',
    true, 'SUBMITTED', v_author, 'Test Author', 'module1-test-author@example.com', timezone('utc', now()) - interval '2 days');
  insert into public.manuscript_status_history (manuscript_id, from_status, to_status, actor_id) values ('DEMO-101', 'DRAFT', 'SUBMITTED', v_author);

  -- DEMO-102: assigned to an editor who has accepted but not yet evaluated.
  insert into public.manuscripts (id, title, abstract, is_double_blind, status, author_id, author_name, author_email, assigned_editor_id, submitted_at)
  values ('DEMO-102', 'Scalable Consensus Protocols for Edge Computing',
    'A new leaderless consensus protocol designed for high-churn edge computing clusters with intermittent connectivity.',
    true, 'EDITOR_REVIEW', v_author, 'Test Author', 'module1-test-author@example.com', v_editor1, timezone('utc', now()) - interval '5 days');
  insert into public.editor_assignments (manuscript_id, editor_id, assigned_by, status, assigned_at, responded_at)
  values ('DEMO-102', v_editor1, v_coordinator, 'ACCEPTED', timezone('utc', now()) - interval '4 days', timezone('utc', now()) - interval '3 days');
  insert into public.manuscript_status_history (manuscript_id, from_status, to_status, actor_id) values
    ('DEMO-102', 'DRAFT', 'SUBMITTED', v_author),
    ('DEMO-102', 'SUBMITTED', 'EDITOR_REVIEW', v_coordinator);

  -- DEMO-103: editor evaluated and suggested reviewers; Coordinator assigned
  -- 2 reviewers; one has accepted, one is still pending a response.
  insert into public.manuscripts (id, title, abstract, is_double_blind, status, author_id, author_name, author_email, assigned_editor_id, submitted_at)
  values ('DEMO-103', 'Explainable AI for Clinical Diagnosis Support',
    'We present an interpretable attention-based architecture for clinical decision support, validated against three hospital datasets.',
    true, 'UNDER_REVIEW', v_author, 'Test Author', 'module1-test-author@example.com', v_editor2, timezone('utc', now()) - interval '10 days');
  insert into public.editor_assignments (
    manuscript_id, editor_id, assigned_by, status, assigned_at, responded_at,
    scientific_merit, novelty_innovation, methodology_quality, literature_adequacy, ethical_compliance, data_reliability, writing_quality,
    strengths, weaknesses, mandatory_revisions, comments_to_coordinator, assessment_status, assessment_submitted_at
  ) values (
    'DEMO-103', v_editor2, v_coordinator, 'ACCEPTED', timezone('utc', now()) - interval '9 days', timezone('utc', now()) - interval '8 days',
    8, 7, 8, 7, 9, 8, 7,
    'Rigorous clinical validation across multiple sites.', 'Related work section is thin.', 'Expand related work; clarify dataset licensing.',
    'Strong submission, recommend proceeding to peer review.', 'SUBMITTED', timezone('utc', now()) - interval '7 days'
  );
  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note) values
    ('DEMO-103', 'EDITOR', v_editor2, 'Dr. Priya Nair', 'priya.nair@example.edu', 'Expert in clinical ML interpretability.');
  insert into public.reviewer_assignments (manuscript_id, reviewer_id, assigned_by, status, invited_at, responded_at) values
    ('DEMO-103', v_reviewer1, v_coordinator, 'ACCEPTED', timezone('utc', now()) - interval '6 days', timezone('utc', now()) - interval '5 days'),
    ('DEMO-103', v_reviewer2, v_coordinator, 'INVITED', timezone('utc', now()) - interval '6 days', null);
  insert into public.manuscript_status_history (manuscript_id, from_status, to_status, actor_id) values
    ('DEMO-103', 'DRAFT', 'SUBMITTED', v_author),
    ('DEMO-103', 'SUBMITTED', 'EDITOR_REVIEW', v_coordinator),
    ('DEMO-103', 'EDITOR_REVIEW', 'UNDER_REVIEW', v_coordinator);

  -- DEMO-104: both reviews are in, awaiting the editor's recommendation /
  -- Coordinator's final decision.
  insert into public.manuscripts (id, title, abstract, is_double_blind, status, author_id, author_name, author_email, assigned_editor_id, submitted_at)
  values ('DEMO-104', 'Quantum-Resistant Cryptographic Signatures for IoT',
    'A lattice-based signature scheme optimized for constrained IoT hardware, benchmarked against NIST PQC finalists.',
    true, 'AWAITING_DECISION', v_author, 'Test Author', 'module1-test-author@example.com', v_editor1, timezone('utc', now()) - interval '20 days');
  insert into public.editor_assignments (
    manuscript_id, editor_id, assigned_by, status, assigned_at, responded_at,
    scientific_merit, novelty_innovation, methodology_quality, literature_adequacy, ethical_compliance, data_reliability, writing_quality,
    strengths, weaknesses, mandatory_revisions, comments_to_coordinator, assessment_status, assessment_submitted_at
  ) values (
    'DEMO-104', v_editor1, v_coordinator, 'ACCEPTED', timezone('utc', now()) - interval '19 days', timezone('utc', now()) - interval '18 days',
    9, 8, 8, 8, 9, 8, 8,
    'Strong cryptographic proofs, thorough benchmarking.', 'Hardware cost analysis could be deeper.', 'Add cost analysis for low-power microcontrollers.',
    'Excellent submission.', 'SUBMITTED', timezone('utc', now()) - interval '17 days'
  );
  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at, responded_at, submitted_at,
    recommendation, comments_to_author, comments_to_editor,
    scientific_merit, novelty_innovation, methodology_quality, literature_adequacy, ethical_compliance, data_reliability, writing_quality
  ) values
    ('DEMO-104', v_reviewer1, v_coordinator, 'SUBMITTED', timezone('utc', now()) - interval '15 days', timezone('utc', now()) - interval '14 days', timezone('utc', now()) - interval '3 days',
     'MINOR_REVISION', 'Solid work, please clarify Section 4.2.', 'Recommend acceptance after minor revisions.', 9, 8, 8, 7, 9, 8, 8),
    ('DEMO-104', v_reviewer2, v_coordinator, 'SUBMITTED', timezone('utc', now()) - interval '15 days', timezone('utc', now()) - interval '13 days', timezone('utc', now()) - interval '2 days',
     'ACCEPT', 'Well-executed study, no major concerns.', 'Ready for acceptance.', 9, 9, 8, 8, 9, 9, 8);
  insert into public.manuscript_status_history (manuscript_id, from_status, to_status, actor_id) values
    ('DEMO-104', 'DRAFT', 'SUBMITTED', v_author),
    ('DEMO-104', 'SUBMITTED', 'EDITOR_REVIEW', v_coordinator),
    ('DEMO-104', 'EDITOR_REVIEW', 'UNDER_REVIEW', v_coordinator),
    ('DEMO-104', 'UNDER_REVIEW', 'AWAITING_DECISION', v_reviewer2);

  -- DEMO-105: full cycle complete -- editor recommended, Coordinator
  -- published an ACCEPT decision.
  insert into public.manuscripts (id, title, abstract, is_double_blind, status, author_id, author_name, author_email, assigned_editor_id, submitted_at)
  values ('DEMO-105', 'A Longitudinal Study of Renewable Grid Stability',
    'A 5-year longitudinal analysis of grid frequency stability under increasing renewable penetration across 12 regional grids.',
    true, 'ACCEPTED', v_author, 'Test Author', 'module1-test-author@example.com', v_editor2, timezone('utc', now()) - interval '40 days');
  insert into public.editor_assignments (
    manuscript_id, editor_id, assigned_by, status, assigned_at, responded_at,
    scientific_merit, novelty_innovation, methodology_quality, literature_adequacy, ethical_compliance, data_reliability, writing_quality,
    strengths, weaknesses, mandatory_revisions, comments_to_coordinator, assessment_status, assessment_submitted_at,
    recommendation, recommendation_submitted_at
  ) values (
    'DEMO-105', v_editor2, v_coordinator, 'ACCEPTED', timezone('utc', now()) - interval '39 days', timezone('utc', now()) - interval '38 days',
    9, 7, 9, 8, 9, 9, 8,
    'Comprehensive longitudinal dataset, rigorous statistical methodology.', 'Minor formatting issues.', 'None required.',
    'Excellent, ready for review.', 'SUBMITTED', timezone('utc', now()) - interval '37 days',
    'ACCEPT', timezone('utc', now()) - interval '5 days'
  );
  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at, responded_at, submitted_at,
    recommendation, comments_to_author, comments_to_editor,
    scientific_merit, novelty_innovation, methodology_quality, literature_adequacy, ethical_compliance, data_reliability, writing_quality
  ) values
    ('DEMO-105', v_reviewer1, v_coordinator, 'SUBMITTED', timezone('utc', now()) - interval '35 days', timezone('utc', now()) - interval '34 days', timezone('utc', now()) - interval '20 days',
     'ACCEPT', 'Excellent longitudinal methodology.', 'Recommend acceptance.', 9, 7, 9, 8, 9, 9, 8),
    ('DEMO-105', v_reviewer2, v_coordinator, 'SUBMITTED', timezone('utc', now()) - interval '35 days', timezone('utc', now()) - interval '33 days', timezone('utc', now()) - interval '18 days',
     'ACCEPT', 'Solid contribution to grid stability literature.', 'Recommend acceptance.', 8, 7, 8, 8, 9, 8, 8);
  insert into public.manuscript_status_history (manuscript_id, from_status, to_status, actor_id, note) values
    ('DEMO-105', 'DRAFT', 'SUBMITTED', v_author, null),
    ('DEMO-105', 'SUBMITTED', 'EDITOR_REVIEW', v_coordinator, null),
    ('DEMO-105', 'EDITOR_REVIEW', 'UNDER_REVIEW', v_coordinator, null),
    ('DEMO-105', 'UNDER_REVIEW', 'AWAITING_DECISION', v_reviewer2, null),
    ('DEMO-105', 'AWAITING_DECISION', 'ACCEPTED', v_coordinator, 'Congratulations, your manuscript has been accepted.');

end $$;

select id, title, status, assigned_editor_id from public.manuscripts order by id;
