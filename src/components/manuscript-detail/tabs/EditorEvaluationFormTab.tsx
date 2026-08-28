import React, { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle, XCircle, Send, RotateCcw, ArrowRight } from 'lucide-react';
import { EditorAssignmentRow, RevisionRow, ScreeningResponse, submitEditorScreening, submitEditorRecommendation } from '../../../lib/workflow';
import { getLatestRevision } from '../../../lib/manuscriptStatusLabel';

interface Props {
  assignmentId: string;
  manuscriptId: string;
  assignment: EditorAssignmentRow;
  suggestedReviewers?: unknown;
  revisions?: RevisionRow[];
  onSubmitSuccess: () => void;
  /** Called instead of onSubmitSuccess specifically when the Editor confirms
   * "Move to Next Stage" -- lets the parent jump straight to the reviewer
   * selection screen instead of leaving the Editor on this now-submitted
   * form. Falls back to onSubmitSuccess if not provided. Mirrors
   * EditorRevisionReview.tsx's onMoveToNextStage. */
  onMoveToNextStage?: () => void;
}

const QUESTIONS: { id: string; label: string; question: string }[] = [
  { id: 'scope_fit', label: 'Journal Scope Fit', question: 'Does the topic of the manuscript explicitly fall within the published aims, scope, and target audience of this journal?' },
  { id: 'novelty_significance', label: 'Novelty and Significance', question: 'Does the study present a sufficiently original contribution or significant advancement rather than purely incremental data?' },
  { id: 'scientific_soundness', label: 'Scientific Soundness', question: 'Are the core research questions, methodology, data analysis, and resulting conclusions fundamentally logical and scientifically sound?' },
  { id: 'completeness', label: 'Manuscript Completeness', question: 'Are all necessary sections, main figures, tables, text references, and required supplementary materials fully present in the submission?' },
  { id: 'guidelines_compliance', label: 'Author Guidelines Compliance', question: "Does the manuscript strictly follow the journal's formatting layout, specific word counts, structural breakdown, and citation style?" },
  { id: 'ethical_compliance', label: 'Ethical Compliance', question: 'Are the required ethical approvals, institutional board statements, and informed consent declarations clearly documented within the text?' },
  { id: 'disclosures', label: 'Disclosures and Declarations', question: 'Have the authors fully declared all funding sources, institutional support, and potential competing or conflicts of interest?' },
  { id: 'research_integrity', label: 'Research Integrity', question: 'Is the manuscript free from significant text overlaps, potential plagiarism flags, or indications of duplicate/piecemeal publication?' },
  { id: 'language_clarity', label: 'Language and Clarity', question: 'Is the level of written language, grammar, and presentation clear enough for international reviewers to easily read and comprehend?' },
  { id: 'reviewer_suitability', label: 'Reviewer Suitability', question: 'Is the specific subject matter practical to evaluate, and can a suitable pool of expert external reviewers be identified for this topic?' },
];

type FinalAction = 'REJECT' | 'RETURN_TO_AUTHOR' | 'NEXT_STAGE';

const ACTION_META: Record<FinalAction, { title: string; confirmLabel: string; needsReason: boolean; recommendation: 'REJECT' | 'MAJOR_REVISION' | 'ACCEPT' }> = {
  REJECT: { title: 'Reject Submission', confirmLabel: 'Confirm Rejection', needsReason: true, recommendation: 'REJECT' },
  RETURN_TO_AUTHOR: { title: 'Return to Author', confirmLabel: 'Confirm Return to Author', needsReason: true, recommendation: 'MAJOR_REVISION' },
  NEXT_STAGE: { title: 'Move to Next Stage', confirmLabel: 'Confirm & Move to Next Stage', needsReason: false, recommendation: 'ACCEPT' },
};

