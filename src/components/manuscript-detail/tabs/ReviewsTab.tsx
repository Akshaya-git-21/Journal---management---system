import { ReviewerAssignmentRow, ProfileRow } from '../../../lib/workflow';

interface Props {
  reviewerAssignments: ReviewerAssignmentRow[];
  profiles: Record<string, ProfileRow>;
}

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

      {submittedReviews.map((review, idx) => (
        <div key={review.id} className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="mb-4 pb-4 border-b border-slate-200">
            <p className="font-bold text-slate-900">Reviewer {idx + 1}: {profiles[review.reviewer_id]?.name || 'Unknown'}</p>
            <p className="text-xs text-slate-600">{profiles[review.reviewer_id]?.email}</p>
            <p className="text-xs text-slate-500 mt-1">
              Submitted: {review.submitted_at ? new Date(review.submitted_at).toLocaleString() : 'N/A'}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase mb-2">Assessment Scores</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Scientific Merit', value: review.scientific_merit },
                  { label: 'Novelty', value: review.novelty_innovation },
                  { label: 'Methodology', value: review.methodology_quality },
                  { label: 'Literature', value: review.literature_adequacy },
                  { label: 'Ethics', value: review.ethical_compliance },
                  { label: 'Data', value: review.data_reliability },
                  { label: 'Writing', value: review.writing_quality }
                ].map(score => (
                  <div key={score.label} className="bg-slate-50 rounded p-2 text-center">
                    <p className="text-[10px] text-slate-600 font-bold">{score.label}</p>
                    <p className="text-lg font-black text-slate-900">{score.value ?? '--'}/10</p>
                  </div>
                ))}
              </div>
            </div>

            {review.recommendation && (
              <div>
                <p className="text-xs font-bold text-slate-700 uppercase mb-1">Recommendation</p>
                <p className="text-sm font-semibold text-slate-900">{review.recommendation.replace(/_/g, ' ')}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
