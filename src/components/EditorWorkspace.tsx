import { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, DiscussionRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getRevisions, subscribeToManuscripts,
  respondToEditorAssignment, submitEditorAssessment, submitEditorRecommendation, publishDecision,
  getManuscript, getContributors, getDiscussions
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import {
  getEditorAssignedManuscripts,
  subscribeToEditorAssignments,
  EditorManuscriptDetails,
  ManuscriptFileRow,
  respondToAssignment,
  saveDraftEvaluation,
  getDraftEvaluation,
  submitAssessment,
  submitRecommendation,
  publishFinalDecision,
  assignReviewers,
  removeReviewerAssignment,
  updateReviewerStatus,
  subscribeToReviewerChanges,
  postDiscussion,
  subscribeToDiscussions,
  postInternalNote,
  notifyCoordinator,
  subscribeToAllManuscriptUpdates,
  retryOperation,
  categorizeError,
  validateAssignmentData,
  formatDate,
  formatDateTime,
  addSuggestedReviewer
} from '../lib/editorWorkspace';
import { Loader2, ArrowLeft, Check, X as XIcon, Plus, Trash2, ChevronDown, Clock, AlertCircle, Archive, CheckCircle, FileText, Settings, Save, Send } from 'lucide-react';
import RevisionReview from './RevisionReview';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import { EditorEvaluationFormTab } from './manuscript-detail/tabs/EditorEvaluationFormTab';
import EditorEvaluationSidebar from './EditorEvaluationSidebar';
import FilePreviewModal from './FilePreviewModal';

interface EditorWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (m: any) => void;
  onDeleteManuscript?: (id: string) => void;
  currentUser?: { name: string; email: string; role: Role } | null;
}

const STATUS_STYLES: Record<ManuscriptStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
  EDITOR_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-purple-50 text-purple-700 border-purple-200',
  REVISION_REQUESTED: 'bg-orange-50 text-orange-700 border-orange-200',
  AWAITING_DECISION: 'bg-sky-50 text-sky-700 border-sky-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
};