export function EditorEvaluationFormTab({
  assignmentId,
  manuscriptId,
  assignment,
  revisions = [],
  onSubmitSuccess,
  onMoveToNextStage,
}: Props) {
  const latestRevision = getLatestRevision(revisions);
  const isRevisionReview = latestRevision?.status === 'UNDER_REVIEW';
  const nextRevisionNumber = (latestRevision?.revision_number || 0) + 1;

  const [responses, setResponses] = useState<Record<string, { answer: boolean | null; reason: string }>>(
    () => Object.fromEntries(QUESTIONS.map(q => [q.id, { answer: null, reason: '' }]))
  );
  const [comments, setComments] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<FinalAction | null>(null);
  const [actionReason, setActionReason] = useState('');

  const setAnswer = (id: string, answer: boolean) =>
    setResponses(prev => ({ ...prev, [id]: { ...prev[id], answer } }));
  const setReason = (id: string, reason: string) =>
    setResponses(prev => ({ ...prev, [id]: { ...prev[id], reason } }));

  const unanswered = QUESTIONS.filter(q => responses[q.id].answer === null);
  const missingReasons = QUESTIONS.filter(q => responses[q.id].answer !== null && !responses[q.id].reason.trim());
  const questionnaireComplete = unanswered.length === 0 && missingReasons.length === 0;

  const runFinalAction = async (action: FinalAction) => {
    const meta = ACTION_META[action];
    if (meta.needsReason && !actionReason.trim()) {
      setError('A reason is required for this action.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const payload: ScreeningResponse[] = QUESTIONS.map(q => ({
        question_id: q.id,
        answer: responses[q.id].answer as boolean,
        reason: responses[q.id].reason.trim(),
      }));
      await submitEditorScreening(assignmentId, payload, comments);
      await submitEditorRecommendation(
        manuscriptId,
        meta.recommendation,
        undefined,
        undefined,
        meta.needsReason ? actionReason.trim() : undefined
      );
      setPendingAction(null);
      if (action === 'NEXT_STAGE') {
        (onMoveToNextStage || onSubmitSuccess)();
      } else {
        onSubmitSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const openAction = (action: FinalAction) => {
    if (!questionnaireComplete) {
      setError('Please answer all 10 questions and provide a reason for each before continuing.');
      return;
    }
    setError('');
    setActionReason('');
    setPendingAction(action);
  };

  const hasSubmittedEvaluation = assignment.assessment_status === 'SUBMITTED';

  if (hasSubmittedEvaluation) {
    return (
      <div className="space-y-6 pt-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-emerald-700" />
          <p className="text-emerald-900 font-semibold mb-2">Screening Submitted</p>
          <p className="text-sm text-emerald-800">
            Your Initial Editorial Screening has been recorded.
            {assignment.recommendation ? ` Action: ${assignment.recommendation.replace(/_/g, ' ')}.` : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-32 pt-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {isRevisionReview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900 text-sm">
          You're reviewing the Revision {latestRevision!.revision_number} resubmission. Complete the screening below, then choose whether to move forward or request Revision {nextRevisionNumber}.
        </div>
      )}

      <div className="space-y-6">
        <h3 className="text-sm font-black text-slate-900">SCREENING QUESTIONNAIRE</h3>

        {QUESTIONS.map((q, idx) => {
          const state = responses[q.id];
          return (
            <div key={q.id} className="border-b border-slate-200 pb-6">
              <h4 className="text-sm font-black text-slate-900">{idx + 1}. {q.label.toUpperCase()}</h4>
              <p className="text-xs text-slate-600 mt-1 mb-3">{q.question}</p>

              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setAnswer(q.id, true)}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
                    state.answer === true ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" /> Yes
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setAnswer(q.id, false)}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
                    state.answer === false ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  <XCircle className="w-4 h-4" /> No
                </button>
              </div>

              <label className="block text-xs font-bold text-slate-700 mb-2">Reason / Comments *</label>
              <textarea
                value={state.reason}
                onChange={(e) => setReason(q.id, e.target.value)}
                placeholder="Explain your answer for this question..."
                disabled={loading}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={2}
              />
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-2">
        <h3 className="text-sm font-black text-slate-900">Editor Comments</h3>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="General observations, recommendations, or concerns not tied to a specific question..."
          disabled={loading}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          rows={5}
        />
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-900">Final Editorial Action</h3>
        {!questionnaireComplete && (
          <p className="text-xs text-amber-700 font-semibold">
            Answer all 10 questions with a reason for each before choosing an action ({unanswered.length + missingReasons.length} remaining).
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => openAction('REJECT')}
            disabled={loading}
            className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" /> Reject Submission
          </button>
          <button
            type="button"
            onClick={() => openAction('RETURN_TO_AUTHOR')}
            disabled={loading}
            className="flex-1 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> {isRevisionReview ? `Request Revision ${nextRevisionNumber}` : 'Return to Author'}
          </button>
          <button
            type="button"
            onClick={() => openAction('NEXT_STAGE')}
            disabled={loading}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded transition flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" /> Move to Next Stage
          </button>
        </div>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">{ACTION_META[pendingAction].title}</h3>
            {ACTION_META[pendingAction].needsReason ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  {pendingAction === 'REJECT' ? 'Rejection Reason *' : 'Reason for Revision / Return *'}
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                  rows={4}
                  autoFocus
                />
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                This sends the manuscript forward to reviewer selection. The Editor will choose 2 reviewers from the approved Reviewer Board next.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={loading}
                onClick={() => setPendingAction(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => runFinalAction(pendingAction)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {ACTION_META[pendingAction].confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
