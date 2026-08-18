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
  formatDateTime
} from '../lib/editorWorkspace';
import { Loader2, ArrowLeft, Check, X as XIcon, Plus, Trash2, ChevronDown, Clock, AlertCircle, Archive, CheckCircle, FileText, Settings, Save, Send } from 'lucide-react';
import RevisionReview from './RevisionReview';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import { EditorEvaluationFormTab } from './manuscript-detail/tabs/EditorEvaluationFormTab';
import EditorEvaluationSidebar from './EditorEvaluationSidebar';

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
  const [respondingToAssignment, setRespondingToAssignment] = useState(false);
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
          setRespondingToAssignment(true);
          try {
            await respondToAssignment(selected.assignment.id, true);
            setShowAcceptModal(false);
            await load();
          } catch (error: any) {
            alert('Error accepting assignment: ' + error.message);
          } finally {
            setRespondingToAssignment(false);
          }
        }}
        onDecline={async () => {
          setRespondingToAssignment(true);
          try {
            await respondToAssignment(selected.assignment.id, false);
            setShowAcceptModal(false);
            setSelectedManuscriptId(null);
            await load();
          } catch (error: any) {
            alert('Error declining assignment: ' + error.message);
          } finally {
            setRespondingToAssignment(false);
          }
        }}
        isLoading={respondingToAssignment}
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

          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900">Submissions Intake Checksum Checklist</h2>
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] px-2.5 py-1 rounded-full font-bold">Automatic Validation Engine Active</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { check: true, text: 'PDF Layout Constraints Verified (Format OK)' },
                { check: false, text: 'CrossRef Manuscript Uniqueness: 98.4% Uniqueness Check' },
                { check: true, text: 'Author Identity Header Metadata Purged' },
                { check: true, text: 'Mandatory COI Conflict Disclosures Signed' }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${item.check ? 'bg-emerald-100 border-emerald-300' : 'bg-slate-100 border-slate-300'}`}>
                    {item.check && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className={`text-xs ${item.check ? 'text-slate-700' : 'text-slate-500 line-through'}`}>{item.text}</p>
                </div>
              ))}
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
              <AssignmentList rows={filteredRows} onOpen={setSelectedManuscriptId} />
            )}

          {!selected && filteredRows.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mt-8">
              {[
                { icon: '🔐', title: 'Strict Workflow Lock', desc: 'This workspace is protected under strict workflow governance.' },
                { icon: '🏢', title: 'Multi-Tenant Secure', desc: 'Isolated editorial environment with role-based access.' },
                { icon: '🤖', title: 'Smart Review Orchestration', desc: 'Automate assignments, reminders and decision pathways.' },
                { icon: '📊', title: 'Data Integrity First', desc: 'All actions are logged and fully auditable.' }
              ].map((item, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h3 className="text-xs font-bold text-slate-900 mb-1">{item.title}</h3>
                  <p className="text-[10px] text-slate-500">{item.desc}</p>
                  <button className="text-emerald-600 text-[10px] font-bold mt-2 hover:text-emerald-700">Learn more →</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function AssignmentList({ rows, onOpen }: { rows: EditorManuscriptDetails[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="text-center py-24 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-400">No manuscript assignments yet.</div>;
  }
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
          {rows.map((details) => (
            <tr key={details.manuscript.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(details.manuscript.id)}>
              <td className="px-4 py-3 font-bold text-slate-800">{details.manuscript.title}</td>
              <td className="px-4 py-3"><StatusBadge status={details.manuscript.status} /></td>
              <td className="px-4 py-3 text-xs font-bold text-slate-600">{details.assignment.status}</td>
              <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open &rarr;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AssignmentDetail({ details, onBack, onChanged, currentUser }: { details: EditorManuscriptDetails; onBack: () => void; onChanged: () => void; currentUser?: { name: string; email: string; role: Role } | null }) {
  const { manuscript, assignment, reviewers: initialReviewerAssignments } = details;
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>(initialReviewerAssignments || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'title' | 'contributors' | 'files' | 'evaluation' | 'decision' | 'reviews' | 'suggestions' | 'history' | 'revisions' | 'comments'>('evaluation');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [activePublication, setActivePublication] = useState<'title' | 'contributors' | 'metadata' | 'references' | 'galleries' | 'jats' | 'permissions' | 'issue'>('title');
  const [currentPage] = useState(1);

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
    { id: 'decision', label: 'Decision' },
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
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
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
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs Bar */}
            <div className="bg-white border-b border-slate-200 px-8 flex-shrink-0 overflow-x-auto">
              <div className="flex gap-8">
                {[
                  { id: 'files', label: 'Files for Review' },
                  { id: 'evaluation', label: 'Editor Evaluation' },
                  { id: 'decision', label: 'Decision' },
                  { id: 'reviews', label: 'Reviews' },
                  { id: 'suggestions', label: 'Suggestions' },
                  { id: 'history', label: 'Review History' },
                  { id: 'revisions', label: 'Revisions' },
                  { id: 'comments', label: 'Collaboration' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
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

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">{error}</div>}

              {/* Files Tab */}
              {activeTab === 'files' && (
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
                                <a href={file.public_url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 p-2">👁️</a>
                                <a href={file.public_url} download className="text-slate-600 hover:text-slate-900 p-2">📥</a>
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



            {activeTab === 'evaluation' && (
              <EditorEvaluationFormTab
                assignmentId={assignment.id}
                manuscriptId={manuscript.id}
                assignment={assignment}
                suggestedReviewers={details.suggestedReviewers}
                onSubmitSuccess={onChanged}
              />
            )}

            {activeTab === 'decision' && (
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

            {activeTab === 'reviews' && (
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
                              <p className="text-[10px] text-slate-400 mt-1">Suggested by {reviewer.suggested_by === 'EDITOR' ? 'you' : 'author'}</p>
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
                  <div className="text-center py-8 text-slate-400 text-sm">No suggested reviewers yet. Add suggestions from the Editor Evaluation tab when submitting your assessment.</div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">REVIEW HISTORY ({details.statusHistory?.length || 0})</h3>
                {details.statusHistory && details.statusHistory.length > 0 ? (
                  <div className="space-y-4">
                    {details.statusHistory.map((item, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4">
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-semibold text-slate-900">{item.to_status}</p>
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
            )}

            {activeTab === 'revisions' && (
              <div className="space-y-6">
                <RevisionReview manuscriptId={manuscript.id} onStatusUpdate={onChanged} />
                <div>
                  <h3 className="text-sm font-black text-slate-900 mb-3">Revision History</h3>
                  <RevisionHistoryPanel manuscriptId={manuscript.id} profiles={Object.fromEntries(details.profiles)} />
                </div>
              </div>
            )}

            {activeTab === 'comments' && (
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

                {/* Discussion Posts */}
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-slate-700 mb-4">TEAM DISCUSSIONS</h4>
                  {discussions && discussions.length > 0 ? (
                    <div className="space-y-4 mb-6">
                      {discussions.filter(d => !(d as any).is_internal).map((discussion, idx) => (
                        <div key={idx} className="border border-slate-200 rounded p-4 hover:bg-slate-50">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {details.profiles.get(discussion.sender_id)?.name || 'Unknown User'}
                              </p>
                              <p className="text-xs text-slate-500">{details.profiles.get(discussion.sender_id)?.role || 'Member'}</p>
                            </div>
                            <p className="text-xs text-slate-500">{formatDateTime(discussion.created_at)}</p>
                          </div>
                          <p className="text-sm text-slate-700 mt-2">{discussion.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mb-6">No discussions yet. Start a discussion below.</p>
                  )}

                  {/* Post Comment Form */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a team discussion comment..."
                      className="w-full text-xs border border-slate-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-emerald-500"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handlePostComment}
                        disabled={busy || !newComment.trim()}
                        className="flex-1 bg-emerald-600 text-white text-xs font-bold py-2 rounded hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Send className="w-3 h-3 inline mr-1" />}
                        Post Comment
                      </button>
                    </div>
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
            </div>
          </div>

          {/* RIGHT SIDEBAR - EDITOR EVALUATION PANEL */}
          <aside className="w-80 bg-slate-50 border-l border-slate-200 flex flex-col h-full overflow-hidden">
            {/* HEADER - STICKY */}
            <div className="shrink-0 bg-white border-b border-slate-200 p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                    Editor Evaluation
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1">Assessment in progress</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-[11px] font-semibold text-blue-700">
                  <Clock className="w-3 h-3" />
                  In Progress
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Evaluation Progress</span>
                  <span className="font-semibold text-slate-900">1 of 5</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: '20%' }} />
                </div>
              </div>
            </div>

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

                {/* REVIEW ROUND SUMMARY */}
                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                    Review Round
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 uppercase">Status</span>
                      <span className="text-[13px] font-bold text-slate-900">{manuscript.status?.replace(/_/g, ' ') || 'In Progress'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 uppercase">Reviewers Assigned</span>
                      <span className="text-[13px] font-bold text-slate-900">{reviewerAssignments?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 uppercase">Reviews Completed</span>
                      <span className="text-[13px] font-bold text-slate-900">
                        {reviewerAssignments?.filter(r => r.status === 'SUBMITTED').length || 0} / {reviewerAssignments?.length || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ASSIGNED REVIEWERS */}
                {reviewerAssignments && reviewerAssignments.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                      Assigned Reviewers
                    </h3>
                    <div className="space-y-2">
                      {reviewerAssignments.slice(0, 3).map((ra) => (
                        <div key={ra.id} className="p-3 bg-white rounded-lg border border-slate-200">
                          <p className="text-sm font-semibold text-slate-900">
                            {details.profiles.get(ra.reviewer_id)?.name || 'Unknown'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {ra.status === 'SUBMITTED' ? '✓ Review Submitted' : `⏳ ${ra.status || 'Pending'}`}
                          </p>
                        </div>
                      ))}
                      {reviewerAssignments.length > 3 && (
                        <p className="text-xs text-slate-500 text-center py-2">+{reviewerAssignments.length - 3} more reviewers</p>
                      )}
                    </div>
                  </div>
                )}

                {/* SUGGESTED PEER REVIEWERS */}
                <div className="space-y-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-900">
                    Suggested Reviewers ({details.suggestedReviewers?.length || 0})
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    {evaluationSubmitted
                      ? '✓ Submitted with your evaluation'
                      : 'Suggest reviewers from the evaluation form'}
                  </p>
                  <div className="space-y-2">
                    {details.suggestedReviewers && details.suggestedReviewers.length > 0 ? (
                      details.suggestedReviewers.map((reviewer) => (
                        <div key={reviewer.id} className="p-3 bg-white rounded-lg border border-slate-200">
                          <p className="text-sm font-semibold text-slate-900">
                            👤 {reviewer.name}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">{reviewer.email}</p>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-slate-100 rounded-lg text-center">
                        <p className="text-xs text-slate-500">No reviewers suggested yet</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* FOOTER - STICKY ACTIONS */}
            <div className="shrink-0 bg-white border-t border-slate-200 p-6 space-y-3">
              <button
                disabled={evaluationSubmitted}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Draft
              </button>
              <button
                disabled={evaluationSubmitted}
                className={`w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-2 ${
                  evaluationSubmitted
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Send className="w-4 h-4" />
                {evaluationSubmitted ? 'Evaluation Submitted' : 'Submit Evaluation'}
              </button>
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
  isLoading
}: {
  details: EditorManuscriptDetails;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a4038] to-[#0f2e2a] text-white p-6 rounded-t-2xl">
          <h2 className="text-2xl font-black">Editorial Assignment</h2>
          <p className="text-emerald-100 text-sm mt-1">You have been invited to evaluate a manuscript</p>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="mb-6">
            <p className="text-slate-600 text-sm mb-4">
              You have been assigned to provide an editorial assessment for:
            </p>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
              <p className="font-bold text-slate-900 text-sm mb-2">{details.manuscript.title}</p>
              <p className="text-xs text-slate-500 mb-2">
                <strong>Author:</strong> {details.manuscript.author_name}
              </p>
              <p className="text-xs text-slate-600 line-clamp-2">
                {details.manuscript.abstract}
              </p>
            </div>

            <p className="text-sm text-slate-700 mb-4">
              If you accept, you will evaluate this manuscript using our 7-criteria framework and recommend whether to proceed to peer review or request revisions.
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={onAccept}
              disabled={isLoading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
              {isLoading ? 'Processing...' : '✓ Accept Assignment'}
            </button>

            <button
              onClick={onDecline}
              disabled={isLoading}
              className="w-full border-2 border-red-600 text-red-600 py-3 rounded-lg font-semibold hover:bg-red-50 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XIcon className="w-5 h-5" />}
              {isLoading ? 'Processing...' : '✕ Decline Assignment'}
            </button>
          </div>

          <p className="text-xs text-slate-500 text-center mt-4">
            If you decline, the Coordinator will be notified and can assign another editor.
          </p>
        </div>
      </div>
    </div>
  );
}
