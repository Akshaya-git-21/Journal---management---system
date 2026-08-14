import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, ProfileRow, SuggestedReviewerRow } from '../../../lib/workflow';
import { CheckCircle2, Circle, AlertCircle, FileText } from 'lucide-react';

interface Props {
  manuscript: ManuscriptRow;
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  suggestedReviewers: SuggestedReviewerRow[];
  profiles: Record<string, ProfileRow>;
}

export function OverviewTab({
  manuscript,
  editorAssignments,
  reviewerAssignments,
  suggestedReviewers,
  profiles
}: Props) {
  const activeEditor = editorAssignments.find(a => a.status === 'ACCEPTED') || editorAssignments[0];
  const evaluationSubmitted = activeEditor?.assessment_status === 'SUBMITTED';
  const reviewsSubmitted = reviewerAssignments.filter(r => r.status === 'SUBMITTED').length;
  const reviewsInvited = reviewerAssignments.filter(r => r.status === 'INVITED').length;
  const reviewsAccepted = reviewerAssignments.filter(r => r.status === 'ACCEPTED').length;
  const reviewsTotal = reviewerAssignments.length;

  const daysAgo = Math.floor(
    (Date.now() - (manuscript.submitted_at ? new Date(manuscript.submitted_at).getTime() : 0)) / (1000 * 60 * 60 * 24)
  );

  // Fixed status description - account for evaluation submission
  const getStatusDescription = (): string => {
    if (manuscript.status === 'EDITOR_REVIEW' && evaluationSubmitted) {
      return 'Editor evaluation complete. Ready for peer review assignment.';
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="border-r border-slate-200 pr-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Editor</p>
              <p className="text-sm font-semibold text-slate-900">{profiles[activeEditor.editor_id]?.name || 'Unknown'}</p>
              <p className="text-xs text-slate-600">{profiles[activeEditor.editor_id]?.email}</p>
            </div>
            <div className="border-r border-slate-200 pr-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Assignment Status</p>
              <p className="text-sm font-semibold text-slate-900">{activeEditor.status}</p>
            </div>
            <div className="border-r border-slate-200 pr-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Evaluation</p>
              <p className="text-sm font-semibold text-emerald-700">{activeEditor.assessment_status === 'SUBMITTED' ? '✓ Submitted' : 'Not Started'}</p>
              {activeEditor.assessment_submitted_at && (
                <p className="text-xs text-slate-600 mt-1">{new Date(activeEditor.assessment_submitted_at).toLocaleDateString()}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Recommendation</p>
              <p className="text-sm font-bold text-emerald-700">{activeEditor.recommendation?.replace(/_/g, ' ') || 'Pending'}</p>
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
            <p className="text-lg font-bold text-slate-900">{manuscript.status.replace(/_/g, ' ')}</p>
            <p className="text-sm text-slate-600 mt-1">{getStatusDescription()}</p>
          </div>

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

      {/* Editor-Suggested Reviewers Card */}
      {suggestedReviewers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4">
            Editor-Suggested Reviewers ({suggestedReviewers.length})
          </h3>
          <div className="space-y-3">
            {suggestedReviewers.map((reviewer) => (
              <div key={reviewer.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{reviewer.name}</p>
                    <p className="text-xs text-slate-600">{reviewer.email}</p>
                    {reviewer.note && <p className="text-xs text-slate-500 mt-1">Expertise: {reviewer.note}</p>}
                  </div>
                  <span className="text-xs font-bold text-slate-500">Suggested by Editor</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition">
            {getNextActionButton(manuscript.status, activeEditor, reviewerAssignments, evaluationSubmitted)}
          </button>
        </div>
      </div>

      {/* SLA / Age Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4">SLA / Age</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-3xl font-black text-slate-900">{daysAgo}</p>
            <p className="text-xs text-slate-600 mt-1">Days since submission</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">SLA Target</p>
            <p className="text-sm font-semibold text-slate-900">30 Days</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">SLA Status</p>
            <p className={`text-sm font-bold ${daysAgo > 30 ? 'text-red-700' : daysAgo > 25 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {daysAgo > 30 ? 'Overdue' : daysAgo > 25 ? 'At Risk' : 'On Track'}
            </p>
          </div>
        </div>
      </div>
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
