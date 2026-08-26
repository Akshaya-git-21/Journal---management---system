-- ==========================================
-- Module 36 (Phase 3): standardized user-facing manuscript status.
--
-- Spec requires exactly 8 statuses shown to every role identically:
-- SUBMITTED, EDITORIAL REVIEW, IN REVISION, PEER REVIEW, ACCEPTED, REJECTED,
-- PROOFREADING, PUBLISHED -- with role-specific internal states (editor
-- assignment status, reviewer invite/accept status, revision sub-status,
-- coordinator relay steps) never shown as the primary status.
--
-- `manuscripts.status` intentionally keeps its existing 9 raw values (see
-- manuscript_status_check in 0002_manuscripts_workflow.sql) -- every RPC in
-- Phase 1/2 depends on those exact strings, and rewriting the enum would
-- mean touching every one of them for zero functional gain. Instead this
-- adds ONE computed column, exposed via Postgres/PostgREST's "computed
-- column" convention (a function whose sole argument is the table's row
-- type becomes selectable as `display_status` in any `.select()` against
-- `manuscripts`, automatically included in every realtime-triggered
-- refetch since those all go through a normal PostgREST select, not a
-- payload merge -- confirmed by reading subscribeToManuscripts() /
-- subscribeToEditorAssignments() in the frontend, which only use realtime
-- as a "something changed, refetch" signal).
--
-- security definer so it can see the full reviewer_assignments picture
-- (needed to know "did both reviewers accept") regardless of the calling
-- role's own RLS on that table -- critical for the Reviewer role, whose
-- reviewer_assignments RLS only exposes their OWN row (by design, to
-- preserve double-blind review: a reviewer must not learn who else is
-- reviewing). Returning only a coarse status string, never raw rows,
-- means this cannot leak reviewer identity.
--
-- Depends on: 0002_manuscripts_workflow.sql (manuscripts, production_stage),
-- 0008_reviewer_assignment_workflow.sql (reviewer_assignments),
-- 0017/0018 (manuscript_revisions), 0031 (reviewer_assignments.revision_number),
-- 0029 (manuscript_revisions.origin -- unused here directly, but the same
-- round-scoping logic as submit_peer_review's completion check in 0034).
-- Safe to re-run.
-- ==========================================

create or replace function public.display_status(m public.manuscripts)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case m.status
    when 'DRAFT' then 'DRAFT'
    when 'SUBMITTED' then 'SUBMITTED'
    when 'EDITOR_REVIEW' then 'EDITORIAL REVIEW'
    when 'REJECTED' then 'REJECTED'
    when 'PUBLISHED' then 'PUBLISHED'
    when 'ACCEPTED' then
      case when m.production_stage = 'SENT_TO_PUBLISHER' then 'PROOFREADING' else 'ACCEPTED' end
    when 'UNDER_REVIEW' then
      -- Peer Review only once the CURRENT round has >=2 reviewers who have
      -- actually accepted (ACCEPTED or further, i.e. SUBMITTED) -- mirrors
      -- the round-scoped completion check added in
      -- 0034_reviewer_replacement_round_isolation.sql. A re-review round
      -- sets manuscripts.status = 'UNDER_REVIEW' immediately (see
      -- 0031_reviewer_revision_loop.sql), before either reviewer has
      -- responded, so this cannot just trust the raw status value.
      case when (
        select count(*) from public.reviewer_assignments ra
        where ra.manuscript_id = m.id
          and ra.revision_number = coalesce((select max(revision_number) from public.reviewer_assignments where manuscript_id = m.id), 0)
          and ra.status in ('ACCEPTED', 'SUBMITTED')
      ) >= 2 then 'PEER REVIEW' else 'EDITORIAL REVIEW' end
    when 'AWAITING_DECISION' then
      -- Once any reviewer has ever been assigned to this manuscript, every
      -- subsequent decision (original round, revision-loop re-review) is a
      -- peer-review-track decision -- publish_decision() (0029) tags every
      -- later revision origin='PEER_REVIEW' on exactly this same condition,
      -- so this stays consistent with that tagging. No reviewers yet means
      -- this is the editor-screening decision still pending Coordinator
      -- confirmation.
      case when exists (select 1 from public.reviewer_assignments where manuscript_id = m.id)
        then 'PEER REVIEW' else 'EDITORIAL REVIEW' end
    when 'REVISION_REQUESTED' then
      -- With the author (not yet uploaded) -> IN REVISION. Once uploaded --
      -- whether still "with coordinator" (REVISION_SUBMITTED) or already
      -- forwarded ("with editor", manuscript_revisions.status=UNDER_REVIEW
      -- for an EDITOR_SCREENING-origin loop only -- a PEER_REVIEW-origin
      -- revision flips manuscripts.status straight to UNDER_REVIEW the
      -- moment it's sent to reviewers, see 0031, so it never lingers here)
      -- the ball is back in the editorial court, so it reads EDITORIAL
      -- REVIEW rather than staying IN REVISION -- matches spec Test 4
      -- ("Author submits revision -> verify manuscript returns to
      -- EDITORIAL REVIEW" as soon as the author submits, before the
      -- Coordinator even forwards it).
      case when (
        select r.status from public.manuscript_revisions r
        where r.manuscript_id = m.id
        order by r.revision_number desc limit 1
      ) = 'AWAITING_AUTHOR_UPLOAD' then 'IN REVISION' else 'EDITORIAL REVIEW' end
    else upper(replace(m.status, '_', ' '))
  end
$$;

revoke all on function public.display_status(public.manuscripts) from public;
grant execute on function public.display_status(public.manuscripts) to authenticated;
