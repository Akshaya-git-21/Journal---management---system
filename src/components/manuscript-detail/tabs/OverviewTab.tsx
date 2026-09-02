import { useEffect, useState } from 'react';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, ProfileRow, SuggestedReviewerRow, RevisionRow, EditorReviewerActionRow, listActiveProfilesByRole, assignEditor, coordinatorSendRevisionToEditor, coordinatorSendReviewsToEditor, getEditorReviewerActions, getPendingEditorSuggestions } from '../../../lib/workflow';
import { getManuscriptStatusLabel, getRevisionMeta, getLatestRevision } from '../../../lib/manuscriptStatusLabel';
import { getProduction, subscribeToProduction } from '../../../lib/production';
import { CheckCircle2, Circle, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { AssignmentConfirmationDialog } from '../../AssignmentConfirmationDialog';

interface Props {
  manuscript: ManuscriptRow;
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  suggestedReviewers: SuggestedReviewerRow[];
  profiles: Record<string, ProfileRow>;
  revisions?: RevisionRow[];
  onWorkflowChange?: () => void;
  onGoToTab?: (tab: string) => void;
}

export function OverviewTab({
  manuscript,
  editorAssignments,
  reviewerAssignments,
  suggestedReviewers,
  profiles,
  revisions = [],
  onWorkflowChange,
  onGoToTab
}: Props) {
  const [productionStatus, setProductionStatus] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (manuscript.status !== 'ACCEPTED') { setProductionStatus(null); return; }
    const refetch = () => getProduction(manuscript.id).then((p) => { if (!cancelled) setProductionStatus(p?.production_status ?? null); }).catch(() => {});
    refetch();
    const unsubscribe = subscribeToProduction(refetch);
    return () => { cancelled = true; unsubscribe(); };
  }, [manuscript.id, manuscript.status]);

  const activeEditor = editorAssignments.find(a => a.status === 'ACCEPTED') || editorAssignments[0];
  const evaluationSubmitted = activeEditor?.assessment_status === 'SUBMITTED';
  const reviewsSubmitted = reviewerAssignments.filter(r => r.status === 'SUBMITTED').length;
  const reviewsInvited = reviewerAssignments.filter(r => r.status === 'INVITED').length;
  const reviewsAccepted = reviewerAssignments.filter(r => r.status === 'ACCEPTED').length;
  const reviewsTotal = reviewerAssignments.length;

  // Assign Editor (SUBMITTED -> EDITOR_REVIEW)
  const [availableEditors, setAvailableEditors] = useState<ProfileRow[]>([]);
  const [selectedEditorId, setSelectedEditorId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [showEditorConfirmation, setShowEditorConfirmation] = useState(false);

  useEffect(() => {
    if (manuscript.status !== 'SUBMITTED') return;
    listActiveProfilesByRole('EDITOR').then(setAvailableEditors).catch((e) => setAssignError(e.message));
  }, [manuscript.status]);

  const handleAssignEditorClick = () => {
    if (!selectedEditorId) return;
    setShowEditorConfirmation(true);
  };

  const handleConfirmEditorAssignment = async () => {
    if (!selectedEditorId) return;
    setAssigning(true);
    setAssignError('');
    try {
      await assignEditor(manuscript.id, selectedEditorId);
      onWorkflowChange?.();
      setShowEditorConfirmation(false);
      setSelectedEditorId('');
    } catch (e: any) {
      setAssignError(e.message || 'Failed to assign editor');
    } finally {
      setAssigning(false);
    }
  };

  const latestRevision = getLatestRevision(revisions);
  const revisionN = latestRevision?.revision_number;

  // Editor has selected its 2 reviewers for the current round but the
  // Coordinator hasn't sent invitations yet (manuscript.status stays
  // EDITOR_REVIEW until they do -- see editor_select_reviewers() in
  // 0026_editor_reviewer_selection.sql). Surface that as its own "ready to
  // invite" state instead of the generic "Editor is reviewing" copy.
  const [editorReviewerActions, setEditorReviewerActions] = useState<EditorReviewerActionRow[]>([]);
  useEffect(() => {
    getEditorReviewerActions(manuscript.id).then(setEditorReviewerActions).catch(() => setEditorReviewerActions([]));
  }, [manuscript.id]);
  // No revision-number filter here -- editor_select_reviewers() (0026)
  // never stamps revision_number on the suggestions it creates (unlike its
  // replacement-selection sibling in 0034), so they always default to 0
  // regardless of which round is active. Matching EditorWorkspace.tsx's own
  // no-round-filter usage (details.suggestedReviewers/editorReviewerActions
  // call) avoids that mismatch entirely instead of trying to replicate it.
  const pendingReviewerInvites = manuscript.status === 'EDITOR_REVIEW'
    ? getPendingEditorSuggestions(suggestedReviewers, editorReviewerActions)
    : [];
  const readyToInviteReviewers = pendingReviewerInvites.length > 0;

  const [sendingToEditor, setSendingToEditor] = useState(false);
  const [sendToEditorError, setSendToEditorError] = useState('');
  // Every resubmitted revision goes to the Editor first, regardless of
  // origin -- coordinator_send_revision_to_editor() is origin-agnostic. It's
  // the Editor's own call (via EditorRevisionReview.tsx's "Move to
  // Reviewer" action) whether a peer-review-origin revision needs another
  // look from the reviewers; the Coordinator then carries that out from the
  // Decision tab once the Editor asks for it -- see
  // coordinator_send_revision_to_reviewers() in
  // 0043_editor_initiated_reviewer_recheck.sql.
  const readyToSendToEditor = manuscript.status === 'REVISION_REQUESTED' && latestRevision?.status === 'REVISION_SUBMITTED';
  // The Editor's decision screen (EditorWorkspace.tsx) stays locked until
  // the Coordinator explicitly forwards a completed round of reviews -- see
  // coordinator_send_reviews_to_editor() in
  // 0041_coordinator_releases_reviews_to_editor.sql. Only relevant for the
  // peer-review round(s), not the screening round (which has no reviewers).
  const activeReviewerAssignments = reviewerAssignments.filter(r => r.status !== 'DECLINED');
  const allReviewsIn = activeReviewerAssignments.length > 0 && activeReviewerAssignments.every(r => r.status === 'SUBMITTED');
  const readyToSendReviewsToEditor = manuscript.status === 'AWAITING_DECISION' && allReviewsIn && !manuscript.reviews_released_at;

  const handleSendReviewsToEditor = async () => {
    setSendingToEditor(true);
    setSendToEditorError('');
    try {
      await coordinatorSendReviewsToEditor(manuscript.id);
      onWorkflowChange?.();
    } catch (e: any) {
      setSendToEditorError(e.message || 'Failed to send reviews to editor');
    } finally {
      setSendingToEditor(false);
    }
  };

  const handleSendRevisionToEditor = async () => {
    setSendingToEditor(true);
    setSendToEditorError('');
    try {
      await coordinatorSendRevisionToEditor(manuscript.id);
      onWorkflowChange?.();
    } catch (e: any) {
      setSendToEditorError(e.message || 'Failed to send revision to editor');
    } finally {
      setSendingToEditor(false);
    }
  };

  // Fixed status description - account for evaluation submission and any
  // active revision cycle (re-review reuses the same EDITOR_REVIEW/
  // UNDER_REVIEW statuses as the original round, so the description needs
  // to say which one this is).
  const getStatusDescription = (): string => {
    if (manuscript.status === 'ACCEPTED' && productionStatus && productionStatus !== 'NOT_STARTED') {
      return 'Manuscript is being prepared for production';
    }
    if (readyToInviteReviewers) {
      return revisionN
        ? `Editor selected reviewers for Revision ${revisionN} -- invite them to start peer review`
        : 'Editor selected reviewers -- invite them to start peer review';
    }
    if (manuscript.status === 'EDITOR_REVIEW' && evaluationSubmitted) {
      return revisionN
        ? `Revision ${revisionN} editor evaluation complete. Ready for peer review assignment.`
        : 'Editor evaluation complete. Ready for peer review assignment.';
    }
    if (revisionN && manuscript.status === 'REVISION_REQUESTED') {
      if (latestRevision!.status === 'AWAITING_AUTHOR_UPLOAD') return `Waiting for the author to submit Revision ${revisionN}`;
      if (latestRevision!.status === 'REVISION_SUBMITTED') {
        return latestRevision!.origin === 'PEER_REVIEW'
          ? `Revision ${revisionN} submitted -- ready to send to the reviewers`
          : `Revision ${revisionN} submitted -- ready to send to the editor`;
      }
    }
    if (revisionN && manuscript.status === 'EDITOR_REVIEW') {
      return `Editor is reviewing the Revision ${revisionN} submission`;
    }
    if (revisionN && manuscript.status === 'UNDER_REVIEW') {
      return `Peer reviewers are evaluating Revision ${revisionN}`;
    }
    if (revisionN && manuscript.status === 'AWAITING_DECISION') {
      return `All Revision ${revisionN} reviews received, awaiting coordinator decision`;
    }
    return {
      SUBMITTED: 'Waiting for editor assignment',
      EDITOR_REVIEW: 'Editor is reviewing the manuscript',
      UNDER_REVIEW: 'Peer reviewers are evaluating the manuscript',
      AWAITING_DECISION: 'All reviews received, awaiting coordinator decision',
      REVISION_REQUESTED: 'Author is preparing revisions',
      ACCEPTED: 'Manuscript has been accepted for publication',
      REJECTED: 'Manuscript has been rejected',
      PUBLISHED: 'Manuscript has been published',
    }[manuscript.status] || 'Processing';
  };

  return (
    <div className="space-y-6">
      {/* Editor Assignment & Recommendation Card */}
      {activeEditor && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">Editor Assignment & Recommendation</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="sm:border-r border-slate-200 sm:pr-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Editor</p>
              <p className="text-sm font-semibold text-slate-900">{profiles[activeEditor.editor_id]?.name || 'Unknown'}</p>
              <p className="text-xs text-slate-600 truncate">{profiles[activeEditor.editor_id]?.email}</p>
            </div>
            <div className="xl:border-r border-slate-200 xl:pr-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Assignment Status</p>
              <p className="text-sm font-semibold text-slate-900">{activeEditor.status}</p>
            </div>
            <div className="sm:border-r border-slate-200 sm:pr-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Evaluation</p>
              <p className="text-sm font-semibold text-emerald-700">{activeEditor.assessment_status === 'SUBMITTED' ? '✓ Submitted' : 'Not Started'}</p>
              {activeEditor.assessment_submitted_at && (
                <p className="text-xs text-slate-600 mt-1">{new Date(activeEditor.assessment_submitted_at).toLocaleDateString()}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Recommendation</p>
              <p className="text-sm font-bold text-emerald-700">
                {!activeEditor.recommendation ? 'Pending'
                  : reviewerAssignments.length === 0
                  // Screening round: the only 3 outcomes are the Editor's
                  // named actions (EditorEvaluationFormTab.tsx ACTION_META) --
                  // MAJOR_REVISION here always means "Return to Author", not
                  // a literal revision-type decision.
                  ? (activeEditor.recommendation === 'REJECT' ? 'Reject Submission'
                    : activeEditor.recommendation === 'ACCEPT' ? 'Move to Next Stage'
                    : 'Return to Author')
                  : activeEditor.recommendation.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Current Status Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4">Current Status</h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Status</p>
            <p className="text-lg font-bold text-slate-900">{getManuscriptStatusLabel(manuscript, latestRevision, productionStatus)}</p>
            {(() => {
              const revisionMeta = getRevisionMeta(latestRevision);
              return revisionMeta ? (
                <p className="text-xs font-bold text-slate-500 mt-1">
                  Revision: {revisionMeta.revisionNumber}{revisionMeta.revisionType ? ` (${revisionMeta.revisionType})` : ''}
                </p>
              ) : null;
            })()}
            <p className="text-sm text-slate-600 mt-1">{getStatusDescription()}</p>
          </div>

          {readyToInviteReviewers && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <p className="text-sm font-bold text-teal-900 mb-1">Editor selected {pendingReviewerInvites.length} reviewer{pendingReviewerInvites.length === 1 ? '' : 's'} — ready to invite</p>
              <p className="text-xs text-teal-800 mb-3">Send invitations so peer review can begin.</p>
              <button
                onClick={() => onGoToTab?.('review-board')}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold py-2.5 rounded-lg transition"
              >
                Invite Reviewers
              </button>
            </div>
          )}

          {readyToSendReviewsToEditor && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <p className="text-sm font-bold text-teal-900 mb-1">All reviews are in — ready to send to the editor</p>
              <p className="text-xs text-teal-800 mb-3">Every reviewer has submitted. Forward the reviews to the Editor so they can make a decision.</p>
              {sendToEditorError && (
                <p className="text-xs text-red-700 mb-2">{sendToEditorError}</p>
              )}
              <button
                onClick={handleSendReviewsToEditor}
                disabled={sendingToEditor}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {sendingToEditor && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Reviews to Editor
              </button>
            </div>
          )}

          {readyToSendToEditor && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-bold text-amber-900 mb-1">Revision {revisionN} is ready for editor review</p>
              <p className="text-xs text-amber-800 mb-3">The author has submitted their revised files. Send it to the assigned editor to continue the review.</p>
              {sendToEditorError && (
                <p className="text-xs text-red-700 mb-2">{sendToEditorError}</p>
              )}
              <button
                onClick={handleSendRevisionToEditor}
                disabled={sendingToEditor}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {sendingToEditor && <Loader2 className="w-4 h-4 animate-spin" />}
                Send to Editor for Revision Review
              </button>
            </div>
          )}

          {reviewsTotal > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Review Progress</p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-50 rounded p-2 text-center">
                    <p className="font-bold text-slate-900">{reviewsInvited}</p>
                    <p className="text-slate-600">Invitations Sent</p>
                  </div>
                  <div className="bg-slate-50 rounded p-2 text-center">
                    <p className="font-bold text-slate-900">{reviewsAccepted}</p>
                    <p className="text-slate-600">Accepted</p>
                  </div>
                  <div className="bg-emerald-50 rounded p-2 text-center">
                    <p className="font-bold text-emerald-700">{reviewsSubmitted}</p>
                    <p className="text-emerald-600">Completed</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Reviews Submitted</span>
                  <span className="font-bold text-slate-900">{reviewsSubmitted} / {reviewsTotal}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-emerald-600 h-2 rounded-full transition-all"
                    style={{ width: `${reviewsTotal > 0 ? (reviewsSubmitted / reviewsTotal) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggested Reviewers Card -- merges Author and Editor suggestions,
          deduplicating by email so a reviewer suggested by both shows once
          with a combined "Author & Editor" badge. */}
      {(() => {
        const merged = new Map<string, { id: string; name: string; email: string; note: string | null; sources: Set<'AUTHOR' | 'EDITOR'> }>();
        for (const reviewer of suggestedReviewers) {
          const key = reviewer.email.trim().toLowerCase();
          const existing = merged.get(key);
          if (existing) {
            existing.sources.add(reviewer.suggested_by);
            if (!existing.note && reviewer.note) existing.note = reviewer.note;
          } else {
            merged.set(key, {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email,
              note: reviewer.note,
              sources: new Set([reviewer.suggested_by]),
            });
          }
        }
        const uniqueReviewers = Array.from(merged.values());

        if (uniqueReviewers.length === 0) return null;

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h3 className="text-sm font-black text-slate-900 mb-4">
              Suggested Reviewers ({uniqueReviewers.length})
            </h3>
            <div className="space-y-3">
              {uniqueReviewers.map((reviewer) => {
                const hasAuthor = reviewer.sources.has('AUTHOR');
                const hasEditor = reviewer.sources.has('EDITOR');
                const badgeLabel = hasAuthor && hasEditor
                  ? 'Suggested by Author & Editor'
                  : hasAuthor
                  ? 'Suggested by Author'
                  : 'Suggested by Editor';
                const badgeStyle = hasAuthor && hasEditor
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : hasAuthor
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : 'bg-teal-50 text-teal-700 border border-teal-200';
                return (
                  <div key={reviewer.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{reviewer.name}</p>
                        <p className="text-xs text-slate-600">{reviewer.email}</p>
                        {reviewer.note && <p className="text-xs text-slate-500 mt-1">Expertise: {reviewer.note}</p>}
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${badgeStyle}`}>
                        {badgeLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Review Board Summary Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4">Review Board</h3>
        <div className="flex items-center justify-between mb-4">
          <div className="text-center">
            <p className="text-3xl font-black text-slate-900">{reviewsTotal}</p>
            <p className="text-xs text-slate-600 mt-1">/ 2 Reviewers</p>
          </div>
          {reviewsTotal === 2 && (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">✓ Complete</span>
          )}
        </div>
        {reviewsTotal > 0 && (
          <div className="space-y-2 text-sm">
            {reviewerAssignments.map((assignment, idx) => {
              const profile = profiles[assignment.reviewer_id];
              return (
                <div key={assignment.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">Reviewer {idx + 1}: {profile?.name || 'Unknown'}</p>
                    <p className="text-xs text-slate-600">{assignment.status}</p>
                  </div>
                  {assignment.status === 'SUBMITTED' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                  {assignment.status === 'ACCEPTED' && <Circle className="w-4 h-4 text-blue-600 fill-blue-600 flex-shrink-0" />}
                  {assignment.status === 'INVITED' && <Circle className="w-4 h-4 text-amber-600 fill-amber-600 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Next Action Required Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-blue-900 mb-3">Next Action Required</h3>
        <p className="text-sm text-blue-800 mb-4">
          {getNextAction(manuscript.status, activeEditor, reviewerAssignments, evaluationSubmitted)}
        </p>

        {manuscript.status === 'SUBMITTED' ? (
          <div>
            {assignError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mb-3">{assignError}</div>
            )}
            {availableEditors.length === 0 ? (
              <p className="text-xs text-blue-700">No active editor accounts available to assign.</p>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={selectedEditorId}
                  onChange={(e) => setSelectedEditorId(e.target.value)}
                  disabled={assigning}
                  className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-xs bg-white"
                >
                  <option value="">-- Select Editor --</option>
                  {availableEditors.map((ed) => (
                    <option key={ed.id} value={ed.id}>{ed.name} ({ed.email})</option>
                  ))}
                </select>
                <button
                  onClick={handleAssignEditorClick}
                  disabled={!selectedEditorId || assigning}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {assigning && <Loader2 className="w-3 h-3 animate-spin" />}
                  {assigning ? 'Assigning...' : 'Assign Editor'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => onGoToTab?.(getNextActionTab(manuscript.status, activeEditor, evaluationSubmitted))}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition"
            >
              {getNextActionButton(manuscript.status, activeEditor, reviewerAssignments, evaluationSubmitted)}
            </button>
          </div>
        )}
      </div>

      <AssignmentConfirmationDialog
        isOpen={showEditorConfirmation}
        title="Confirm Editor Assignment"
        message="Do you confirm the assignment of this editor to review this manuscript?"
        editorName={selectedEditorId ? profiles[selectedEditorId]?.name : undefined}
        editorEmail={selectedEditorId ? profiles[selectedEditorId]?.email : undefined}
        confirmText="Confirm Assign"
        cancelText="Cancel"
        isLoading={assigning}
        onConfirm={handleConfirmEditorAssignment}
        onCancel={() => {
          setShowEditorConfirmation(false);
          setSelectedEditorId('');
        }}
      />
    </div>
  );
}

function getNextAction(status: string, editor: any, reviewers: any[], evaluationSubmitted: boolean): string {
  switch (status) {
    case 'SUBMITTED':
      return 'Assign an editor to begin the review process.';
    case 'EDITOR_REVIEW':
      if (!editor) return 'Waiting for editor assignment.';
      if (editor.status !== 'ACCEPTED') return 'Waiting for editor to accept the assignment.';
      if (!evaluationSubmitted) return 'Waiting for editor to complete their evaluation.';
      return 'Ready to assign peer reviewers.';
    case 'UNDER_REVIEW':
      const accepted = reviewers.filter(r => r.status === 'ACCEPTED').length;
      const submitted = reviewers.filter(r => r.status === 'SUBMITTED').length;
      if (accepted === 0) return 'Waiting for reviewers to accept invitations.';
      if (submitted < reviewers.length) return `Waiting for reviewer reviews. ${submitted}/${reviewers.length} completed.`;
      return 'All reviews received. Ready for coordinator decision.';
    case 'AWAITING_DECISION':
      return 'Make the final editorial decision.';
    case 'REVISION_REQUESTED':
      return 'Waiting for author to submit revised manuscript.';
    default:
      return 'Manuscript processing is complete.';
  }
}

/** Which detail tab the "Next Action Required" button should jump to --
 * mirrors getNextActionButton()'s own status/editor logic so the label and
 * the destination always agree. */
function getNextActionTab(status: string, editor: any, evaluationSubmitted: boolean): string {
  switch (status) {
    case 'EDITOR_REVIEW':
      if (!editor || editor.status !== 'ACCEPTED' || !evaluationSubmitted) return 'evaluation';
      return 'review-board';
    case 'UNDER_REVIEW':
      return 'reviewers';
    case 'AWAITING_DECISION':
      return 'decision';
    case 'REVISION_REQUESTED':
      return 'files';
    default:
      return 'manuscript';
  }
}

function getNextActionButton(status: string, editor: any, reviewers: any[], evaluationSubmitted: boolean): string {
  switch (status) {
    case 'SUBMITTED':
      return 'Assign Editor';
    case 'EDITOR_REVIEW':
      if (!editor || editor.status !== 'ACCEPTED' || !evaluationSubmitted) {
        return 'View Editor Evaluation';
      }
      return 'Assign Reviewers';
    case 'UNDER_REVIEW':
      return 'View Review Board';
    case 'AWAITING_DECISION':
      return 'Make Decision';
    case 'REVISION_REQUESTED':
      return 'View Revision';
    default:
      return 'View Details';
  }
}
