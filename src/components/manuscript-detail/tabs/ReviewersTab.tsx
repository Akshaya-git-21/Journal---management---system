import { ReviewerAssignmentRow, ProfileRow, SuggestedReviewerRow } from '../../../lib/workflow';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  reviewerAssignments: ReviewerAssignmentRow[];
  suggestedReviewers: SuggestedReviewerRow[];
  profiles: Record<string, ProfileRow>;
}

export function ReviewersTab({ reviewerAssignments, profiles }: Props) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'DECLINED':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-amber-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return 'bg-emerald-50 text-emerald-700';
      case 'DECLINED':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-amber-50 text-amber-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Assigned Reviewers */}
      {reviewerAssignments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <p className="text-slate-600">No reviewers assigned or suggested yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviewerAssignments.map((reviewer, idx) => {
            const profile = profiles[reviewer.reviewer_id];
            return (
              <div key={reviewer.id} className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-bold text-slate-900">Reviewer {idx + 1}</p>
                    <p className="text-sm text-slate-600">{profile?.name || 'Unknown'}</p>
                    <p className="text-xs text-slate-600">{profile?.email}</p>
                  </div>
                  <span className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(reviewer.status)}`}>
                    {getStatusIcon(reviewer.status)}
                    {reviewer.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {reviewer.invited_at && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Invited At</p>
                      <p className="text-slate-700">{new Date(reviewer.invited_at).toLocaleDateString()}</p>
                    </div>
                  )}
                  {reviewer.responded_at && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Responded At</p>
                      <p className="text-slate-700">{new Date(reviewer.responded_at).toLocaleDateString()}</p>
                    </div>
                  )}
                  {reviewer.submitted_at && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Submitted At</p>
                      <p className="text-slate-700">{new Date(reviewer.submitted_at).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
