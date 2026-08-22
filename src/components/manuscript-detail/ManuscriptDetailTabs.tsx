import { ManuscriptRow } from '../../lib/workflow';
import { OverviewTab } from './tabs/OverviewTab';
import { ManuscriptTab } from './tabs/ManuscriptTab';
import { FilesTab } from './tabs/FilesTab';
import { EditorEvaluationTab } from './tabs/EditorEvaluationTab';
import { EditorEvaluationFormTab } from './tabs/EditorEvaluationFormTab';
import { ReviewBoardTab } from './tabs/ReviewBoardTab';
import { ReviewersTab } from './tabs/ReviewersTab';
import { ReviewsTab } from './tabs/ReviewsTab';
import { DecisionTab } from './tabs/DecisionTab';
import { DecisionHistoryTab } from './tabs/DecisionHistoryTab';
import { TimelineTab } from './tabs/TimelineTab';
import { HistoryTab } from './tabs/HistoryTab';
import { NotesTab } from './tabs/NotesTab';

interface Props {
  manuscript: ManuscriptRow;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  data: any;
  onDataChange: () => void;
  onWorkflowChange: () => void;
  currentUserId?: string;
  isEditor?: boolean;
  showAllFiles?: boolean;
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📋' },
  { id: 'manuscript', label: 'Manuscript', icon: '📄' },
  { id: 'files', label: 'Files for Review (1)', icon: '📁' },
  { id: 'evaluation', label: 'Editor Evaluation (2)', icon: '✍️' },
  { id: 'review-board', label: 'Review Board (3)', icon: '👥' },
  { id: 'reviewers', label: 'Reviewers (4)', icon: '🔍' },
  { id: 'reviews', label: 'Reviews (5)', icon: '📝' },
  { id: 'decision', label: 'Decision (6)', icon: '⚖️' },
  { id: 'decision-history', label: 'Decision History', icon: '🕘' },
  { id: 'timeline', label: 'Timeline', icon: '⏱️' },
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'notes', label: 'Notes', icon: '📌' },
];

export default function ManuscriptDetailTabs({
  manuscript,
  activeTab,
  setActiveTab,
  data,
  onDataChange,
  onWorkflowChange,
  currentUserId,
  isEditor,
  showAllFiles = false
}: Props) {
  // Step numbering for editor workflow guidance
  const editorAssignment = data.editorAssignments?.[0];
  const canEditEvaluation = isEditor &&
    editorAssignment?.status === 'ACCEPTED' &&
    editorAssignment?.assessment_status === 'NOT_STARTED';
  return (
    <div>
      {/* Tab buttons */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 px-6 py-3 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'text-emerald-700 border-b-2 border-emerald-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-slate-50 p-6">
        {activeTab === 'overview' && (
          <OverviewTab
            manuscript={manuscript}
            editorAssignments={data.editorAssignments}
            reviewerAssignments={data.reviewerAssignments}
            suggestedReviewers={data.suggestedReviewers}
            profiles={data.profiles}
            revisions={data.revisions || []}
            onWorkflowChange={() => { onDataChange(); onWorkflowChange(); }}
          />
        )}
        {activeTab === 'manuscript' && (
          <ManuscriptTab
            manuscript={manuscript}
            contributors={data.contributors}
          />
        )}
        {activeTab === 'files' && (
          <FilesTab manuscriptId={manuscript.id} showAllFiles={showAllFiles} revisions={data.revisions || []} />
        )}
        {activeTab === 'evaluation' && (
          canEditEvaluation && editorAssignment ? (
            <EditorEvaluationFormTab
              assignmentId={editorAssignment.id}
              manuscriptId={manuscript.id}
              assignment={editorAssignment}
              suggestedReviewers={data.suggestedReviewers}
              revisions={data.revisions || []}
              onSubmitSuccess={onDataChange}
            />
          ) : (
            <EditorEvaluationTab
              editorAssignments={data.editorAssignments}
              profiles={data.profiles}
            />
          )
        )}
        {activeTab === 'review-board' && (
          <ReviewBoardTab
            manuscript={manuscript}
            suggestedReviewers={data.suggestedReviewers}
            reviewerAssignments={data.reviewerAssignments}
            profiles={data.profiles}
            onDataChange={onDataChange}
          />
        )}
        {activeTab === 'reviewers' && (
          <ReviewersTab
            reviewerAssignments={data.reviewerAssignments}
            suggestedReviewers={data.suggestedReviewers}
            profiles={data.profiles}
          />
        )}
        {activeTab === 'reviews' && (
          <ReviewsTab
            reviewerAssignments={data.reviewerAssignments}
            profiles={data.profiles}
          />
        )}
        {activeTab === 'decision' && (
          <DecisionTab
            manuscript={manuscript}
            editorAssignments={data.editorAssignments}
            reviewerAssignments={data.reviewerAssignments}
            revisions={data.revisions || []}
            statusHistory={data.statusHistory || []}
            profiles={data.profiles || {}}
            isEditor={isEditor}
            onWorkflowChange={() => { onDataChange(); onWorkflowChange(); }}
          />
        )}
        {activeTab === 'decision-history' && (
          <DecisionHistoryTab
            editorAssignments={data.editorAssignments}
            reviewerAssignments={data.reviewerAssignments}
            revisions={data.revisions || []}
            statusHistory={data.statusHistory || []}
            profiles={data.profiles || {}}
          />
        )}
        {activeTab === 'timeline' && (
          <TimelineTab
            statusHistory={data.statusHistory}
            profiles={data.profiles}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            statusHistory={data.statusHistory}
            profiles={data.profiles}
          />
        )}
        {activeTab === 'notes' && (
          <NotesTab manuscript={manuscript} />
        )}
      </div>
    </div>
  );
}
