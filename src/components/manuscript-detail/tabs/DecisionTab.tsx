import { useState, useEffect } from 'react';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, StatusHistoryRow, ProfileRow, ScreeningResponse } from '../../../lib/workflow';
import { publishDecision, coordinatorSendRevisionToReviewers, listActiveProfilesByRole } from '../../../lib/workflow';
import { getProduction, startProduction, assignGDMember, subscribeToProduction } from '../../../lib/production';
import { createAndActivateGDMemberAccount } from '../../../lib/auth';
import { AlertCircle, Users, UserCheck, Gavel, FileCheck, ChevronDown, ChevronRight, PackageCheck, Loader2, CheckCircle2, CheckCircle, XCircle, ClipboardList, UserPlus, X } from 'lucide-react';
import { getRevisionDecisionLabel } from '../../../lib/decisionUtils';
import { getManuscriptStatusMeta, getManuscriptStatusLabel, getLatestRevision } from '../../../lib/manuscriptStatusLabel';

interface Props {
  manuscript: ManuscriptRow;
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  revisions: RevisionRow[];
  statusHistory: StatusHistoryRow[];
  profiles: Record<string, ProfileRow>;
  isEditor?: boolean;
  onWorkflowChange: () => void;
}

const SCREENING_QUESTION_LABELS: Record<string, string> = {
  scope_fit: 'Journal Scope Fit',
  novelty_significance: 'Novelty and Significance',
  scientific_soundness: 'Scientific Soundness',
  completeness: 'Manuscript Completeness',
  guidelines_compliance: 'Author Guidelines Compliance',
  ethical_compliance: 'Ethical Compliance',
  disclosures: 'Disclosures and Declarations',
  research_integrity: 'Research Integrity',
  language_clarity: 'Language and Clarity',
  reviewer_suitability: 'Reviewer Suitability',
};

const DECISION_LABELS: Record<string, string> = {
  ACCEPT: 'Accept',
  MINOR_REVISION: 'Minor Revision',
  MAJOR_REVISION: 'Major Revision',
  REJECT: 'Reject',
  SPLIT: 'Split decision',
};

// Screening-stage Editor decision: only Reject Submission / Return to
// Author / Move to Next Stage exist (see EditorEvaluationFormTab.tsx's
// ACTION_META) -- MAJOR_REVISION is how "Return to Author" is stored, not
// a real "Major Revision" decision type at this stage.
const SCREENING_DECISION_LABELS: Record<string, string> = {
  ACCEPT: 'Move to Next Stage',
  MAJOR_REVISION: 'Return to Author',
  MINOR_REVISION: 'Return to Author',
  REJECT: 'Reject Submission',
};

function DecisionPill({ decision, size = 'sm', screeningStage = false }: { decision: string | null; size?: 'sm' | 'lg'; screeningStage?: boolean }) {
  if (!decision) return <span className="text-xs text-slate-400 italic">Pending</span>;
  const style =
    decision === 'ACCEPT' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
    decision === 'REJECT' ? 'bg-red-100 text-red-800 border-red-300' :
    decision === 'SPLIT' ? 'bg-slate-100 text-slate-600 border-slate-200' :
    decision === 'MAJOR_REVISION' ? 'bg-orange-100 text-orange-800 border-orange-300' :
    'bg-amber-100 text-amber-800 border-amber-300';
  const labels = screeningStage ? SCREENING_DECISION_LABELS : DECISION_LABELS;
  return (
    <span className={`font-bold rounded-full border ${style} ${size === 'lg' ? 'text-sm px-4 py-1.5' : 'text-xs px-2.5 py-1'}`}>
      {labels[decision] || decision.replace(/_/g, ' ')}
    </span>
  );
}

function buildAuthorNote(editorComments: string | null | undefined, reviewerComments: string[]): string {
  const parts: string[] = [];
  if (editorComments?.trim()) parts.push(`Editor Comments:\n${editorComments.trim()}`);
  if (reviewerComments.length > 0) {
    parts.push(`Reviewer Comments:\n${reviewerComments.map((c, i) => `Reviewer ${i + 1}: ${c.trim()}`).join('\n\n')}`);
  }
  return parts.join('\n\n');
}