function StatusBadge({ status }: { status: ManuscriptStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function EditorWorkspace({ currentUser }: EditorWorkspaceProps) {
  const [rows, setRows] = useState<EditorManuscriptDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    submissions: true,
    reviewStages: false,
    copyedit: false
  });
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptingAssignment, setAcceptingAssignment] = useState(false);
  const [decliningAssignment, setDecliningAssignment] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);

  // Real predicates over actual assignment/manuscript/reviewer data -- no
  // fabricated counts. Buckets with no matching schema field (overdue
  // tracking uses reviewer_assignments.due_date; scheduling/copyediting has
  // no dedicated status in this schema) fall back to an honest empty state
  // rather than inventing a stage that isn't tracked.
  const SECTION_FILTERS: Record<string, { label: string; predicate: (r: EditorManuscriptDetails) => boolean }> = {
    'active-submissions': { label: 'Active Submissions', predicate: (r) => r.assignment.status === 'ACCEPTED' },
    'needs-editor': { label: 'Needs Editor', predicate: (r) => r.assignment.assessment_status === 'NOT_STARTED' },
    'in-submission-stage': { label: 'In Submission Stage', predicate: (r) => r.assignment.status === 'INVITED' },
    'awaiting-reviews': { label: 'Awaiting Reviews', predicate: (r) => r.manuscript.status === 'UNDER_REVIEW' && r.reviewers.some((rv) => rv.status !== 'SUBMITTED') },
    'reviews-submitted': { label: 'Reviews Submitted', predicate: (r) => r.reviewers.length > 0 && r.reviewers.every((rv) => rv.status === 'SUBMITTED') },
    'reviews-overdue': { label: 'Reviews Overdue', predicate: (r) => r.reviewers.some((rv) => rv.status !== 'SUBMITTED' && !!rv.due_date && new Date(rv.due_date) < new Date()) },
    'revisions-submitted': { label: 'Revisions Submitted', predicate: (r) => r.revisions.length > 0 },
    'in-review-stage': { label: 'In Review Stage', predicate: (r) => r.manuscript.status === 'UNDER_REVIEW' },
    'copyediting-stage': { label: 'Copyediting Stage', predicate: (r) => r.manuscript.status === 'ACCEPTED' },
    'in-production-stage': { label: 'In Production Stage', predicate: (r) => r.manuscript.status === 'ACCEPTED' },
    'scheduled-articles': { label: 'Scheduled Articles', predicate: () => false },
    'published-articles': { label: 'Published', predicate: (r) => r.manuscript.status === 'PUBLISHED' },
    'declined-rejected': { label: 'Declined / Rejected', predicate: (r) => r.manuscript.status === 'REJECTED' },
  };

  const load = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) {
        setLoading(false);
        return;
      }
      const details = await getEditorAssignedManuscripts(data.user.id);
      setRows(details);
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = rows.filter((row) => {
    if (sectionFilter && !SECTION_FILTERS[sectionFilter]?.predicate(row)) return false;
    const query = searchTerm.toLowerCase();
    return (
      row.manuscript.title.toLowerCase().includes(query) ||
      row.manuscript.id.toLowerCase().includes(query) ||
      row.assignment.status.toLowerCase().includes(query)
    );
  });

  const assignmentCounts = {
    total: rows.length,
    invited: rows.filter((r) => r.assignment.status === 'INVITED').length,
    accepted: rows.filter((r) => r.assignment.status === 'ACCEPTED').length,
    submitted: rows.filter((r) => r.assignment.assessment_status === 'SUBMITTED').length,
    pending: rows.filter((r) => r.assignment.assessment_status === 'NOT_STARTED').length,
  };

  useEffect(() => {
    load();
    if (!currentUser?.email) return;

    // Subscribe to real-time updates
    const setupSubscription = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) return;

      const unsubscribe = subscribeToEditorAssignments(data.user.id, setRows);
      return unsubscribe;
    };

    const unsubscribePromise = setupSubscription();
    return () => {
      unsubscribePromise.then(unsub => unsub?.());
    };
  }, [currentUser?.email]);

  const selected = rows.find((r) => r.manuscript.id === selectedManuscriptId) || null;
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Show accept/decline modal if assignment is INVITED
  if (selected && selected.assignment.status === 'INVITED' && showAcceptModal) {
    return (
      <AcceptDeclineModal
        details={selected}
        onAccept={async () => {
          setAcceptingAssignment(true);
          try {
            await respondToAssignment(selected.assignment.id, true);
            setShowAcceptModal(false);
            await load();
          } catch (error: any) {
            alert('Error accepting assignment: ' + error.message);
          } finally {
            setAcceptingAssignment(false);
          }
        }}
        onDecline={async () => {
          setDecliningAssignment(true);
          try {
            await respondToAssignment(selected.assignment.id, false);
            setShowAcceptModal(false);
            setSelectedManuscriptId(null);
            await load();
          } catch (error: any) {
            alert('Error declining assignment: ' + error.message);
          } finally {
            setDecliningAssignment(false);
          }
        }}
        isAcceptLoading={acceptingAssignment}
        isDeclineLoading={decliningAssignment}
      />
    );
  }

  if (selected && selected.assignment.status === 'INVITED' && !showAcceptModal) {
    setShowAcceptModal(true);
  }

  if (selected && selected.assignment.status === 'ACCEPTED') {
    return <AssignmentDetail
      details={selected}
      onBack={() => {
        setSelectedManuscriptId(null);
        setShowAcceptModal(false);
      }}
      onChanged={load}
      currentUser={currentUser}
    />;
  }

  return (
    <div className="w-full h-screen bg-slate-50 flex font-sans overflow-hidden">
      <aside className="w-80 bg-[#1a4038] text-white flex flex-col overflow-y-auto shadow-lg border-r border-[#0f3f37]">
        <div className="p-6 border-b border-[#0f3f37] shrink-0">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <Settings className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{currentUser?.name || 'Editor'}</h3>
              <p className="text-xs text-emerald-200/80">Managing Editor</p>
            </div>
          </div>
          <div className="bg-[#0f3f37] rounded-lg px-3 py-2 text-xs">
            <p className="text-emerald-200/60 text-[10px] uppercase tracking-wider font-semibold">Core Jurisdiction:</p>
            <p className="text-emerald-400 font-bold mt-1">Unrestricted</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-3 overflow-y-auto">
          <div className="border border-emerald-500/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('submissions')}
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/15 px-4 py-3 flex items-center justify-between text-xs font-bold text-emerald-300 uppercase tracking-wider transition"
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Submissions
              </span>
              <ChevronDown className={`w-4 h-4 transition ${expandedSections.submissions ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.submissions && (
              <div className="bg-[#0f3f37]/50 divide-y divide-[#0f3f37]">
                {(['active-submissions', 'needs-editor', 'in-submission-stage'] as const).map((id) => {
                  const isActive = sectionFilter === id;
                  const count = rows.filter(SECTION_FILTERS[id].predicate).length;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSectionFilter(isActive ? null : id); setSelectedManuscriptId(null); }}
                      className={`w-full text-left px-4 py-2.5 text-xs transition flex items-center justify-between cursor-pointer ${
                        isActive ? 'bg-emerald-500/20 text-white font-semibold' : 'text-emerald-100/80 hover:bg-emerald-500/10'
                      }`}
                    >
                      <span>{SECTION_FILTERS[id].label}</span>
                      <span className="bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 text-[10px] font-bold">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-emerald-500/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('reviewStages')}
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/15 px-4 py-3 flex items-center justify-between text-xs font-bold text-emerald-300 uppercase tracking-wider transition"
            >
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Review Stages
              </span>
              <ChevronDown className={`w-4 h-4 transition ${expandedSections.reviewStages ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.reviewStages && (
              <div className="bg-[#0f3f37]/50 divide-y divide-[#0f3f37]">
                {(['awaiting-reviews', 'reviews-submitted', 'reviews-overdue', 'revisions-submitted', 'in-review-stage'] as const).map((id) => {
                  const isActive = sectionFilter === id;
                  const count = rows.filter(SECTION_FILTERS[id].predicate).length;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSectionFilter(isActive ? null : id); setSelectedManuscriptId(null); }}
                      className={`w-full text-left px-4 py-2.5 text-xs transition flex items-center justify-between cursor-pointer ${
                        isActive ? 'bg-emerald-500/20 text-white font-semibold' : 'text-emerald-100/80 hover:bg-emerald-500/10'
                      }`}
                    >
                      <span>{SECTION_FILTERS[id].label}</span>
                      <span className="bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 text-[10px] font-bold">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-emerald-500/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('copyedit')}
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/15 px-4 py-3 flex items-center justify-between text-xs font-bold text-emerald-300 uppercase tracking-wider transition"
            >
              <span className="flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Copyedit & Production
              </span>
              <ChevronDown className={`w-4 h-4 transition ${expandedSections.copyedit ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.copyedit && (
              <div className="bg-[#0f3f37]/50 divide-y divide-[#0f3f37]">
                {(['copyediting-stage', 'in-production-stage', 'scheduled-articles', 'published-articles', 'declined-rejected'] as const).map((id) => {
                  const isActive = sectionFilter === id;
                  const count = rows.filter(SECTION_FILTERS[id].predicate).length;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSectionFilter(isActive ? null : id); setSelectedManuscriptId(null); }}
                      className={`w-full text-left px-4 py-2.5 text-xs transition flex items-center justify-between cursor-pointer ${
                        isActive ? 'bg-emerald-500/20 text-white font-semibold' : 'text-emerald-100/80 hover:bg-emerald-500/10'
                      }`}
                    >
                      <span>{SECTION_FILTERS[id].label}</span>
                      <span className="bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 text-[10px] font-bold">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-8 py-5 shrink-0">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-semibold mb-1">SUBMISSIONS WORKFLOW REALM</p>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900">Submissions Intake Audit Console</h1>
              <p className="text-xs text-slate-500 mt-1">Select active categories to check incoming layout proofs, register direct editorial handlers, and validate author metadata.</p>
            </div>
            <div className="relative w-64">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search titles / IDs..."
                className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 focus:border-[#008751] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white border-2 border-emerald-200/50 rounded-2xl p-4">
              <Clock className="w-6 h-6 text-emerald-500 mb-2" />
              <p className="text-2xl font-black text-slate-900">{assignmentCounts.accepted}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Active Submissions</p>
            </div>
            <div className="bg-white border-2 border-amber-200/50 rounded-2xl p-4">
              <AlertCircle className="w-6 h-6 text-amber-500 mb-2" />
              <p className="text-2xl font-black text-slate-900">{assignmentCounts.pending}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Needs Editor</p>
            </div>
            <div className="bg-white border-2 border-teal-200/50 rounded-2xl p-4">
              <Archive className="w-6 h-6 text-teal-500 mb-2" />
              <p className="text-2xl font-black text-slate-900">0</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">In Submission</p>
            </div>
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-4">
              <FileText className="w-6 h-6 text-slate-600 mb-2" />
              <p className="text-2xl font-black text-slate-900">0</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">System Pipeline</p>
            </div>
          </div>


          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          ) : filteredRows.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-24 text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-emerald-500" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 font-semibold mb-2">No manuscript records registered under the selected sub-tab category.</p>
                <p className="text-xs text-slate-400 mb-6">Try selecting a different workflow status from the left menu.</p>
                <button className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-6 py-2.5 rounded-lg transition">
                  VIEW ALL SUBMISSIONS →
                </button>
              </div>
            ) : (
              <AssignmentListWithPagination rows={filteredRows} onOpen={setSelectedManuscriptId} />
            )}

        </div>
      </main>
    </div>
  );
}

function AssignmentListWithPagination({ rows, onOpen }: { rows: EditorManuscriptDetails[]; onOpen: (id: string) => void }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  if (rows.length === 0) {
    return <div className="text-center py-24 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-400">No manuscript assignments yet.</div>;
  }

  const totalPages = Math.ceil(rows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRows = rows.slice(startIndex, endIndex);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Manuscript Status</th>
            <th className="px-4 py-3">Assignment</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {paginatedRows.map((details) => (
            <tr key={details.manuscript.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(details.manuscript.id)}>
              <td className="px-4 py-3 font-bold text-slate-800">{details.manuscript.title}</td>
              <td className="px-4 py-3"><StatusBadge status={details.manuscript.status} /></td>
              <td className="px-4 py-3 text-xs font-bold text-slate-600">{details.assignment.status}</td>
              <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open &rarr;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-slate-600 font-medium">
            Showing {startIndex + 1} to {Math.min(endIndex, rows.length)} of {rows.length} manuscripts
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded text-xs font-semibold transition ${
                    currentPage === page
                      ? 'bg-[#008751] text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function AssignmentDetail({ details, onBack, onChanged, currentUser }: { details: EditorManuscriptDetails; onBack: () => void; onChanged: () => void; currentUser?: { name: string; email: string; role: Role } | null }) {
  const { manuscript, assignment, reviewers: initialReviewerAssignments } = details;
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>(initialReviewerAssignments || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sidebarSection, setSidebarSection] = useState<'dashboard' | 'evaluation_timeline' | 'title_abstract' | 'authors' | 'manuscript' | 'references' | 'supplementary' | 'cover_letter' | 'discussions' | 'editor_evaluation' | 'reviews' | 'decision' | 'suggestions' | 'review_history' | 'metadata' | 'revisions' | 'production' | 'galley_files'>('dashboard');
  const [activeTab, setActiveTab] = useState<'files' | 'evaluation' | 'decision' | 'reviews' | 'suggestions' | 'history' | 'revisions' | 'comments'>('files');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [activePublication, setActivePublication] = useState<'title' | 'contributors' | 'metadata' | 'references' | 'galleries' | 'jats' | 'permissions' | 'issue'>('title');
  const [currentPage] = useState(1);
  const [showAddReviewerForm, setShowAddReviewerForm] = useState(false);
  const [newReviewerForm, setNewReviewerForm] = useState({ name: '', email: '', note: '' });
  const [addingReviewer, setAddingReviewer] = useState(false);
  const [savingReviewer, setSavingReviewer] = useState(false);
  const [saveReviewerError, setSaveReviewerError] = useState('');

  // Phase 2: Reviewer Management (display only — assignment happens via Coordinator Review Board)

  // Phase 3: Collaboration
  const [discussions, setDiscussions] = useState<DiscussionRow[]>(details.discussions || []);
  const [newComment, setNewComment] = useState('');
  const [newInternalNote, setNewInternalNote] = useState('');
  const [showInternalNotes, setShowInternalNotes] = useState(false);

  // Phase 4: Real-Time Updates & Polish
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Editor Evaluation Workflow
  const [assignmentAccepted] = useState(assignment.status === 'ACCEPTED');
  const evaluationSubmitted = assignment.assessment_status === 'SUBMITTED';

  const [previewFile, setPreviewFile] = useState<any>(null);

  // Phase 4: Set up real-time subscriptions for manuscript updates
  useEffect(() => {
    if (!manuscript.id) return;

    const unsubscribe = subscribeToAllManuscriptUpdates(
      manuscript.id,
      {
        onManuscriptChange: () => {
          onChanged();
        },
        onReviewerChange: (updated) => {
          setReviewerAssignments(updated);
          showNotification('info', 'Reviewer assignments updated');
        },
        onDiscussionChange: (updated) => {
          setDiscussions(updated);
        },
        onStatusChange: () => {
          onChanged();
        },
        onAssignmentChange: () => {
          onChanged();
        }
      }
    );

    setIsSubscribed(true);

    return () => {
      unsubscribe();
      setIsSubscribed(false);
    };
  }, [manuscript.id, onChanged]);

  // Phase 4: Notification helper
  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Phase 4: Enhanced error handler with categorization
  const handleError = async (error: any, context: string) => {
    const errorInfo = categorizeError(error);
    console.error(`[${context}]`, errorInfo);

    if (errorInfo.recoverable && retryCount < 2) {
      setRetryCount(retryCount + 1);
      showNotification('info', `${errorInfo.message} Retrying...`);
    } else {
      setError(errorInfo.message);
      showNotification('error', errorInfo.message);
    }
  };

  // Decision: Accept / Minor Revision / Major Revision / Reject. Separate
  // from the coordinator's final publish_decision -- this is the editor's
  // own recommendation, gated server-side on the evaluation already being
  // submitted (submit_editor_recommendation RPC re-checks assessment_status).
  const handleSubmitRecommendation = async (recommendation: ReviewerRecommendation) => {
    setDecisionBusy(true);
    setDecisionError('');
    try {
      await submitRecommendation(manuscript.id, recommendation);
      showNotification('success', `Recommendation submitted: ${recommendation.replace(/_/g, ' ')}`);
      onChanged();
    } catch (e: any) {
      setDecisionError(e.message || 'Failed to submit recommendation');
    } finally {
      setDecisionBusy(false);
    }
  };

  // Phase 3: Collaboration Handlers
  const handlePostComment = async () => {
    if (!newComment.trim()) {
      showNotification('error', 'Please enter a comment');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error('Not authenticated');

      await retryOperation(
        () => postDiscussion(manuscript.id, data.user.id, newComment, 'GENERAL'),
        3,
        1000
      );

      setNewComment('');
      showNotification('success', 'Comment posted successfully');
      onChanged();
    } catch (e: any) {
      await handleError(e, 'Post Comment');
    } finally {
      setBusy(false);
    }
  };

  const handlePostInternalNote = async () => {
    if (!newInternalNote.trim()) {
      showNotification('error', 'Please enter an internal note');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error('Not authenticated');

      await retryOperation(
        () => postInternalNote(manuscript.id, data.user.id, newInternalNote),
        3,
        1000
      );

      setNewInternalNote('');
      setShowInternalNotes(false);
      showNotification('success', 'Internal note posted successfully');
      onChanged();
    } catch (e: any) {
      await handleError(e, 'Post Internal Note');
    } finally {
      setBusy(false);
    }
  };

  // Compute workflow stages from manuscript status
  const computeWorkflowStages = () => {
    const status = manuscript.status;
    const stages = [
      { label: 'Submission', stage: 'SUBMITTED' },
      { label: 'Review', stage: 'UNDER_REVIEW' },
      { label: 'Copyediting', stage: 'AWAITING_DECISION' },
      { label: 'Production', stage: 'PUBLISHED' }
    ];

    const statusOrder: Record<string, number> = {
      'DRAFT': 0,
      'SUBMITTED': 1,
      'EDITOR_REVIEW': 1.5,
      'UNDER_REVIEW': 2,
      'REVISION_REQUESTED': 2.5,
      'AWAITING_DECISION': 3,
      'ACCEPTED': 3.5,
      'PUBLISHED': 4,
      'REJECTED': -1
    };

    const currentOrder = statusOrder[status] || 0;
    return stages.map(stage => ({
      ...stage,
      done: statusOrder[stage.stage] <= currentOrder && currentOrder >= 0
    }));
  };

  // Extract figures/media from uploaded files
  const extractFigures = (): ManuscriptFileRow[] => {
    if (!details.files) return [];
    return details.files.filter(f =>
      f.file_type && (
        f.file_type.toLowerCase().includes('figure') ||
        f.file_type.toLowerCase().includes('table') ||
        f.file_type.toLowerCase().includes('image') ||
        f.file_type.toLowerCase().includes('supplementary')
      )
    );
  };

  const tabs = [
    { id: 'title', label: 'Title & Abstract' },
    { id: 'contributors', label: 'Contributors' },
    { id: 'files', label: 'Files for Review' },
    { id: 'evaluation', label: 'Editor Evaluation' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'suggestions', label: 'Suggestions' },
    { id: 'history', label: 'Review History' },
    { id: 'revisions', label: 'Revisions' },
    { id: 'comments', label: 'Collaboration' }
  ];

  return (
    <div className="w-full h-full flex bg-white overflow-hidden">
      {/* Phase 4: Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-semibold z-50 animate-pulse ${
          notification.type === 'success' ? 'bg-emerald-600' :
          notification.type === 'error' ? 'bg-red-600' :
          'bg-blue-600'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Phase 4: Subscription Status Indicator */}
      {isSubscribed && (
        <div className="fixed top-4 left-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 z-40">
          <span className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></span>
          Live Updates Active
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <EditorEvaluationSidebar
        details={details}
        activeTab={sidebarSection}
        onTabChange={setSidebarSection}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header with Breadcrumb */}
        <div className="bg-white border-b border-slate-200 px-8 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="text-slate-600 hover:text-slate-900 flex items-center gap-1 text-xs font-bold"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>Dashboard</span>
                <span>&gt;</span>
                <span>Editorial Desk</span>
                <span>&gt;</span>
                <span>Manuscripts</span>
                <span>&gt;</span>
                <span className="font-bold text-slate-900">{manuscript.id}</span>
              </div>
            </div>
            {/* Editor Profile - Moved to Header */}
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-2 border border-slate-200">
              <div className="w-8 h-8 bg-emerald-500 rounded-full text-white flex items-center justify-center font-bold text-xs">
                {currentUser?.name?.charAt(0).toUpperCase() || 'E'}
              </div>
              <div>
                <p className="font-semibold text-xs text-slate-900">{currentUser?.name || 'Editor'}</p>
                <p className="text-[10px] text-slate-600">{currentUser?.role || 'Editor'}</p>
              </div>
            </div>
          </div>
          <h1 className="text-lg font-black text-slate-900 mb-1">{manuscript.title || 'Manuscript Title'}</h1>
          <div className="flex items-center gap-3">
            {assignmentAccepted ? (
              <>
                <span className="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-bold">
                  ✓ Assignment Accepted
                </span>
                {evaluationSubmitted ? (
                  <span className="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full font-bold">
                    ✓ Evaluation Submitted
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-bold">
                    ⏳ Evaluation In Progress
                  </span>
                )}
              </>
            ) : (
              <span className="bg-slate-100 text-slate-700 text-xs px-3 py-1 rounded-full font-bold">{assignment.status || 'Pending'}</span>
            )}
          </div>
        </div>


        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* CENTER CONTENT - SCROLLABLE TABS */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ paddingRight: '320px' }}>
            {/* Tabs Bar - Only show for Dashboard */}
            {sidebarSection === 'dashboard' && (
              <div className="bg-white border-b border-slate-200 flex-shrink-0 overflow-x-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9', scrollbarGutter: 'stable' }}>
                <div className="flex gap-8 px-8 py-0 min-w-max">
                  {[
                    { id: 'files', label: 'Files for Review (1)' },
                    { id: 'evaluation', label: 'Editor Evaluation (2)' },
                    { id: 'reviews', label: 'Reviews (3)' },
                    { id: 'suggestions', label: 'Suggestions (4)' },
                    { id: 'history', label: 'Review History (5)' },
                    { id: 'revisions', label: 'Revisions (6)' },
                    { id: 'comments', label: 'Collaboration (7)' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as 'files' | 'evaluation' | 'decision' | 'reviews' | 'suggestions' | 'history' | 'revisions' | 'comments')}
                      className={`px-1 py-4 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'text-[#008751] border-[#008751]'
                          : 'text-slate-600 border-transparent hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-scroll overflow-x-scroll p-8" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9', scrollbarGutter: 'stable' }}>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">{error}</div>}

              {/* DASHBOARD TABS CONTENT - Only show when on dashboard */}
              {sidebarSection === 'dashboard' && activeTab === 'files' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-sm font-black text-slate-900 mb-4">FILES FOR REVIEW ({details.files?.length || 0})</h3>
                  {details.files && details.files.length > 0 ? (
                    <div className="space-y-3">
                      {details.files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded hover:bg-emerald-50 transition">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-lg">📄</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-900">{file.file_name}</p>
                              <p className="text-xs text-slate-500">{file.file_size} • {formatDate(file.uploaded_at)}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {file.public_url && (
                              <>
                                <button
                                  onClick={() => setPreviewFile(file)}
                                  className="text-slate-600 hover:text-slate-900 p-2"
                                  title="View"
                                >
                                  👁️
                                </button>
                                <a href={file.public_url} download={file.file_name} className="text-slate-600 hover:text-slate-900 p-2" title="Download">📥</a>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">No files available.</div>
                  )}
                </div>
              )}

            {previewFile && (
              <FilePreviewModal
                isOpen={!!previewFile}
                onClose={() => setPreviewFile(null)}
                fileName={previewFile.file_name}
                fileType={previewFile.file_type}
                fileSize={previewFile.file_size}
                publicUrl={previewFile.public_url || undefined}
              />
            )}

            {sidebarSection === 'dashboard' && activeTab === 'evaluation' && (
              <EditorEvaluationFormTab
                assignmentId={assignment.id}
                manuscriptId={manuscript.id}
                assignment={assignment}
                suggestedReviewers={details.suggestedReviewers}
                onSubmitSuccess={onChanged}
              />
            )}

            {sidebarSection === 'dashboard' && activeTab === 'decision' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
                <h3 className="text-sm font-black text-slate-900">Editor Recommendation</h3>

                {!evaluationSubmitted ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
                    You must submit your evaluation (Editor Evaluation tab) before recommending a decision.
                  </div>
                ) : assignment.recommendation ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                    <p className="text-sm font-bold text-emerald-900">
                      Recommendation submitted: {assignment.recommendation.replace(/_/g, ' ')}
                    </p>
                    {assignment.recommendation_submitted_at && (
                      <p className="text-xs text-emerald-700 mt-1">{formatDate(assignment.recommendation_submitted_at)}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-3">Your recommendation is with the Coordinator for review.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-600">
                      Select one decision based on your evaluation and (if applicable) the reviewers' recommendations.
                    </p>
                    {decisionError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{decisionError}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { value: 'ACCEPT' as ReviewerRecommendation, label: 'Accept Submission', style: 'border-emerald-300 hover:bg-emerald-50 text-emerald-800' },
                        { value: 'MINOR_REVISION' as ReviewerRecommendation, label: 'Minor Revision', style: 'border-amber-300 hover:bg-amber-50 text-amber-800' },
                        { value: 'MAJOR_REVISION' as ReviewerRecommendation, label: 'Major Revision', style: 'border-orange-300 hover:bg-orange-50 text-orange-800' },
                        { value: 'REJECT' as ReviewerRecommendation, label: 'Reject', style: 'border-red-300 hover:bg-red-50 text-red-800' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={decisionBusy}
                          onClick={() => handleSubmitRecommendation(opt.value)}
                          className={`px-4 py-3 rounded-xl border-2 font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${opt.style}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {sidebarSection === 'dashboard' && activeTab === 'reviews' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">PEER REVIEWS ({reviewerAssignments?.length || 0})</h3>
                {reviewerAssignments && reviewerAssignments.length > 0 ? (
                  <div className="space-y-4">
                    {reviewerAssignments.map((ra) => (
                      <div key={ra.id} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {details.profiles.get(ra.reviewer_id)?.name || 'Unknown Reviewer'}
                            </p>
                            <p className="text-xs text-slate-600">{details.profiles.get(ra.reviewer_id)?.email}</p>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex text-xs font-bold px-2 py-1 rounded ${
                              ra.status === 'SUBMITTED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : ra.status === 'ACCEPTED'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {ra.status || 'Pending'}
                            </span>
                            {ra.submitted_at && (
                              <p className="text-xs text-slate-500 mt-1">{formatDate(ra.submitted_at)}</p>
                            )}
                          </div>
                        </div>

                        {ra.status === 'SUBMITTED' && (
                          <div className="bg-slate-50 rounded p-3 text-sm text-slate-700 space-y-2 mt-3">
                            <p><span className="font-semibold">Recommendation:</span> {ra.recommendation || 'N/A'}</p>
                            {ra.comments_to_editor && (
                              <p><span className="font-semibold">Comments:</span> {ra.comments_to_editor}</p>
                            )}
                          </div>
                        )}

                        {ra.status === 'ACCEPTED' && (
                          <p className="text-xs text-slate-500 italic mt-3">Awaiting review submission...</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-sm">No reviewers assigned yet. Reviewer assignment is handled by the Coordinator.</div>
                )}
              </div>
            )}

            {activeTab === 'suggestions' && (
              <div className="space-y-6">
                {/* Add Reviewer Suggestions Form */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Reviewer Suggestions (Optional)</h3>
                  <p className="text-xs text-slate-600 mb-4">Suggesting reviewers is optional -- you may submit your evaluation with none, one, or several.</p>

                  {showAddReviewerForm ? (
                    <div className="space-y-4 mb-4">
                      <input
                        type="text"
                        placeholder="Reviewer Name"
                        value={newReviewerForm.name}
                        onChange={(e) => setNewReviewerForm({ ...newReviewerForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input
                        type="email"
                        placeholder="Email Address"
                        value={newReviewerForm.email}
                        onChange={(e) => setNewReviewerForm({ ...newReviewerForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <textarea
                        placeholder="Optional Note"
                        value={newReviewerForm.note}
                        onChange={(e) => setNewReviewerForm({ ...newReviewerForm, note: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setNewReviewerForm({ name: '', email: '', note: '' });
                            setShowAddReviewerForm(false);
                          }}
                          className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (!newReviewerForm.name || !newReviewerForm.email) return;
                            setSavingReviewer(true);
                            setSaveReviewerError('');
                            try {
                              await addSuggestedReviewer(manuscript.id, newReviewerForm);
                              onChanged();
                              showNotification('success', 'Reviewer suggestion saved');
                              setNewReviewerForm({ name: '', email: '', note: '' });
                              setShowAddReviewerForm(false);
                            } catch (e: any) {
                              setSaveReviewerError(e.message || 'Failed to save reviewer suggestion');
                            } finally {
                              setSavingReviewer(false);
                            }
                          }}
                          disabled={!newReviewerForm.name || !newReviewerForm.email || savingReviewer}
                          className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                          {savingReviewer ? 'Saving...' : 'Add Reviewer'}
                        </button>
                      </div>
                      {saveReviewerError && (
                        <p className="text-xs text-red-600 mt-2">{saveReviewerError}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddReviewerForm(true)}
                      className="w-full border-2 border-dashed border-slate-300 rounded-lg py-3 text-slate-600 hover:text-slate-900 hover:border-slate-400 text-sm font-semibold transition"
                    >
                      + Add Another Reviewer
                    </button>
                  )}

                  <p className="text-xs text-slate-500 text-center mt-4">Suggestions are saved immediately -- this is optional, you may submit without any.</p>
                </div>

                {/* List of Suggested Reviewers */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-sm font-black text-slate-900 mb-4">REVIEWER SUGGESTIONS ({details.suggestedReviewers?.length || 0})</h3>
                  {details.suggestedReviewers && details.suggestedReviewers.length > 0 ? (
                    <div className="space-y-3">
                      {details.suggestedReviewers.map((reviewer) => {
                        const isAssigned = reviewerAssignments?.some(r => details.profiles.get(r.reviewer_id)?.email === reviewer.email);
                        return (
                          <div key={reviewer.id} className={`border rounded-lg p-4 ${isAssigned ? 'bg-emerald-50 border-emerald-200' : 'border-slate-200'}`}>
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-slate-900">{reviewer.name}</p>
                                <p className="text-xs text-slate-600">{reviewer.email}</p>
                                {reviewer.note && (
                                  <p className="text-xs text-slate-500 mt-1">Note: {reviewer.note}</p>
                                )}
                                <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  reviewer.suggested_by === 'EDITOR'
                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                    : 'bg-purple-50 text-purple-700 border border-purple-200'
                                }`}>
                                  Suggested by {reviewer.suggested_by === 'EDITOR' ? 'you' : 'author'}
                                </span>
                              </div>
                              {isAssigned && (
                                <span className="text-xs font-bold px-2 py-1 bg-emerald-100 text-emerald-700 rounded">✓ Assigned</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">No suggested reviewers yet.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'history' && (() => {
              const realHistory = (details.statusHistory || []).filter(item => item.from_status !== item.to_status);
              return (
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-sm font-black text-slate-900 mb-4">REVIEW HISTORY ({realHistory.length})</h3>
                  {realHistory.length > 0 ? (
                    <div className="space-y-4">
                      {realHistory.map((item, idx) => (
                        <div key={idx} className="border border-slate-200 rounded p-4">
                          <div className="flex items-start justify-between mb-2">
                            <p className="font-semibold text-slate-900">{item.to_status.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                          </div>
                          {item.note && <p className="text-sm text-slate-600">{item.note}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">No history available.</div>
                  )}
                </div>
              );
            })()}

            {sidebarSection === 'dashboard' && activeTab === 'revisions' && (
              <div className="space-y-6">
                <RevisionReview manuscriptId={manuscript.id} onStatusUpdate={onChanged} />
                <div>
                  <h3 className="text-sm font-black text-slate-900 mb-3">Revision History</h3>
                  <RevisionHistoryPanel manuscriptId={manuscript.id} profiles={Object.fromEntries(details.profiles)} />
                </div>
              </div>
            )}

            {sidebarSection === 'dashboard' && activeTab === 'comments' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black text-slate-900">DISCUSSION & COLLABORATION ({discussions?.length || 0})</h3>
                  <button
                    onClick={() => setShowInternalNotes(!showInternalNotes)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" /> {showInternalNotes ? 'Hide' : 'Show'} Internal Notes
                  </button>
                </div>

                {/* Discussion Chat */}
                <div className="mb-6 flex flex-col h-96">
                  <h4 className="text-xs font-bold text-slate-700 mb-4">TEAM DISCUSSIONS</h4>

                  {/* Chat Messages */}
                  <div className="flex-1 overflow-y-auto mb-4 space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
                    {discussions && discussions.length > 0 ? (
                      discussions.filter(d => !(d as any).is_internal).map((discussion, idx) => {
                        const isCurrentUser = discussion.sender_id === currentUser?.email;
                        return (
                          <div key={idx} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs px-4 py-2 rounded-lg ${
                              isCurrentUser
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-100 text-slate-900'
                            }`}>
                              <div className={`text-xs font-semibold mb-1 ${isCurrentUser ? 'text-emerald-100' : 'text-slate-600'}`}>
                                {details.profiles.get(discussion.sender_id)?.name || 'Unknown User'}
                              </div>
                              <p className="text-sm break-words">{discussion.message}</p>
                              <div className={`text-xs mt-1 ${isCurrentUser ? 'text-emerald-100' : 'text-slate-500'}`}>
                                {formatDateTime(discussion.created_at)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-500">
                        <p className="text-xs">No discussions yet. Start a discussion below.</p>
                      </div>
                    )}
                  </div>

                  {/* Message Input Form */}
                  <div className="flex gap-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none"
                      rows={2}
                    />
                    <button
                      onClick={handlePostComment}
                      disabled={busy || !newComment.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 rounded-lg transition self-end"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Internal Notes Section */}
                {showInternalNotes && (
                  <div className="pt-6 border-t border-slate-200">
                    <h4 className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                      EDITOR INTERNAL NOTES (Private)
                    </h4>
                    {discussions && discussions.filter(d => (d as any).is_internal).length > 0 ? (
                      <div className="space-y-3 mb-6 bg-amber-50 border border-amber-200 rounded p-4">
                        {discussions.filter(d => (d as any).is_internal).map((discussion, idx) => (
                          <div key={idx} className="border-b border-amber-200 pb-3 last:border-0">
                            <div className="flex items-start justify-between mb-1">
                              <p className="font-semibold text-amber-900 text-xs">
                                {details.profiles.get(discussion.sender_id)?.name || 'Unknown'}
                              </p>
                              <p className="text-xs text-amber-700">{formatDateTime(discussion.created_at)}</p>
                            </div>
                            <p className="text-xs text-amber-800">{discussion.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 mb-6">No internal notes yet.</p>
                    )}

                    {/* Post Internal Note Form */}
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      <textarea
                        value={newInternalNote}
                        onChange={(e) => setNewInternalNote(e.target.value)}
                        placeholder="Add a private internal note (visible only to editors)..."
                        className="w-full text-xs border border-amber-300 rounded px-3 py-2 mb-3 bg-white focus:outline-none focus:border-amber-500"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handlePostInternalNote}
                          disabled={busy || !newInternalNote.trim()}
                          className="flex-1 bg-amber-600 text-white text-xs font-bold py-2 rounded hover:bg-amber-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Save className="w-3 h-3 inline mr-1" />}
                          Post Internal Note
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CONTENT SECTION ITEMS - Only show when sidebar section is selected */}
            {sidebarSection === 'title_abstract' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">TITLE & ABSTRACT</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">TITLE</p>
                    <p className="text-sm text-slate-900">{details.manuscript?.title || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">ABSTRACT</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{details.manuscript?.abstract || 'No abstract provided'}</p>
                  </div>
                </div>
              </div>
            )}

            {sidebarSection === 'authors' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">AUTHORS / CONTRIBUTORS ({details.contributors?.length || 0})</h3>
                {details.contributors && details.contributors.length > 0 ? (
                  <div className="space-y-3">
                    {details.contributors.map((contributor, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4 hover:bg-slate-50">
                        <p className="font-semibold text-slate-900">{contributor.full_name}</p>
                        <p className="text-xs text-slate-600">{contributor.email}</p>
                        {contributor.institution && <p className="text-xs text-slate-600">{contributor.institution}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No contributors found.</p>
                )}
              </div>
            )}

            {sidebarSection === 'manuscript' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">MANUSCRIPT ({details.files?.filter(f => f.file_type?.toLowerCase().includes('manuscript')).length || 0})</h3>
                {details.files && details.files.filter(f => f.file_type?.toLowerCase().includes('manuscript')).length > 0 ? (
                  <div className="space-y-3">
                    {details.files.filter(f => f.file_type?.toLowerCase().includes('manuscript')).map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded hover:bg-emerald-50">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg">📄</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{file.file_name}</p>
                            <p className="text-xs text-slate-500">{file.file_size} • {formatDate(file.uploaded_at)}</p>
                          </div>
                        </div>
                        {file.public_url && (
                          <a href={file.public_url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 p-2">👁️</a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No manuscript files found.</p>
                )}
              </div>
            )}

            {sidebarSection === 'references' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">REFERENCES</h3>
                {details.manuscript?.references ? (
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{details.manuscript.references}</div>
                ) : (
                  <p className="text-slate-500 text-sm">No references provided.</p>
                )}
              </div>
            )}

            {sidebarSection === 'supplementary' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">SUPPLEMENTARY FILES ({details.files?.filter(f => f.file_type?.toLowerCase().includes('supplementary') || f.file_type?.toLowerCase().includes('additional')).length || 0})</h3>
                {details.files && details.files.filter(f => f.file_type?.toLowerCase().includes('supplementary') || f.file_type?.toLowerCase().includes('additional')).length > 0 ? (
                  <div className="space-y-3">
                    {details.files.filter(f => f.file_type?.toLowerCase().includes('supplementary') || f.file_type?.toLowerCase().includes('additional')).map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded hover:bg-emerald-50">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg">📎</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{file.file_name}</p>
                            <p className="text-xs text-slate-500">{file.file_size} • {formatDate(file.uploaded_at)}</p>
                          </div>
                        </div>
                        {file.public_url && (
                          <a href={file.public_url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 p-2">👁️</a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No supplementary files found.</p>
                )}
              </div>
            )}

            {sidebarSection === 'cover_letter' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">COVER LETTER</h3>
                {details.files && details.files.some(f => f.file_name?.toLowerCase().includes('cover')) ? (
                  <div className="space-y-3">
                    {details.files.filter(f => f.file_name?.toLowerCase().includes('cover')).map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded hover:bg-emerald-50">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg">📝</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{file.file_name}</p>
                            <p className="text-xs text-slate-500">{file.file_size} • {formatDate(file.uploaded_at)}</p>
                          </div>
                        </div>
                        {file.public_url && (
                          <a href={file.public_url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 p-2">👁️</a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No cover letter provided.</p>
                )}
              </div>
            )}

            {sidebarSection === 'discussions' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">DISCUSSIONS ({details.discussions?.length || 0})</h3>
                {details.discussions && details.discussions.length > 0 ? (
                  <div className="space-y-3">
                    {details.discussions.map((discussion, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4 hover:bg-slate-50">
                        <p className="font-semibold text-slate-900">{discussion.sender_id}</p>
                        <p className="text-sm text-slate-700 mt-2">{discussion.message}</p>
                        <p className="text-xs text-slate-500 mt-2">{formatDateTime(discussion.created_at)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No discussions yet.</p>
                )}
              </div>
            )}

            {sidebarSection === 'evaluation_timeline' && (() => {
              const realHistory = (details.statusHistory || []).filter(item => item.from_status !== item.to_status);
              return (
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-sm font-black text-slate-900 mb-4">EVALUATION TIMELINE ({realHistory.length})</h3>
                  {realHistory.length > 0 ? (
                    <div className="space-y-4">
                      {realHistory.map((item, idx) => (
                        <div key={idx} className="border border-slate-200 rounded p-4">
                          <div className="flex items-start justify-between mb-2">
                            <p className="font-semibold text-slate-900">{item.to_status.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                          </div>
                          {item.note && <p className="text-sm text-slate-600">{item.note}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">No timeline events yet.</div>
                  )}
                </div>
              );
            })()}

            {sidebarSection === 'editor_evaluation' && (
              <EditorEvaluationFormTab
                assignmentId={assignment.id}
                manuscriptId={manuscript.id}
                assignment={assignment}
                suggestedReviewers={details.suggestedReviewers}
                onSubmitSuccess={onChanged}
              />
            )}

            {sidebarSection === 'reviews' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">PEER REVIEWS ({reviewerAssignments?.length || 0})</h3>
                {reviewerAssignments && reviewerAssignments.length > 0 ? (
                  <div className="space-y-4">
                    {reviewerAssignments.map((ra) => (
                      <div key={ra.id} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {details.profiles.get(ra.reviewer_id)?.name || 'Unknown Reviewer'}
                            </p>
                            <p className="text-xs text-slate-600">{details.profiles.get(ra.reviewer_id)?.email}</p>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex text-xs font-bold px-2 py-1 rounded ${
                              ra.status === 'SUBMITTED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : ra.status === 'ACCEPTED'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {ra.status || 'Pending'}
                            </span>
                            {ra.submitted_at && (
                              <p className="text-xs text-slate-500 mt-1">{formatDate(ra.submitted_at)}</p>
                            )}
                          </div>
                        </div>

                        {ra.status === 'SUBMITTED' && (
                          <div className="bg-slate-50 rounded p-3 text-sm text-slate-700 space-y-2 mt-3">
                            <p><span className="font-semibold">Recommendation:</span> {ra.recommendation || 'N/A'}</p>
                            {ra.comments_to_editor && (
                              <p><span className="font-semibold">Comments:</span> {ra.comments_to_editor}</p>
                            )}
                          </div>
                        )}

                        {ra.status === 'ACCEPTED' && (
                          <p className="text-xs text-slate-500 italic mt-3">Awaiting review submission...</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-sm">No reviewers assigned yet. Reviewer assignment is handled by the Coordinator.</div>
                )}
              </div>
            )}

            {sidebarSection === 'decision' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
                <h3 className="text-sm font-black text-slate-900">Editor Recommendation</h3>

                {!evaluationSubmitted ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
                    You must submit your evaluation (Editor Evaluation tab) before recommending a decision.
                  </div>
                ) : assignment.recommendation ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                    <p className="text-sm font-bold text-emerald-900">
                      Recommendation submitted: {assignment.recommendation.replace(/_/g, ' ')}
                    </p>
                    {assignment.recommendation_submitted_at && (
                      <p className="text-xs text-emerald-700 mt-1">{formatDate(assignment.recommendation_submitted_at)}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-3">Your recommendation is with the Coordinator for review.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-600">
                      Select one decision based on your evaluation and (if applicable) the reviewers' recommendations.
                    </p>
                    {decisionError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{decisionError}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { value: 'ACCEPT' as ReviewerRecommendation, label: 'Accept Submission', style: 'border-emerald-300 hover:bg-emerald-50 text-emerald-800' },
                        { value: 'MINOR_REVISION' as ReviewerRecommendation, label: 'Minor Revision', style: 'border-amber-300 hover:bg-amber-50 text-amber-800' },
                        { value: 'MAJOR_REVISION' as ReviewerRecommendation, label: 'Major Revision', style: 'border-orange-300 hover:bg-orange-50 text-orange-800' },
                        { value: 'REJECT' as ReviewerRecommendation, label: 'Reject', style: 'border-red-300 hover:bg-red-50 text-red-800' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={decisionBusy}
                          onClick={() => handleSubmitRecommendation(opt.value)}
                          className={`px-4 py-3 rounded-xl border-2 font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${opt.style}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {sidebarSection === 'suggestions' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">SUGGESTIONS ({details.suggestedReviewers?.length || 0})</h3>
                {details.suggestedReviewers && details.suggestedReviewers.length > 0 ? (
                  <div className="space-y-3">
                    {details.suggestedReviewers.map((reviewer, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4">
                        <p className="font-semibold text-slate-900">{reviewer.name || 'N/A'}</p>
                        <p className="text-xs text-slate-600">{reviewer.email}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No suggested reviewers.</p>
                )}
              </div>
            )}

            {sidebarSection === 'review_history' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">REVIEW HISTORY ({details.revisions?.length || 0})</h3>
                {details.revisions && details.revisions.length > 0 ? (
                  <div className="space-y-3">
                    {details.revisions.map((revision, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4">
                        <p className="font-semibold text-slate-900">{revision.revision_number}</p>
                        <p className="text-xs text-slate-600">{formatDate(revision.created_at)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No revision history.</p>
                )}
              </div>
            )}

            {sidebarSection === 'metadata' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">METADATA</h3>
                <div className="space-y-3 text-sm">
                  <div><span className="font-semibold text-slate-900">Manuscript ID:</span> <span className="text-slate-700">{details.manuscript?.id}</span></div>
                  <div><span className="font-semibold text-slate-900">Status:</span> <span className="text-slate-700">{details.manuscript?.status}</span></div>
                  <div><span className="font-semibold text-slate-900">Submitted:</span> <span className="text-slate-700">{formatDate(details.manuscript?.created_at)}</span></div>
                  {details.manuscript?.published_at && (
                    <div><span className="font-semibold text-slate-900">Published:</span> <span className="text-slate-700">{formatDate(details.manuscript?.published_at)}</span></div>
                  )}
                </div>
              </div>
            )}

            {sidebarSection === 'production' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">PRODUCTION</h3>
                <div className="space-y-3 text-sm">
                  <p className="text-slate-700">{details.manuscript?.production_stage ? `Stage: ${details.manuscript.production_stage}` : 'Not in production'}</p>
                </div>
              </div>
            )}

            {sidebarSection === 'galley_files' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">GALLEY FILES ({details.files?.filter(f => f.file_type?.toLowerCase().includes('galley')).length || 0})</h3>
                {details.files && details.files.filter(f => f.file_type?.toLowerCase().includes('galley')).length > 0 ? (
                  <div className="space-y-3">
                    {details.files.filter(f => f.file_type?.toLowerCase().includes('galley')).map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded hover:bg-emerald-50">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg">📰</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{file.file_name}</p>
                            <p className="text-xs text-slate-500">{file.file_size} • {formatDate(file.uploaded_at)}</p>
                          </div>
                        </div>
                        {file.public_url && (
                          <a href={file.public_url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 p-2">👁️</a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No galley files found.</p>
                )}
              </div>
            )}

            {/* Dashboard Content - shown when sidebarSection is 'dashboard' */}
            {sidebarSection === 'dashboard' && (
              <div className="text-center py-8 text-slate-500">
                <p>Select a tab to view dashboard content</p>
              </div>
            )}
            </div>
          </div>

          {/* RIGHT SIDEBAR - EDITOR EVALUATION PANEL - FIXED */}
          <aside className="fixed right-0 top-14 w-80 bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden" style={{ right: '0', height: 'calc(100vh - 3.5rem)' }}>
            {/* SCROLLABLE CONTENT */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">

                {/* DECISION STATUS */}
                <div className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                    Decision Status
                  </h3>
                  {assignment.status === 'DECLINED' ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-xs font-semibold text-red-700 text-center">✕ Assignment Declined</p>
                    </div>
                  ) : evaluationSubmitted ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <p className="text-xs font-semibold text-emerald-700 text-center">✓ Evaluation Submitted</p>
                      <p className="text-xs text-emerald-600 text-center mt-1">Awaiting coordinator action</p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-xs font-semibold text-blue-700 text-center">In Progress</p>
                      <p className="text-xs text-blue-600 text-center mt-1">Complete your evaluation below</p>
                    </div>
                  )}
                </div>

                {/* EDITOR DECISION */}
                {evaluationSubmitted && assignment.recommendation && (
                  <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-1">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                      Editor Decision
                    </h3>
                    <p className="text-sm font-bold text-slate-900">{assignment.recommendation.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-500">Recommendation submitted</p>
                  </div>
                )}

                {/* REVIEW WORKFLOW */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900 mb-5">
                    Review Workflow
                  </h3>
                  {(() => {
                    const reviewersAssignedDone = !!(reviewerAssignments && reviewerAssignments.length > 0);
                    const reviewsCompletedCount = reviewerAssignments?.filter(r => r.status === 'SUBMITTED').length || 0;
                    const peerReviewDone = reviewersAssignedDone && reviewsCompletedCount === reviewerAssignments!.length;
                    const coordinatorActionDone = manuscript.status && !['DRAFT', 'SUBMITTED', 'EDITOR_REVIEW'].includes(manuscript.status);
                    const finalDecisionDone = manuscript.status && ['ACCEPTED', 'REJECTED', 'PUBLISHED'].includes(manuscript.status);
                    const steps = [
                      { label: 'Assignment accepted', done: assignment.status === 'ACCEPTED' || evaluationSubmitted },
                      { label: 'Editor evaluation', done: evaluationSubmitted },
                      { label: 'Coordinator action', done: !!coordinatorActionDone },
                      { label: 'Reviewer assignment', done: reviewersAssignedDone },
                      { label: 'Peer review', done: peerReviewDone },
                      { label: 'Final decision', done: !!finalDecisionDone },
                    ];
                    const currentIdx = steps.findIndex(s => !s.done);
                    return steps.map((step, idx) => {
                      const isCurrent = idx === currentIdx;
                      const isUpNext = idx === currentIdx + 1;
                      const statusLabel = step.done ? 'COMPLETED' : isCurrent ? 'IN PROGRESS' : isUpNext ? 'UP NEXT' : null;
                      return (
                        <div key={step.label} className={`relative flex gap-3.5 ${idx === steps.length - 1 ? '' : 'pb-7'}`}>
                          {idx !== steps.length - 1 && (
                            <div
                              className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${step.done ? 'bg-emerald-400' : 'bg-slate-200'}`}
                            />
                          )}
                          <div className="relative z-10 flex-shrink-0">
                            {step.done ? (
                              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                                <Check className="w-4 h-4 text-white" strokeWidth={3} />
                              </div>
                            ) : isCurrent ? (
                              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center ring-4 ring-blue-100 shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full border-2 border-slate-200 bg-white" />
                            )}
                          </div>
                          <div className="pt-1.5 min-w-0">
                            <p className={`text-[13px] leading-tight ${
                              step.done ? 'font-medium text-slate-800' : isCurrent ? 'font-bold text-slate-900' : 'font-medium text-slate-400'
                            }`}>
                              {step.label}
                            </p>
                            {statusLabel && (
                              <span className={`inline-block mt-1 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${
                                step.done
                                  ? 'text-emerald-700 bg-emerald-50'
                                  : isCurrent
                                  ? 'text-blue-700 bg-blue-50'
                                  : 'text-slate-500 bg-slate-100'
                              }`}>
                                {statusLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* REVIEWERS */}
                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                    Reviewers
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-500 uppercase">Assigned</span>
                    <span className="text-[13px] font-bold text-slate-900">{reviewerAssignments?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-500 uppercase">Completed</span>
                    <span className="text-[13px] font-bold text-slate-900">
                      {reviewerAssignments?.filter(r => r.status === 'SUBMITTED').length || 0} / {reviewerAssignments?.length || 0}
                    </span>
                  </div>
                </div>

              </div>
            </div>

          </aside>
        </div>
      </main>
    </div>
  );
}

function AcceptDeclineModal({
  details,
  onAccept,
  onDecline,
  isAcceptLoading,
  isDeclineLoading
}: {
  details: EditorManuscriptDetails;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
  isAcceptLoading?: boolean;
  isDeclineLoading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-800 text-white p-6 rounded-t-2xl shrink-0">
          <h2 className="text-2xl font-black">Editorial Assignment</h2>
          <p className="text-emerald-100 text-sm mt-1">You have been invited to evaluate a manuscript</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 overflow-y-auto">
          {/* Title */}
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-2">Title</p>
            <h3 className="font-bold text-slate-900 text-base leading-tight">{details.manuscript.title}</h3>
          </div>

          {/* Subtitle (section) */}
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-2">Subtitle</p>
            <p className="text-sm text-slate-700">{details.manuscript.section || 'Not provided'}</p>
          </div>

          {/* Abstract */}
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-2">Abstract</p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {details.manuscript.abstract || 'Not provided'}
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-3 pt-4">
            <button
              onClick={onAccept}
              disabled={isAcceptLoading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isAcceptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
              {isAcceptLoading ? 'Accepting...' : '✓ Accept Assignment'}
            </button>

            <button
              onClick={onDecline}
              disabled={isDeclineLoading}
              className="w-full border-2 border-red-600 text-red-600 py-3 rounded-lg font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isDeclineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XIcon className="w-5 h-5" />}
              {isDeclineLoading ? 'Declining...' : '✕ Decline Assignment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
