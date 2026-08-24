import { CheckCircle, XCircle } from 'lucide-react';
import { ReviewerAssignmentRow, ProfileRow, ScreeningResponse } from '../../../lib/workflow';

interface Props {
  reviewerAssignments: ReviewerAssignmentRow[];
  profiles: Record<string, ProfileRow>;
}

const QUESTION_LABELS: Record<string, string> = {
  focus_scope_relevance: 'Focus, Scope, and Relevance',
  theoretical_novelty: 'Theoretical Novelty',
  methodology_soundness: 'Methodology Soundness',
  replicability_check: 'Replicability Check',
  structured_completeness: 'Structured Completeness',
  data_integrity: 'Data Integrity',
  references_relevance: 'References Relevance',
  ethical_attestation: 'Ethical Attestation',
  structural_clarity: 'Structural Clarity',
  conclusion_justification: 'Conclusion Justification',
};

// Legacy 7-criterion 1-10 scoring, kept for reviews submitted before the
// Yes/No questionnaire replaced it -- see 0028_reviewer_peer_review_questionnaire.sql.
const LEGACY_SCORES: { label: string; key: keyof ReviewerAssignmentRow }[] = [
  { label: 'Scientific Merit', key: 'scientific_merit' },
  { label: 'Novelty', key: 'novelty_innovation' },
  { label: 'Methodology', key: 'methodology_quality' },
  { label: 'Literature', key: 'literature_adequacy' },
  { label: 'Ethics', key: 'ethical_compliance' },
  { label: 'Data', key: 'data_reliability' },
  { label: 'Writing', key: 'writing_quality' },
];

export function ReviewsTab({ reviewerAssignments, profiles }: Props) {
  const submittedReviews = reviewerAssignments.filter(r => r.status === 'SUBMITTED');

  if (reviewerAssignments.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <p className="text-slate-600">No reviewers assigned yet</p>
      </div>
    );
  }

  if (submittedReviews.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <p className="text-slate-600">Waiting for reviewer reports...</p>
        <p className="text-sm text-slate-500 mt-1">
          {reviewerAssignments.length} reviewer(s) invited, 0 reports received
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
        <p className="text-sm font-bold text-slate-700">Review Progress</p>
        <p className="text-2xl font-black text-slate-900 mt-1">
          {submittedReviews.length} / {reviewerAssignments.length} completed
        </p>
      </div>

      {submittedReviews.map((review, idx) => {
        const hasQuestionnaire = (review.screening_responses?.length ?? 0) > 0;
        return (
          <div key={review.id} className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="mb-4 pb-4 border-b border-slate-200">
              <p className="font-bold text-slate-900">Reviewer {idx + 1}: {profiles[review.reviewer_id]?.name || 'Unknown'}</p>
              <p className="text-xs text-slate-600">{profiles[review.reviewer_id]?.email}</p>
              <p className="text-xs text-slate-500 mt-1">
                Submitted: {review.submitted_at ? new Date(review.submitted_at).toLocaleString() : 'N/A'}
              </p>
            </div>

            <div className="space-y-4">
              {hasQuestionnaire ? (
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">Questionnaire</p>
                  <div className="space-y-2">
                    {(review.screening_responses as ScreeningResponse[]).map((r, qIdx) => (
                      <div key={r.question_id} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-slate-800">{qIdx + 1}. {QUESTION_LABELS[r.question_id] || r.question_id}</p>
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
                </div>
              ) : (
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">Assessment Scores</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {LEGACY_SCORES.map(score => (
                      <div key={score.label} className="bg-slate-50 rounded p-2 text-center">
                        <p className="text-[10px] text-slate-600 font-bold">{score.label}</p>
                        <p className="text-lg font-black text-slate-900">{(review[score.key] as number | null) ?? '--'}/10</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {review.comments_to_author && (
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase mb-1">Comments to Author</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{review.comments_to_author}</p>
                </div>
              )}

              {review.comments_to_editor && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-blue-900 uppercase mb-1">Confidential Comments to Editor</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{review.comments_to_editor}</p>
                </div>
              )}

              {review.recommendation && (
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase mb-1">Recommendation</p>
                  <p className="text-sm font-semibold text-slate-900">{review.recommendation.replace(/_/g, ' ')}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