export function DecisionTab({
  manuscript,
  editorAssignments,
  reviewerAssignments,
  revisions,
  profiles,
  isEditor,
  onWorkflowChange
}: Props) {
  const [decision, setDecision] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null>(null);
  const [letter, setLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRevisions, setExpandedRevisions] = useState<Record<string, boolean>>({});
  const [firstSubmissionExpanded, setFirstSubmissionExpanded] = useState(false);
  const [reviewerDecisionsExpanded, setReviewerDecisionsExpanded] = useState(true);
  const [finalDecisionExpanded, setFinalDecisionExpanded] = useState(true);
  const [productionStatus, setProductionStatus] = useState<string | null>(null);
  const [movingToProduction, setMovingToProduction] = useState(false);
  const [moveToProductionError, setMoveToProductionError] = useState('');
  // GD Member assignment gate -- clicking "Move to Production" must not
  // actually start production until a GD Member is assigned (see the
  // Coordinator's requirement: "if no GD Member is assigned, a popup should
  // appear" offering Assign Existing / Create New). Since a manuscript_production
  // row (and therefore any assignment) can't exist before production starts,
  // this check is always true pre-move -- the gate always opens on first
  // click, which is the correct/expected behavior, not a bug.
  const [showGDGateModal, setShowGDGateModal] = useState(false);
  const [gdGateMode, setGdGateMode] = useState<'PICK' | 'CREATE'>('PICK');
  const [gdGateMembers, setGdGateMembers] = useState<ProfileRow[]>([]);
  const [gdGateLoadingMembers, setGdGateLoadingMembers] = useState(false);
  const [selectedGdMemberForGate, setSelectedGdMemberForGate] = useState('');
  const [gdGateName, setGdGateName] = useState('');
  const [gdGateEmail, setGdGateEmail] = useState('');
  const [gdGatePassword, setGdGatePassword] = useState('');
  const [gdGateBusy, setGdGateBusy] = useState(false);
  const [gdGateError, setGdGateError] = useState('');
  const [createdGdCredentials, setCreatedGdCredentials] = useState<{ email: string; password: string } | null>(null);
  const toggleRevisionExpanded = (id: string) => setExpandedRevisions(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    let cancelled = false;
    if (manuscript.status !== 'ACCEPTED') { setProductionStatus(null); return; }
    const refetch = () => getProduction(manuscript.id).then((p) => { if (!cancelled) setProductionStatus(p?.production_status ?? null); }).catch(() => {});
    refetch();
    const unsubscribe = subscribeToProduction(refetch);
    return () => { cancelled = true; unsubscribe(); };
  }, [manuscript.id, manuscript.status]);

  const generateGdGatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  };

  const openGDGateModal = async () => {
    setGdGateMode('PICK');
    setSelectedGdMemberForGate('');
    setGdGateName('');
    setGdGateEmail('');
    setGdGatePassword(generateGdGatePassword());
    setGdGateError('');
    setCreatedGdCredentials(null);
    setShowGDGateModal(true);
    setGdGateLoadingMembers(true);
    try {
      const members = await listActiveProfilesByRole('GD_MEMBER');
      setGdGateMembers(members);
      if (members.length === 0) setGdGateMode('CREATE');
    } catch {
      setGdGateMembers([]);
    } finally {
      setGdGateLoadingMembers(false);
    }
  };

  const finalizeMoveToProduction = async (gdMemberId: string) => {
    setMovingToProduction(true);
    setMoveToProductionError('');
    try {
      const p = await startProduction(manuscript.id);
      await assignGDMember(manuscript.id, gdMemberId);
      setProductionStatus(p.production_status);
      onWorkflowChange();
      return true;
    } catch (e: any) {
      setGdGateError(e.message || 'Failed to move manuscript to production.');
      return false;
    } finally {
      setMovingToProduction(false);
    }
  };

  const handleMoveToProduction = async () => {
    if (movingToProduction || !canMoveToProduction) return;
    setMoveToProductionError('');
    try {
      const existing = await getProduction(manuscript.id);
      if (existing?.assigned_to) {
        // Already assigned (e.g. re-opened after a failed publish attempt) --
        // no need to gate again, just proceed.
        await finalizeMoveToProduction(existing.assigned_to);
      } else {
        await openGDGateModal();
      }
    } catch (e: any) {
      setMoveToProductionError(e.message || 'Failed to move manuscript to production.');
    }
  };

  const handleAssignExistingInGate = async () => {
    if (!selectedGdMemberForGate) return;
    const ok = await finalizeMoveToProduction(selectedGdMemberForGate);
    if (ok) setShowGDGateModal(false);
  };

  const handleCreateAndAssignInGate = async () => {
    const normalizedName = gdGateName.trim();
    const normalizedEmail = gdGateEmail.trim().toLowerCase();
    if (!normalizedName) { setGdGateError('Please enter the GD Member name.'); return; }
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setGdGateError('Please enter a valid email address.'); return; }
    const password = gdGatePassword.trim() || generateGdGatePassword();
    if (password.length < 6) { setGdGateError('Password must be at least 6 characters.'); return; }

    setGdGateBusy(true);
    setGdGateError('');
    try {
      const profile = await createAndActivateGDMemberAccount(normalizedEmail, password, normalizedName);
      if (!profile) throw new Error('GD Member account was created but could not be looked up.');
      const ok = await finalizeMoveToProduction(profile.id);
      // Keep the modal open to show the generated credentials once, instead
      // of closing immediately -- otherwise the Coordinator has no way to
      // retrieve this password again (no email delivery is connected).
      if (ok) setCreatedGdCredentials({ email: normalizedEmail, password });
    } catch (e: any) {
      setGdGateError(e.message || 'Failed to create the GD Member account.');
    } finally {
      setGdGateBusy(false);
    }
  };

  const hasEditorEvaluation = editorAssignments.some(a => a.assessment_status === 'SUBMITTED');
  // Declined rows don't block completion -- only the non-declined ones need
  // to have actually submitted (a stale DECLINED row would otherwise
  // permanently block this from ever being "ready", since it never becomes
  // SUBMITTED).
  const activeReviewerAssignments = reviewerAssignments.filter(r => r.status !== 'DECLINED');
  const hasRequiredReviews = activeReviewerAssignments.length > 0 && activeReviewerAssignments.every(r => r.status === 'SUBMITTED');

  const activeEditor = editorAssignments.find(a => a.status === 'ACCEPTED') || editorAssignments[0];
  const latestRevision = getLatestRevision(revisions);
  const sortedRevisions = [...revisions].sort((a, b) => a.revision_number - b.revision_number);
  const firstSubmissionRevision = sortedRevisions[0] || null;
  // The most recent revision cycle that an editor has actually decided on.
  // Once the coordinator finalizes a MINOR/MAJOR decision, a fresh blank
  // revision row is created for the next cycle -- latestRevision then points
  // at that new (undecided) row, so the editor/coordinator decision data for
  // the cycle that was just closed out has to be read from here instead.
  const decidedRevision = [...revisions].reverse().find(r => r.editor_decision) || null;
  // True while the Coordinator still needs to confirm the editor's decision
  // on the CURRENT revision cycle (submit_editor_recommendation parks the
  // manuscript at AWAITING_DECISION without opening the next cycle -- see
  // 0020_coordinator_gated_revision_decision.sql). Revision cycles reset
  // editor_assignments.assessment_status to NOT_STARTED and never resubmit
  // it (no scoring step on EditorRevisionReview.tsx), so hasEditorEvaluation
  // doesn't apply here -- decidedRevision.editor_decision is the evidence
  // the editor has in fact decided.
  const pendingRevisionConfirm = !!(
    manuscript.status === 'AWAITING_DECISION' &&
    decidedRevision && latestRevision &&
    decidedRevision.id === latestRevision.id &&
    !decidedRevision.coordinator_decision
  );
  // Peer-review round: reviews already pushed the manuscript to
  // AWAITING_DECISION and at least one reviewer was ever assigned -- the
  // screening round's own AWAITING_DECISION (reject/revision) always has
  // zero reviewerAssignments, since reviewers aren't selected until
  // screening ACCEPTs. Distinct from the revision-loop round, which always
  // has sortedRevisions.length > 0.
  const isPeerReviewRound = sortedRevisions.length === 0 && reviewerAssignments.length > 0;
  const latestReviewSubmittedAt = activeReviewerAssignments.reduce<string | null>((latest, r) => (
    r.submitted_at && (!latest || r.submitted_at > latest) ? r.submitted_at : latest
  ), null);
  // Same "only counts if it postdates what it's deciding on" rule as
  // EditorWorkspace.tsx's own Decision tab -- the Coordinator must not be
  // able to act on a stale screening-round recommendation as if it were the
  // Editor's actual peer-review call.
  const editorDecisionIsFreshForPeerReview = !!(
    activeEditor?.recommendation && activeEditor.recommendation_submitted_at &&
    latestReviewSubmittedAt && activeEditor.recommendation_submitted_at > latestReviewSubmittedAt
  );
  const pendingPeerReviewConfirm = isPeerReviewRound && manuscript.status === 'AWAITING_DECISION' && editorDecisionIsFreshForPeerReview;
  // The VERY FIRST screening-stage decision (Reject Submission / Return to
  // Author / Move to Next Stage) -- no revision has ever been created yet
  // (sortedRevisions.length === 0, so pendingRevisionConfirm can't apply)
  // and no reviewer has ever been assigned (reviewerAssignments.length ===
  // 0, so pendingPeerReviewConfirm/isPeerReviewRound can't apply either).
  // Without this, the Coordinator fell through to the free 4-button picker
  // below even though the Editor already decided -- same confirm-only
  // pattern as the other two rounds, just never extended to this one.
  const pendingScreeningConfirm = !!(
    sortedRevisions.length === 0 && reviewerAssignments.length === 0 &&
    manuscript.status === 'AWAITING_DECISION' && activeEditor?.recommendation
  );
  // The backend (publish_decision RPC) only accepts a decision once the
  // manuscript has actually reached AWAITING_DECISION -- checking just
  // hasEditorEvaluation/hasRequiredReviews let the form render as "ready"
  // before reviewers were even assigned (reviewerAssignments.length === 0
  // trivially satisfies hasRequiredReviews), so Submit always failed with
  // "Manuscript is not awaiting a decision".
  const canDecide = manuscript.status === 'AWAITING_DECISION' &&
    (pendingRevisionConfirm || (hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews)));

  // Pre-fill the note-to-author with the Editor's own Return to
  // Author / Rejection reason so it reaches the Author by default -- the
  // Coordinator can still edit it, but the Editor's actual words are what
  // gets sent unless the Coordinator deliberately changes them.
  useEffect(() => {
    if (pendingScreeningConfirm && !letter && activeEditor?.action_reason) {
      setLetter(activeEditor.action_reason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScreeningConfirm, activeEditor?.action_reason]);

  // Pre-fill the note-to-author with the Editor's comments AND each
  // reviewer's Comments to Author for this round -- so what the Coordinator
  // sends the Author already contains both, not just whatever the
  // Coordinator happens to retype. Only comments_to_author is ever pulled
  // in here (never comments_to_editor, which is explicitly confidential to
  // the Editor) -- the Coordinator can still edit/trim this before sending.
  useEffect(() => {
    if (pendingRevisionConfirm && !letter && decidedRevision) {
      const roundReviewerComments = reviewerAssignments
        .filter(r => (r.revision_number ?? 0) === decidedRevision.revision_number && r.status === 'SUBMITTED' && r.comments_to_author)
        .map(r => r.comments_to_author as string);
      const combined = buildAuthorNote(decidedRevision.editor_comments, roundReviewerComments);
      if (combined) setLetter(combined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRevisionConfirm, decidedRevision?.id]);

  useEffect(() => {
    if (pendingPeerReviewConfirm && !letter && activeEditor) {
      const roundReviewerComments = reviewerAssignments
        .filter(r => r.status === 'SUBMITTED' && r.comments_to_author)
        .map(r => r.comments_to_author as string);
      const combined = buildAuthorNote(activeEditor.peer_review_comments, roundReviewerComments);
      if (combined) setLetter(combined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPeerReviewConfirm, activeEditor?.peer_review_comments]);
  const decided = ['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED', 'PUBLISHED'].includes(manuscript.status);
  const statusMeta = getManuscriptStatusMeta(manuscript, latestRevision, productionStatus);
  const canMoveToProduction = manuscript.status === 'ACCEPTED' && (!productionStatus || productionStatus === 'NOT_STARTED');
  const finalDecisionLabel =
    manuscript.status === 'ACCEPTED' ? 'ACCEPT' :
    manuscript.status === 'REJECTED' ? 'REJECT' :
    manuscript.status === 'REVISION_REQUESTED' ? (latestRevision?.decision_type || null) :
    null;
  // When the coordinator's final decision on this revision is already
  // recorded (publish_decision stamps coordinator_decision onto the
  // revision it just closed out -- see 0019_revision_comments_checklist.sql),
  // prefer its exact dynamic label ("Minor Revision 2") over the generic one.
  const finalRevisionDecisionLabel = decidedRevision?.coordinator_decision
    ? getRevisionDecisionLabel(decidedRevision.coordinator_decision, decidedRevision.revision_number)
    : null;

  const submitPublishDecision = async (finalDecision: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT') => {
    setLoading(true);
    setError('');

    try {
      await publishDecision(manuscript.id, finalDecision, letter);
      onWorkflowChange();
      setDecision(null);
      setLetter('');
    } catch (e: any) {
      setError(e.message || 'Failed to make decision');
    } finally {
      setLoading(false);
    }
  };

  const handleMakeDecision = () => {
    if (!decision) return;
    return submitPublishDecision(decision);
  };

  const handleConfirmRevisionDecision = () => {
    if (!decidedRevision?.editor_decision) return;
    return submitPublishDecision(decidedRevision.editor_decision as 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION');
  };

  // Editor asked for another look from the reviewers instead of deciding
  // unilaterally (EditorRevisionReview.tsx's "Move to Reviewer" action) --
  // the Coordinator carries that out here rather than confirming a
  // publish_decision outcome. See coordinator_send_revision_to_reviewers()
  // in 0043_editor_initiated_reviewer_recheck.sql.
  const [sendingToReviewers, setSendingToReviewers] = useState(false);
  const handleSendRevisionToReviewers = async () => {
    setSendingToReviewers(true);
    setError('');
    try {
      await coordinatorSendRevisionToReviewers(manuscript.id);
      onWorkflowChange();
    } catch (e: any) {
      setError(e.message || 'Failed to send revision to reviewers');
    } finally {
      setSendingToReviewers(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Reviewer Decisions -- original round peer review only. Nothing
          to show at the screening stage (before any reviewer is ever
          assigned), so this card doesn't render at all rather than showing
          an empty "No reviewers assigned yet" placeholder. */}
      {reviewerAssignments.length > 0 && (
      <div className="bg-blue-50/60 border-2 border-blue-100 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setReviewerDecisionsExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-6 py-4 hover:bg-blue-50 transition"
        >
          {reviewerDecisionsExpanded ? <ChevronDown className="w-4 h-4 text-blue-700" /> : <ChevronRight className="w-4 h-4 text-blue-700" />}
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2">
            <Users className="w-4 h-4" /> Reviewer Decisions
          </h3>
        </button>
        {reviewerDecisionsExpanded && (
          <div className="px-6 pb-6">
            <div className="space-y-2">
              {reviewerAssignments.map(r => (
                <div key={r.id} className="bg-white border border-blue-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{profiles[r.reviewer_id]?.name || 'Reviewer'}</p>
                      <p className="text-xs text-slate-500">{r.status === 'SUBMITTED' ? 'Review submitted' : r.status.replace(/_/g, ' ')}</p>
                    </div>
                    <DecisionPill decision={r.status === 'SUBMITTED' ? (r.recommendation || null) : null} />
                  </div>
                  {r.status === 'SUBMITTED' && r.comments_to_author && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Comments to Author</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-2.5">{r.comments_to_author}</p>
                    </div>
                  )}
                  {r.status === 'SUBMITTED' && r.comments_to_editor && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 mb-1">Confidential Comments to Editor</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap bg-blue-50 border border-blue-200 rounded-lg p-2.5">{r.comments_to_editor}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* 1b. Initial Editorial Screening summary -- shown once, for the
          round-1 gate only (no revisions yet), so the Coordinator can see
          the Editor's 10-question questionnaire, reasons, comments, and
          reject/revision reason before confirming the decision below. */}
      {sortedRevisions.length === 0 && activeEditor && (activeEditor.screening_responses?.length ?? 0) > 0 && (
        <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 flex items-center gap-2 border-b border-slate-200">
            <ClipboardList className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-black text-slate-900">Initial Editorial Screening</h3>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-3">
              {(activeEditor.screening_responses as ScreeningResponse[]).map((r, idx) => (
                <div key={r.question_id} className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold text-slate-800">{idx + 1}. {SCREENING_QUESTION_LABELS[r.question_id] || r.question_id}</p>
                    {r.answer ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Yes
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" /> No
                      </span>
                    )}
                  </div>
                  {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                </div>
              ))}
            </div>
            {activeEditor.screening_comments && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Editor Comments</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3">{activeEditor.screening_comments}</p>
              </div>
            )}
            {activeEditor.action_reason && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">
                  {activeEditor.recommendation === 'REJECT' ? 'Rejection Reason' : 'Return to Author Reason'}
                </p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded-lg p-3">{activeEditor.action_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* 4. First Submission Decision -- the Coordinator's decision on the
          ORIGINAL submission. If it required a revision, that decision is
          permanently captured in revision #1's own opening fields
          (decision_type/decision_letter/requested_at), which never get
          touched again once revision #1 exists. If it was accepted or
          rejected outright with no revision ever requested, read that
          straight off the manuscript status instead. */}
      {firstSubmissionRevision ? (
        <div className="bg-white border-2 border-violet-100 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setFirstSubmissionExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 bg-violet-50/60 hover:bg-violet-50 transition"
          >
            <div className="flex items-center gap-2">
              {firstSubmissionExpanded ? <ChevronDown className="w-4 h-4 text-violet-700" /> : <ChevronRight className="w-4 h-4 text-violet-700" />}
              <FileCheck className="w-4 h-4 text-violet-700" />
              <h3 className="text-sm font-black text-violet-900">First Submission Decision</h3>
            </div>
            <span className="font-bold rounded-full border bg-violet-100 text-violet-800 border-violet-300 text-sm px-4 py-1.5">
              {firstSubmissionRevision.origin === 'EDITOR_SCREENING'
                ? 'Return to Author'
                : getRevisionDecisionLabel(firstSubmissionRevision.decision_type as any, 0)}
            </span>
          </button>
          {firstSubmissionExpanded && (
            <div className="px-6 pb-6 pt-1 space-y-3">
              <p className="text-xs text-violet-700/70">
                {new Date(firstSubmissionRevision.requested_at).toLocaleString()}
                {firstSubmissionRevision.requested_by && profiles[firstSubmissionRevision.requested_by] ? ` — ${profiles[firstSubmissionRevision.requested_by].name}` : ''}
              </p>
              {firstSubmissionRevision.decision_letter && (
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-white border border-violet-200 rounded-lg p-3">{firstSubmissionRevision.decision_letter}</p>
              )}
            </div>
          )}
        </div>
      ) : (manuscript.status === 'ACCEPTED' || manuscript.status === 'REJECTED') ? (
        <div className="bg-violet-50/60 border-2 border-violet-100 rounded-2xl p-6 flex items-center justify-between">
          <h3 className="text-sm font-black text-violet-900 flex items-center gap-2">
            <FileCheck className="w-4 h-4" /> First Submission Decision
          </h3>
          <DecisionPill decision={manuscript.status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT'} size="lg" />
        </div>
      ) : null}

      {/* 5. One card per revision cycle, chronological -- each shows that
          cycle's Editor Decision (comments + checklist, dynamically
          labeled) and Coordinator Decision, never overwritten by a later
          cycle (see 0019/0020 migrations). */}
      {sortedRevisions.map((rev, idx) => {
        const isExpanded = expandedRevisions[rev.id] ?? idx === sortedRevisions.length - 1;
        const fullyDecided = !!rev.editor_decision && !!rev.coordinator_decision;
        const statusPill = fullyDecided
          ? { label: getRevisionDecisionLabel(rev.coordinator_decision as any, rev.revision_number), className: 'bg-emerald-100 text-emerald-700' }
          : rev.editor_decision
          ? { label: 'AWAITING COORDINATOR', className: 'bg-amber-100 text-amber-700' }
          : { label: 'AWAITING EDITOR', className: 'bg-slate-100 text-slate-600' };

        return (
          <div key={rev.id} className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleRevisionExpanded(rev.id)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                <h3 className="text-sm font-black text-slate-900">Revision {rev.revision_number} Decision</h3>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${fullyDecided ? '' : 'uppercase'} ${statusPill.className}`}>
                {statusPill.label}
              </span>
            </button>

            {isExpanded && (
              <div className="px-6 pb-6 pt-1 space-y-5">
                <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-700/70 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> Editor Decision
                    </p>
                    {rev.editor_decision ? (
                      <span className="font-bold rounded-full border bg-teal-100 text-teal-800 border-teal-300 text-xs px-2.5 py-1">
                        {getRevisionDecisionLabel(rev.editor_decision as any, rev.revision_number)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Awaiting editor decision</span>
                    )}
                  </div>
                  {rev.editor_comments && (
                    <p className="text-sm text-slate-800 whitespace-pre-wrap bg-white border border-teal-200 rounded-lg p-3">{rev.editor_comments}</p>
                  )}
                  {rev.editor_checklist?.length > 0 && (
                    <div className="bg-white border border-teal-200 rounded-lg p-3 space-y-1.5">
                      {rev.editor_checklist.map(item => (
                        <p key={item.id} className={`text-sm flex items-center gap-2 ${item.checked ? 'text-slate-700' : 'text-slate-400'}`}>
                          <span>{item.checked ? '☑' : '☐'}</span> {item.label}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 6. Coordinator Final Decision -- the action card. Only relevant
          while something is actually pending; once decided, the Final
          Decision card (7, below) is the single place that shows the
          outcome -- no need to also keep this action card around
          redundantly saying the same thing. */}
      {!decided && (
      <div className="bg-emerald-50/60 border-2 border-emerald-200 rounded-2xl p-6 space-y-6">
        <div>
          <h3 className="text-sm font-black text-emerald-900 flex items-center gap-2">
            <Gavel className="w-4 h-4" /> Editor Decision
          </h3>
          <p className="text-xs text-emerald-700/70 mt-1">
            To be chosen by the Coordinator below — this becomes the manuscript's official final decision.
          </p>
        </div>

        {!canDecide ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 mb-1">Decision Unavailable</p>
              <p className="text-sm text-amber-800">
                Waiting for: {[
                  !hasEditorEvaluation && 'Editor evaluation',
                  reviewerAssignments.length > 0 && !hasRequiredReviews && `${reviewerAssignments.filter(r => r.status !== 'SUBMITTED').length} reviewer report(s)`,
                  hasEditorEvaluation && (reviewerAssignments.length === 0 || hasRequiredReviews) && manuscript.status !== 'AWAITING_DECISION' && `manuscript to be ready for a decision (currently ${getManuscriptStatusLabel(manuscript)})`,
                ].filter(Boolean).join(', ') || 'the manuscript to be ready for a decision'}
              </p>
            </div>
          </div>
        ) : pendingRevisionConfirm && decidedRevision && decidedRevision.editor_decision === 'ADDITIONAL_REVIEW' ? (
          <>
            <div className="bg-white border-2 border-blue-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700/70 mb-1">Editor's Decision</p>
              <p className="text-lg font-black text-slate-900">Editor requests reviewer re-check</p>
              {decidedRevision.editor_comments && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap bg-blue-50 border border-blue-200 rounded-lg p-3">{decidedRevision.editor_comments}</p>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleSendRevisionToReviewers}
              disabled={sendingToReviewers}
              className="w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {sendingToReviewers ? 'Sending...' : 'Send to Reviewers for Re-review'}
            </button>
          </>
        ) : pendingRevisionConfirm && decidedRevision ? (
          <>
            <div className="bg-white border-2 border-emerald-200 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70 mb-1">Editor's Decision</p>
              <p className="text-lg font-black text-slate-900">
                {getRevisionDecisionLabel(decidedRevision.editor_decision as any, decidedRevision.revision_number)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {decidedRevision.editor_decision === 'ACCEPT' ? 'Decision Letter to Author (Optional)' : 'Note to Author (Optional)'}
              </label>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                placeholder="Write a note to the author..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={6}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleConfirmRevisionDecision}
              disabled={loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Sending...' : decidedRevision.editor_decision === 'ACCEPT'
                ? `Accept Submission ${decidedRevision.revision_number} — Send to Production`
                : `Send Back to Author for Revision ${decidedRevision.revision_number + 1}`}
            </button>
          </>
        ) : pendingPeerReviewConfirm && activeEditor?.recommendation ? (
          <>
            <div className="bg-white border-2 border-emerald-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70 mb-1">Editor's Decision (Peer Review)</p>
              <p className="text-lg font-black text-slate-900">
                {DECISION_LABELS[activeEditor.recommendation] || activeEditor.recommendation.replace(/_/g, ' ')}
              </p>
              {activeEditor.peer_review_comments && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap bg-emerald-50 border border-emerald-200 rounded-lg p-3">{activeEditor.peer_review_comments}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {activeEditor.recommendation === 'ACCEPT' ? 'Decision Letter to Author (Optional)' : 'Note to Author (Optional)'}
              </label>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                placeholder="Write a note to the author..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={6}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={() => submitPublishDecision(activeEditor.recommendation as 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT')}
              disabled={loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Sending...' : activeEditor.recommendation === 'ACCEPT'
                ? 'Accept Submission — Send to Production'
                : activeEditor.recommendation === 'REJECT'
                ? 'Confirm Rejection'
                : 'Send Back to Author for Revision 1'}
            </button>
          </>
        ) : pendingScreeningConfirm && activeEditor?.recommendation ? (
          <>
            {/* Comments / Return to Author Reason are already shown above in
                the Initial Editorial Screening card, and that's what gets
                sent to the Author (letter state is pre-filled from
                activeEditor.action_reason by the useEffect above). Just a
                compact "Decision: X" line plus the confirm action here. */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70">Decision</p>
              <p className="text-base font-black text-slate-900">
                {SCREENING_DECISION_LABELS[activeEditor.recommendation] || activeEditor.recommendation.replace(/_/g, ' ')}
              </p>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={() => submitPublishDecision(activeEditor.recommendation as 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT')}
              disabled={loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Sending...' : activeEditor.recommendation === 'ACCEPT'
                ? 'Move to Peer Review — Confirm'
                : activeEditor.recommendation === 'REJECT'
                ? 'Confirm Rejection'
                : 'Return Back to Author'}
            </button>
          </>
        ) : isPeerReviewRound ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 mb-1">Waiting for the Editor</p>
              <p className="text-sm text-amber-800">
                Both peer reviews are in, but the Editor hasn't recorded a decision on them yet. The Coordinator confirms the Editor's call here — not a free pick.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { id: 'ACCEPT', label: 'Accept', color: 'emerald' },
                { id: 'MINOR_REVISION', label: 'Minor Revision', color: 'amber' },
                { id: 'MAJOR_REVISION', label: 'Major Revision', color: 'orange' },
                { id: 'REJECT', label: 'Reject', color: 'red' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDecision(opt.id as any)}
                  className={`px-4 py-3 rounded-lg font-bold text-sm transition ${
                    decision === opt.id
                      ? `bg-${opt.color}-600 text-white`
                      : `border-2 border-${opt.color}-200 text-${opt.color}-700 hover:bg-${opt.color}-50`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Decision Letter (Optional)</label>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                placeholder="Write a decision letter to the author..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={6}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleMakeDecision}
              disabled={!decision || loading}
              className="w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? 'Submitting...' : 'Submit Decision'}
            </button>
          </>
        )}
      </div>
      )}

      {/* 7. Final Status Card */}
      {decided && (
        <div className={`rounded-2xl border-2 overflow-hidden ${
          manuscript.status === 'REJECTED' ? 'bg-red-50 border-red-200' :
          manuscript.status === 'REVISION_REQUESTED' ? 'bg-amber-50 border-amber-200' :
          'bg-emerald-50 border-emerald-200'
        }`}>
          <button
            type="button"
            onClick={() => setFinalDecisionExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-6 py-4 hover:bg-black/5 transition"
          >
            {finalDecisionExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Final Decision</p>
              <p className="text-lg font-black text-slate-900">{finalRevisionDecisionLabel || (finalDecisionLabel ? (DECISION_LABELS[finalDecisionLabel] || finalDecisionLabel) : statusMeta.label)}</p>
            </div>
          </button>
          {finalDecisionExpanded && (
            <div className="px-6 pb-6 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</p>
              <p className="text-lg font-black text-slate-900">{statusMeta.label}</p>
              {statusMeta.nextStep && (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-3">Next Step</p>
                  <p className="text-sm font-bold text-slate-700">{statusMeta.nextStep}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 8. Move to Production -- Coordinator-only, once the manuscript has
          actually been accepted. Hands the manuscript into the Production
          module (start_production RPC -- see
          supabase/migrations/0047_production_module.sql). manuscripts.status
          stays ACCEPTED; only the display label changes to PRODUCTION
          PREPARATION, and the transition is recorded via the existing
          manuscript_status_history/audit_log trail. */}
      {!isEditor && canMoveToProduction && (
        <button
          type="button"
          onClick={handleMoveToProduction}
          disabled={movingToProduction}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 font-bold rounded-2xl transition bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {movingToProduction ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
          {movingToProduction ? 'Moving to Production...' : 'Move to Production'}
        </button>
      )}
      {moveToProductionError && (
        <p className="text-xs font-semibold text-red-600">{moveToProductionError}</p>
      )}

      {showGDGateModal && (
        <GDMemberGateModal
          mode={gdGateMode}
          onModeChange={setGdGateMode}
          members={gdGateMembers}
          loadingMembers={gdGateLoadingMembers}
          selectedId={selectedGdMemberForGate}
          onSelectedIdChange={setSelectedGdMemberForGate}
          name={gdGateName}
          onNameChange={setGdGateName}
          email={gdGateEmail}
          onEmailChange={setGdGateEmail}
          password={gdGatePassword}
          onPasswordChange={setGdGatePassword}
          onGeneratePassword={() => setGdGatePassword(generateGdGatePassword())}
          busy={gdGateBusy || movingToProduction}
          error={gdGateError}
          createdCredentials={createdGdCredentials}
          onClose={() => { if (!gdGateBusy && !movingToProduction) setShowGDGateModal(false); }}
          onAssignExisting={handleAssignExistingInGate}
          onCreateAndAssign={handleCreateAndAssignInGate}
        />
      )}
    </div>
  );
}

/**
 * "Graphic Designer is not assigned yet" gate -- shown when the Coordinator
 * clicks Move to Production before any GD Member is assigned. Offers Assign
 * Existing GD Member or Create New GD Member; production only actually
 * starts once one of those completes (see finalizeMoveToProduction above).
 */
function GDMemberGateModal({
  mode, onModeChange, members, loadingMembers, selectedId, onSelectedIdChange,
  name, onNameChange, email, onEmailChange, password, onPasswordChange, onGeneratePassword,
  busy, error, createdCredentials, onClose, onAssignExisting, onCreateAndAssign
}: {
  mode: 'PICK' | 'CREATE'; onModeChange: (m: 'PICK' | 'CREATE') => void;
  members: ProfileRow[]; loadingMembers: boolean;
  selectedId: string; onSelectedIdChange: (v: string) => void;
  name: string; onNameChange: (v: string) => void;
  email: string; onEmailChange: (v: string) => void;
  password: string; onPasswordChange: (v: string) => void;
  onGeneratePassword: () => void;
  busy: boolean; error: string;
  createdCredentials: { email: string; password: string } | null;
  onClose: () => void;
  onAssignExisting: () => void;
  onCreateAndAssign: () => void;
}) {
  if (createdCredentials) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
          <div className="relative bg-slate-950 px-8 py-6">
            <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">Production Team</div>
            <h2 className="mt-3 text-xl font-black text-white">GD Member created &amp; assigned</h2>
            <button onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4 px-8 py-8 bg-slate-50">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
              The manuscript has moved into the production workflow. No email delivery is connected yet -- copy this
              password now, it won't be shown again.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Email</p>
              <p className="mt-2 font-semibold text-slate-900 break-words">{createdCredentials.email}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Password</p>
              <p className="mt-2 font-semibold text-slate-900 break-words">{createdCredentials.password}</p>
            </div>
            <button onClick={onClose} className="w-full rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043]">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
        <div className="relative bg-slate-950 px-8 py-6">
          <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">Production Team</div>
          <h2 className="mt-3 text-xl font-black text-white">Graphic Designer is not assigned yet</h2>
          <button onClick={onClose} disabled={busy} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-5 px-8 py-8 bg-slate-50">
          <p className="text-sm text-slate-600">
            Please assign an existing GD Member or create a new GD Member. The manuscript will move into the
            production workflow once a GD Member is assigned.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onModeChange('PICK')}
              disabled={busy}
              className={`rounded-full px-4 py-2.5 text-xs font-bold transition ${mode === 'PICK' ? 'bg-[#008751] text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'}`}
            >
              Assign Existing GD Member
            </button>
            <button
              type="button"
              onClick={() => onModeChange('CREATE')}
              disabled={busy}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold transition ${mode === 'CREATE' ? 'bg-[#008751] text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'}`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Create New GD Member
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {mode === 'PICK' ? (
            loadingMembers ? (
              <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading GD Members...</div>
            ) : members.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl">
                No active GD Member accounts yet -- create one instead.
              </div>
            ) : (
              <>
                <select
                  value={selectedId}
                  onChange={(e) => onSelectedIdChange(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
                >
                  <option value="">Select GD Member</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button
                  onClick={onAssignExisting}
                  disabled={busy || !selectedId}
                  className="w-full rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {busy ? 'Assigning...' : 'Assign & Move to Production'}
                </button>
              </>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Jordan Lee"
                  disabled={busy}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold mb-1.5">Username / Email</label>
                <input
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="gdmember@example.com"
                  disabled={busy}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold mb-1.5">Generate Password</label>
                <div className="flex gap-2">
                  <input
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]"
                  />
                  <button type="button" onClick={onGeneratePassword} disabled={busy} className="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Generate
                  </button>
                </div>
              </div>
              <button
                onClick={onCreateAndAssign}
                disabled={busy}
                className="w-full rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043] disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy ? 'Creating & Assigning...' : 'Create Account & Move to Production'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
