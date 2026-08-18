import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, StatusHistoryRow } from '../../lib/workflow';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

interface Props {
  manuscript: ManuscriptRow;
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  statusHistory: StatusHistoryRow[];
}

interface WorkflowStage {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'rejected';
  timestamp?: string;
}

export default function WorkflowStatusTracker({
  manuscript,
  editorAssignments,
  reviewerAssignments,
  statusHistory
}: Props) {
  const getStages = (): WorkflowStage[] => {
    const stages: WorkflowStage[] = [];

    // 1. Submitted
    stages.push({
      id: 'submitted',
      label: 'Submitted',
      status: 'completed',
      timestamp: manuscript.submitted_at
    });

    // 2. Editor Assigned
    const editorAssigned = editorAssignments.length > 0;
    stages.push({
      id: 'editor-assigned',
      label: 'Editor Assigned',
      status: editorAssigned ? 'completed' : 'pending',
      timestamp: editorAssignments[0]?.assigned_at
    });

    // 3. Editor Accepted
    const editorAccepted = editorAssignments.some(a => a.status === 'ACCEPTED');
    stages.push({
      id: 'editor-accepted',
      label: 'Editor Accepted',
      status: editorAccepted ? 'completed' : editorAssigned ? 'pending' : 'pending',
      timestamp: editorAssignments.find(a => a.status === 'ACCEPTED')?.responded_at
    });

    // 4. Editor Evaluation
    const evaluationSubmitted = editorAssignments.some(a => a.assessment_status === 'SUBMITTED');
    stages.push({
      id: 'editor-evaluation',
      label: 'Editor Evaluation',
      status: evaluationSubmitted ? 'completed' : editorAccepted ? 'pending' : 'pending',
      timestamp: editorAssignments.find(a => a.assessment_status === 'SUBMITTED')?.assessment_submitted_at
    });

    // 5. Peer Review
    const reviewersAssigned = reviewerAssignments.length > 0;
    const allReviewsSubmitted = reviewersAssigned && reviewerAssignments.every(r => r.status === 'SUBMITTED');

    stages.push({
      id: 'peer-review',
      label: 'Peer Review',
      status: allReviewsSubmitted ? 'completed' : reviewersAssigned ? 'current' : 'pending',
      timestamp: reviewerAssignments.find(r => r.status === 'SUBMITTED')?.submitted_at
    });

    // 6. Decision
    const hasRecommendation = editorAssignments.some(a => a.recommendation);
    stages.push({
      id: 'decision',
      label: 'Decision',
      status: manuscript.status === 'ACCEPTED' || manuscript.status === 'REJECTED' || manuscript.status === 'REVISION_REQUESTED' ? 'completed' : allReviewsSubmitted ? 'current' : 'pending',
      timestamp: statusHistory.find(h => h.to_status === 'AWAITING_DECISION')?.created_at
    });

    // 7. Revision
    const revisionRequested = manuscript.status === 'REVISION_REQUESTED';
    stages.push({
      id: 'revision',
      label: 'Revision',
      status: revisionRequested ? 'current' : manuscript.status === 'ACCEPTED' || manuscript.status === 'PUBLISHED' ? 'completed' : 'pending'
    });

    // 8. Completed
    const isPublished = manuscript.status === 'PUBLISHED' || manuscript.status === 'ACCEPTED';
    stages.push({
      id: 'completed',
      label: 'Completed',
      status: isPublished ? 'completed' : 'pending',
      timestamp: statusHistory.find(h => h.to_status === 'PUBLISHED')?.created_at
    });

    return stages;
  };

  const stages = getStages();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'current':
        return <Circle className="w-5 h-5 text-blue-600 fill-blue-600" />;
      case 'rejected':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Circle className="w-5 h-5 text-slate-300" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-700 bg-emerald-50';
      case 'current':
        return 'text-blue-700 bg-blue-50';
      case 'rejected':
        return 'text-red-700 bg-red-50';
      default:
        return 'text-slate-600 bg-slate-50';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-6">Workflow Status</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-2">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-3">
              <div className={`flex flex-col items-center ${getStatusColor(stage.status)} px-3 py-2 rounded-lg`}>
                <div className="mb-1">{getStatusIcon(stage.status)}</div>
                <p className="text-xs font-bold text-center">{stage.label}</p>
                {stage.timestamp && (
                  <p className="text-[10px] mt-1 opacity-75">{new Date(stage.timestamp).toLocaleDateString()}</p>
                )}
              </div>
              {index < stages.length - 1 && (
                <div className={`w-6 h-0.5 ${stage.status === 'completed' ? 'bg-emerald-600' : 'bg-slate-200'}`}></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
