import { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, DiscussionRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getRevisions, subscribeToManuscripts,
  respondToEditorAssignment, submitEditorAssessment, submitEditorRecommendation, publishDecision,
  getManuscript, getContributors, getDiscussions, getReviewerNeedingReplacement, getPendingEditorSuggestions
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { getManuscriptStatusLabel, getLatestRevision, getRevisionMeta, STANDARD_STATUS_COLORS } from '../lib/manuscriptStatusLabel';
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
import { Loader2, ArrowLeft, ArrowRight, Check, X as XIcon, Plus, Trash2, ChevronDown, Clock, AlertCircle, Archive, CheckCircle, FileText, Settings, Save, Send } from 'lucide-react';
import RevisionReview from './RevisionReview';
import RevisionHistoryPanel from './RevisionHistoryPanel';
import { EditorEvaluationFormTab } from './manuscript-detail/tabs/EditorEvaluationFormTab';
import { EditorReviewerSelection } from './EditorReviewerSelection';
import { ReviewerReplacementAlert } from './ReviewerReplacementAlert';
import EditorEvaluationSidebar from './EditorEvaluationSidebar';
import FilePreviewModal from './FilePreviewModal';
import EditorRevisionReview from './EditorRevisionReview';

const PEER_REVIEW_QUESTION_LABELS: Record<string, string> = {
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

function StatusBadge({ manuscript, latestRevision }: { manuscript: ManuscriptRow; latestRevision?: RevisionRow | null }) {
  const label = getManuscriptStatusLabel(manuscript, latestRevision);
  const revisionMeta = getRevisionMeta(latestRevision);
  const style = STANDARD_STATUS_COLORS[label as keyof typeof STANDARD_STATUS_COLORS] || STANDARD_STATUS_COLORS.DRAFT;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${style}`}>
        {label}
      </span>
      {revisionMeta && (
        <span className="inline-flex items-center px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
          Rev {revisionMeta.revisionNumber}{revisionMeta.revisionType ? ` — ${revisionMeta.revisionType}` : ''}
        </span>
      )}
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

  // Dashboard-wide replacement alerts -- surfaced the moment the Editor logs
  // in and lands on this list, not only after they open a specific
  // manuscript. One stacked widget per manuscript that actually needs a
  // replacement (usually zero or one).
  const rowsNeedingReplacement = rows
    .map(r => {
      const currentRound = r.reviewers.length > 0 ? Math.max(...r.reviewers.map(a => a.revision_number ?? 0)) : 0;
      const pendingCount = getPendingEditorSuggestions(r.suggestedReviewers, r.editorReviewerActions, currentRound).length;
      return { row: r, pendingCount };
    })
    .filter(({ row, pendingCount }) => !!getReviewerNeedingReplacement(row.reviewers, row.manuscript.status, pendingCount));

  return (
    <div className="w-full h-screen bg-slate-50 flex font-sans overflow-hidden">
      {rowsNeedingReplacement.map(({ row: r, pendingCount }, idx) => (
        <ReviewerReplacementAlert
          key={r.manuscript.id}
          manuscriptId={r.manuscript.id}
          manuscriptTitle={r.manuscript.title}
          manuscriptStatus={r.manuscript.status}
          reviewerAssignments={r.reviewers}
          pendingReplacementCount={pendingCount}
          onReplacementSelected={load}
          onOpenManuscript={() => setSelectedManuscriptId(r.manuscript.id)}
          stackIndex={idx}
        />
      ))}

      <aside className="w-80 bg-[#00170f] text-white flex flex-col shrink-0 border-r border-[#002116]">
        <div className="p-4 shrink-0">
          <div className="rounded-3xl border border-[#00311f] bg-[#001d14] p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#008751]/15 border border-[#008751]/30 flex items-center justify-center shrink-0">
                <Settings className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-black text-sm text-white">{currentUser?.name || 'Editor'}</h3>
                <p className="text-xs text-emerald-300 font-bold uppercase tracking-wide">Managing Editor</p>
              </div>
            </div>
            <div className="border-t border-white/10 pt-3">
              <p className="text-emerald-100/60 text-[11px] uppercase tracking-wider font-semibold">Core Jurisdiction:</p>
              <p className="text-emerald-300 font-bold mt-1">Unrestricted</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 pt-0 space-y-3 overflow-y-auto">
          <div className="border border-white/10 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('submissions')}
              className="w-full bg-white/5 hover:bg-white/10 px-4 py-3 flex items-center justify-between text-xs font-bold text-emerald-300 uppercase tracking-wider transition"
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Submissions
              </span>
              <ChevronDown className={`w-4 h-4 transition ${expandedSections.submissions ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.submissions && (
              <div className="p-1.5 space-y-1">
                {(['active-submissions', 'needs-editor', 'in-submission-stage'] as const).map((id) => {
                  const isActive = sectionFilter === id;
                  const count = rows.filter(SECTION_FILTERS[id].predicate).length;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSectionFilter(isActive ? null : id); setSelectedManuscriptId(null); }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition flex items-center justify-between cursor-pointer ${
                        isActive ? 'bg-[#008751] text-white font-black' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span>{SECTION_FILTERS[id].label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-emerald-200'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-white/10 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('reviewStages')}
              className="w-full bg-white/5 hover:bg-white/10 px-4 py-3 flex items-center justify-between text-xs font-bold text-emerald-300 uppercase tracking-wider transition"
            >
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Review Stages
              </span>
              <ChevronDown className={`w-4 h-4 transition ${expandedSections.reviewStages ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.reviewStages && (
              <div className="p-1.5 space-y-1">
                {(['awaiting-reviews', 'reviews-submitted', 'reviews-overdue', 'revisions-submitted', 'in-review-stage'] as const).map((id) => {
                  const isActive = sectionFilter === id;
                  const count = rows.filter(SECTION_FILTERS[id].predicate).length;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSectionFilter(isActive ? null : id); setSelectedManuscriptId(null); }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition flex items-center justify-between cursor-pointer ${
                        isActive ? 'bg-[#008751] text-white font-black' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span>{SECTION_FILTERS[id].label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-emerald-200'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-white/10 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('copyedit')}
              className="w-full bg-white/5 hover:bg-white/10 px-4 py-3 flex items-center justify-between text-xs font-bold text-emerald-300 uppercase tracking-wider transition"
            >
              <span className="flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Copyedit & Production
              </span>
              <ChevronDown className={`w-4 h-4 transition ${expandedSections.copyedit ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.copyedit && (
              <div className="p-1.5 space-y-1">
                {(['copyediting-stage', 'in-production-stage', 'scheduled-articles', 'published-articles', 'declined-rejected'] as const).map((id) => {
                  const isActive = sectionFilter === id;
                  const count = rows.filter(SECTION_FILTERS[id].predicate).length;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSectionFilter(isActive ? null : id); setSelectedManuscriptId(null); }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition flex items-center justify-between cursor-pointer ${
                        isActive ? 'bg-[#008751] text-white font-black' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span>{SECTION_FILTERS[id].label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-emerald-200'}`}>{count}</span>
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
          {paginatedRows.map((details) => {
            const latestRevision = getLatestRevision(details.revisions);
            const isRevisionSubmitted = latestRevision?.status === 'UNDER_REVIEW';
            return (
              <tr key={details.manuscript.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(details.manuscript.id)}>
                <td className="px-4 py-3 font-bold text-slate-800">{details.manuscript.title}</td>
                <td className="px-4 py-3"><StatusBadge manuscript={details.manuscript} latestRevision={latestRevision} /></td>
                <td className="px-4 py-3 text-xs font-bold text-slate-600">{details.assignment.status}</td>
                <td className={`px-4 py-3 text-right font-bold text-xs ${isRevisionSubmitted ? 'text-indigo-600' : 'text-[#008751]'}`}>
                  {isRevisionSubmitted ? 'Review Revision →' : 'Open →'}
                </td>
              </tr>
            );
          })}
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
  // True for one render after confirming "Move to Next Stage" on a
  // resubmitted revision -- shows a short transition banner on the
  // reviewer-selection screen so the jump there doesn't feel abrupt.
  const [justMovedToNextStage, setJustMovedToNextStage] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [editorComments, setEditorComments] = useState('');
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

  // Once the Coordinator forwards a resubmitted revision (manuscript_revisions
  // .status = 'UNDER_REVIEW'), show the dedicated revision-review page instead
  // of the regular tabbed manuscript view -- see EditorRevisionReview.tsx.
  // Only for EDITOR_SCREENING-origin revisions, though: a PEER_REVIEW-origin
  // revision at UNDER_REVIEW means Reviewers are re-reviewing it (Phase 2
  // Checkpoint C), not the Editor -- the Editor shouldn't see a "decide now"
  // page until those re-reviews are actually in.
  const latestRevisionForReview = getLatestRevision(details.revisions);
  const isRevisionReviewPage = latestRevisionForReview?.status === 'UNDER_REVIEW' && latestRevisionForReview?.origin !== 'PEER_REVIEW';

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
      await submitRecommendation(manuscript.id, recommendation, editorComments.trim() || undefined);
      setEditorComments('');
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

  if (isRevisionReviewPage) {
    return (
      <div className="w-full h-full flex flex-col bg-white overflow-hidden">
        <div className="shrink-0 sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-4">
          <button
            onClick={onBack}
            className="text-slate-600 hover:text-slate-900 flex items-center gap-1 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <EditorRevisionReview
            manuscriptTitle={manuscript.title || 'Manuscript'}
            manuscriptId={manuscript.id}
            revisions={details.revisions || []}
            onSubmitSuccess={onChanged}
            onMoveToNextStage={() => {
              onChanged();
              setJustMovedToNextStage(true);
              setSidebarSection('dashboard');
              setActiveTab('suggestions');
            }}
          />
        </div>
      </div>
    );
  }

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

      <ReviewerReplacementAlert
        manuscriptId={manuscript.id}
        manuscriptTitle={manuscript.title}
        manuscriptStatus={manuscript.status}
        reviewerAssignments={reviewerAssignments}
        pendingReplacementCount={getPendingEditorSuggestions(
          details.suggestedReviewers || [], details.editorReviewerActions || [],
          reviewerAssignments.length > 0 ? Math.max(...reviewerAssignments.map(a => a.revision_number ?? 0)) : 0
        ).length}
        onReplacementSelected={onChanged}
        defaultLeftPx={344}
      />

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
              {sidebarSection === 'dashboard' && activeTab === 'files' && (() => {
                const allFiles = details.files || [];
                const originalFiles = allFiles.filter(f => !f.revision_id);
                const sortedRevisions = [...(details.revisions || [])].sort((a, b) => a.revision_number - b.revision_number);

                const renderFileList = (files: typeof allFiles) => (
                  <div className="space-y-3">
                    {files.map((file) => (
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
                );

                return (
                  <div className="space-y-6">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6">
                      <h3 className="text-sm font-black text-slate-900 mb-4">ORIGINAL SUBMISSION FILES ({originalFiles.length})</h3>
                      {originalFiles.length > 0 ? renderFileList(originalFiles) : (
                        <div className="text-center py-8 text-slate-400 text-sm">No original submission files.</div>
                      )}
                    </div>
                    {sortedRevisions.map((rev) => {
                      const revFiles = allFiles.filter(f => f.revision_id === rev.id);
                      return (
                        <div key={rev.id} className="bg-white border border-slate-200 rounded-2xl p-6">
                          <h3 className="text-sm font-black text-slate-900 mb-4">REVISION {rev.revision_number} — UPLOADED FILES ({revFiles.length})</h3>
                          {revFiles.length > 0 ? renderFileList(revFiles) : (
                            <div className="text-center py-8 text-slate-400 text-sm">No files uploaded for this revision yet.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

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
                revisions={details.revisions || []}
                onSubmitSuccess={onChanged}
              />
            )}

            {sidebarSection === 'dashboard' && activeTab === 'decision' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
                {(() => {
                  const latestRevision = getLatestRevision(details.revisions);
                  const isRevisionDecision = latestRevision?.status === 'UNDER_REVIEW';
                  const nextRevisionNumber = (latestRevision?.revision_number || 0) + 1;

                  // Peer-review round: reviews already pushed the manuscript to
                  // AWAITING_DECISION and at least one reviewer was ever
                  // assigned -- the screening round's own AWAITING_DECISION
                  // (reject/revision) always has zero reviewer_assignments,
                  // since reviewers aren't selected until screening ACCEPTs.
                  // Declined rows don't block completion -- only the
                  // non-declined ones need to have actually submitted (a
                  // pre-existing gap: a stale DECLINED row would otherwise
                  // permanently block this from ever being "ready").
                  const activeReviews = (reviewerAssignments || []).filter(r => r.status !== 'DECLINED');
                  const hasRequiredReviews = activeReviews.length > 0 && activeReviews.every(r => r.status === 'SUBMITTED');
                  const isPeerReviewRound = !isRevisionDecision && manuscript.status === 'AWAITING_DECISION' && (reviewerAssignments?.length || 0) > 0;
                  const latestReviewSubmittedAt = activeReviews.reduce<string | null>((latest, r) => (
                    r.submitted_at && (!latest || r.submitted_at > latest) ? r.submitted_at : latest
                  ), null);

                  // A recommendation only counts as "already decided" if it was
                  // submitted after the thing it's deciding on -- otherwise
                  // it's a stale leftover from an earlier round (recommendation
                  // isn't reset per-round, only assessment_status is) and the
                  // editor still needs to decide on *this* round.
                  const recommendationIsCurrent = !!assignment.recommendation && !!assignment.recommendation_submitted_at && (
                    isRevisionDecision
                      ? new Date(assignment.recommendation_submitted_at) > new Date(latestRevision!.requested_at)
                      : isPeerReviewRound
                      ? (!!latestReviewSubmittedAt && new Date(assignment.recommendation_submitted_at) > new Date(latestReviewSubmittedAt))
                      : true
                  );

                  return (
                    <>
                      <h3 className="text-sm font-black text-slate-900">
                        {isRevisionDecision ? `Editor Decision — Revision ${latestRevision!.revision_number}` : isPeerReviewRound ? 'Peer Review Decision' : 'Editor Recommendation'}
                      </h3>

                      {(assignment.strengths || assignment.weaknesses || assignment.mandatory_revisions || assignment.comments_to_coordinator) && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Your Evaluation Comments</p>
                          {assignment.strengths && <p><span className="font-bold text-slate-700">Strengths:</span> <span className="text-slate-600">{assignment.strengths}</span></p>}
                          {assignment.weaknesses && <p><span className="font-bold text-slate-700">Weaknesses:</span> <span className="text-slate-600">{assignment.weaknesses}</span></p>}
                          {assignment.mandatory_revisions && <p><span className="font-bold text-slate-700">Mandatory Revisions:</span> <span className="text-slate-600">{assignment.mandatory_revisions}</span></p>}
                          {assignment.comments_to_coordinator && <p><span className="font-bold text-slate-700">Comments to Coordinator:</span> <span className="text-slate-600">{assignment.comments_to_coordinator}</span></p>}
                        </div>
                      )}

                      {!evaluationSubmitted ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
                          You must submit your evaluation (Editor Evaluation tab) before recommending a decision.
                        </div>
                      ) : isPeerReviewRound && !hasRequiredReviews ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-800">
                          Waiting for all peer reviews to be submitted before you can make the final decision.
                        </div>
                      ) : isPeerReviewRound && hasRequiredReviews && !manuscript.reviews_released_at ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-800">
                          All reviews are in, but the Coordinator hasn't sent them to you yet.
                        </div>
                      ) : recommendationIsCurrent ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                          <p className="text-sm font-bold text-emerald-900">
                            Recommendation submitted: {assignment.recommendation!.replace(/_/g, ' ')}
                          </p>
                          {assignment.recommendation_submitted_at && (
                            <p className="text-xs text-emerald-700 mt-1">{formatDate(assignment.recommendation_submitted_at)}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-3">Your recommendation is with the Coordinator for review.</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-slate-600">
                            {isRevisionDecision
                              ? `Accept sends Revision ${latestRevision!.revision_number} straight to the Coordinator's decision. Requesting a revision opens Revision ${nextRevisionNumber}.`
                              : isPeerReviewRound
                              ? "Review both peer reports (Reviews tab) and select your decision. This is separate from the reviewers' own recommendations -- you have the final say."
                              : "Select one decision based on your evaluation and (if applicable) the reviewers' recommendations."}
                          </p>
                          {isPeerReviewRound && (
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1.5">Editor Comments (optional)</label>
                              <textarea
                                value={editorComments}
                                onChange={(e) => setEditorComments(e.target.value)}
                                disabled={decisionBusy}
                                rows={3}
                                placeholder="Additional comments or instructions..."
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          )}
                          {decisionError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{decisionError}</div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                              { value: 'ACCEPT' as ReviewerRecommendation, label: isRevisionDecision ? 'Accept & Send to Decision' : 'Accept Submission', style: 'border-emerald-300 hover:bg-emerald-50 text-emerald-800' },
                              { value: 'MINOR_REVISION' as ReviewerRecommendation, label: isRevisionDecision ? `Request Revision ${nextRevisionNumber} (Minor)` : 'Minor Revision', style: 'border-amber-300 hover:bg-amber-50 text-amber-800' },
                              { value: 'MAJOR_REVISION' as ReviewerRecommendation, label: isRevisionDecision ? `Request Revision ${nextRevisionNumber} (Major)` : 'Major Revision', style: 'border-orange-300 hover:bg-orange-50 text-orange-800' },
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
                    </>
                  );
                })()}
              </div>
            )}

            {sidebarSection === 'dashboard' && activeTab === 'reviews' && (() => {
              const pendingReplacements = getPendingEditorSuggestions(details.suggestedReviewers || [], details.editorReviewerActions || []);
              const totalCount = (reviewerAssignments?.length || 0) + pendingReplacements.length;
              return (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">PEER REVIEWS ({totalCount})</h3>
                {totalCount > 0 ? (
                  <div className="space-y-4">
                    {reviewerAssignments?.map((ra) => (
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
                          <div className="mt-3 space-y-3">
                            <p className="text-sm text-slate-700"><span className="font-semibold">Recommendation:</span> {ra.recommendation?.replace(/_/g, ' ') || 'N/A'}</p>

                            {(ra.screening_responses?.length ?? 0) > 0 && (
                              <div className="space-y-1.5">
                                {ra.screening_responses.map((r, qIdx) => (
                                  <div key={r.question_id} className="border border-slate-200 rounded p-2.5 bg-slate-50">
                                    <div className="flex items-center justify-between mb-1">
                                      <p className="text-xs font-bold text-slate-800">{qIdx + 1}. {PEER_REVIEW_QUESTION_LABELS[r.question_id] || r.question_id}</p>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.answer ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        {r.answer ? 'Yes' : 'No'}
                                      </span>
                                    </div>
                                    {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                                  </div>
                                ))}
                              </div>
                            )}

                            {ra.comments_to_author && (
                              <div className="bg-slate-50 rounded p-3 text-sm text-slate-700">
                                <p className="font-semibold text-xs uppercase tracking-wide text-slate-500 mb-1">Comments to Author</p>
                                {ra.comments_to_author}
                              </div>
                            )}
                            {ra.comments_to_editor && (
                              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-slate-700">
                                <p className="font-semibold text-xs uppercase tracking-wide text-blue-700 mb-1">Confidential Comments to Editor</p>
                                {ra.comments_to_editor}
                              </div>
                            )}
                          </div>
                        )}

                        {ra.status === 'ACCEPTED' && (
                          <p className="text-xs text-slate-500 italic mt-3">Awaiting review submission...</p>
                        )}
                      </div>
                    ))}

                    {/* Replacement reviewers the Editor has selected but the
                        Coordinator hasn't invited yet -- see
                        ReviewerReplacementAlert.tsx / editor_select_replacement_reviewer(). */}
                    {pendingReplacements.map((s) => (
                      <div key={s.id} className="border border-amber-200 bg-amber-50/50 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{s.name}</p>
                            <p className="text-xs text-slate-600">{s.email}</p>
                          </div>
                          <span className="inline-flex text-xs font-bold px-2 py-1 rounded bg-amber-100 text-amber-700">
                            Pending Invitation
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 italic mt-3">Selected as a replacement reviewer -- awaiting the Coordinator to send the invitation.</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-sm">No reviewers assigned yet. Reviewer assignment is handled by the Coordinator.</div>
                )}
              </div>
              );
            })()}

            {activeTab === 'suggestions' && (
              <div className="space-y-6">
                {justMovedToNextStage && (
                  <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm shrink-0">
                      <CheckCircle className="w-4 h-4" /> Revision Approved
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
                    <p className="text-sm text-emerald-800 font-bold">Now select 2 reviewers to continue.</p>
                    <button
                      type="button"
                      onClick={() => setJustMovedToNextStage(false)}
                      className="ml-auto text-emerald-600 hover:text-emerald-800 shrink-0"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {manuscript.status === 'EDITOR_REVIEW' && assignment.recommendation === 'ACCEPT' && (
                  <EditorReviewerSelection
                    manuscriptId={manuscript.id}
                    suggestedReviewers={details.suggestedReviewers || []}
                    onSubmitSuccess={onChanged}
                  />
                )}

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
                        <p className="font-semibold text-slate-900">{contributor.name}</p>
                        <p className="text-xs text-slate-600">{contributor.email}</p>
                        {contributor.affiliation && <p className="text-xs text-slate-600">{contributor.affiliation}</p>}
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
                revisions={details.revisions || []}
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
                          <div className="mt-3 space-y-3">
                            <p className="text-sm text-slate-700"><span className="font-semibold">Recommendation:</span> {ra.recommendation?.replace(/_/g, ' ') || 'N/A'}</p>

                            {(ra.screening_responses?.length ?? 0) > 0 && (
                              <div className="space-y-1.5">
                                {ra.screening_responses.map((r, qIdx) => (
                                  <div key={r.question_id} className="border border-slate-200 rounded p-2.5 bg-slate-50">
                                    <div className="flex items-center justify-between mb-1">
                                      <p className="text-xs font-bold text-slate-800">{qIdx + 1}. {PEER_REVIEW_QUESTION_LABELS[r.question_id] || r.question_id}</p>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.answer ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        {r.answer ? 'Yes' : 'No'}
                                      </span>
                                    </div>
                                    {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                                  </div>
                                ))}
                              </div>
                            )}

                            {ra.comments_to_author && (
                              <div className="bg-slate-50 rounded p-3 text-sm text-slate-700">
                                <p className="font-semibold text-xs uppercase tracking-wide text-slate-500 mb-1">Comments to Author</p>
                                {ra.comments_to_author}
                              </div>
                            )}
                            {ra.comments_to_editor && (
                              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-slate-700">
                                <p className="font-semibold text-xs uppercase tracking-wide text-blue-700 mb-1">Confidential Comments to Editor</p>
                                {ra.comments_to_editor}
                              </div>
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
                {(() => {
                  const latestRevision = getLatestRevision(details.revisions);
                  const isRevisionDecision = latestRevision?.status === 'UNDER_REVIEW';
                  const nextRevisionNumber = (latestRevision?.revision_number || 0) + 1;

                  // Peer-review round: reviews already pushed the manuscript to
                  // AWAITING_DECISION and at least one reviewer was ever
                  // assigned -- the screening round's own AWAITING_DECISION
                  // (reject/revision) always has zero reviewer_assignments,
                  // since reviewers aren't selected until screening ACCEPTs.
                  // Declined rows don't block completion -- only the
                  // non-declined ones need to have actually submitted (a
                  // pre-existing gap: a stale DECLINED row would otherwise
                  // permanently block this from ever being "ready").
                  const activeReviews = (reviewerAssignments || []).filter(r => r.status !== 'DECLINED');
                  const hasRequiredReviews = activeReviews.length > 0 && activeReviews.every(r => r.status === 'SUBMITTED');
                  const isPeerReviewRound = !isRevisionDecision && manuscript.status === 'AWAITING_DECISION' && (reviewerAssignments?.length || 0) > 0;
                  const latestReviewSubmittedAt = activeReviews.reduce<string | null>((latest, r) => (
                    r.submitted_at && (!latest || r.submitted_at > latest) ? r.submitted_at : latest
                  ), null);

                  // A recommendation only counts as "already decided" if it was
                  // submitted after the thing it's deciding on -- otherwise
                  // it's a stale leftover from an earlier round (recommendation
                  // isn't reset per-round, only assessment_status is) and the
                  // editor still needs to decide on *this* round.
                  const recommendationIsCurrent = !!assignment.recommendation && !!assignment.recommendation_submitted_at && (
                    isRevisionDecision
                      ? new Date(assignment.recommendation_submitted_at) > new Date(latestRevision!.requested_at)
                      : isPeerReviewRound
                      ? (!!latestReviewSubmittedAt && new Date(assignment.recommendation_submitted_at) > new Date(latestReviewSubmittedAt))
                      : true
                  );

                  return (
                    <>
                      <h3 className="text-sm font-black text-slate-900">
                        {isRevisionDecision ? `Editor Decision — Revision ${latestRevision!.revision_number}` : isPeerReviewRound ? 'Peer Review Decision' : 'Editor Recommendation'}
                      </h3>

                      {(assignment.strengths || assignment.weaknesses || assignment.mandatory_revisions || assignment.comments_to_coordinator) && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Your Evaluation Comments</p>
                          {assignment.strengths && <p><span className="font-bold text-slate-700">Strengths:</span> <span className="text-slate-600">{assignment.strengths}</span></p>}
                          {assignment.weaknesses && <p><span className="font-bold text-slate-700">Weaknesses:</span> <span className="text-slate-600">{assignment.weaknesses}</span></p>}
                          {assignment.mandatory_revisions && <p><span className="font-bold text-slate-700">Mandatory Revisions:</span> <span className="text-slate-600">{assignment.mandatory_revisions}</span></p>}
                          {assignment.comments_to_coordinator && <p><span className="font-bold text-slate-700">Comments to Coordinator:</span> <span className="text-slate-600">{assignment.comments_to_coordinator}</span></p>}
                        </div>
                      )}

                      {!evaluationSubmitted ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
                          You must submit your evaluation (Editor Evaluation tab) before recommending a decision.
                        </div>
                      ) : isPeerReviewRound && !hasRequiredReviews ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-800">
                          Waiting for all peer reviews to be submitted before you can make the final decision.
                        </div>
                      ) : isPeerReviewRound && hasRequiredReviews && !manuscript.reviews_released_at ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-800">
                          All reviews are in, but the Coordinator hasn't sent them to you yet.
                        </div>
                      ) : recommendationIsCurrent ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                          <p className="text-sm font-bold text-emerald-900">
                            Recommendation submitted: {assignment.recommendation!.replace(/_/g, ' ')}
                          </p>
                          {assignment.recommendation_submitted_at && (
                            <p className="text-xs text-emerald-700 mt-1">{formatDate(assignment.recommendation_submitted_at)}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-3">Your recommendation is with the Coordinator for review.</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-slate-600">
                            {isRevisionDecision
                              ? `Accept sends Revision ${latestRevision!.revision_number} straight to the Coordinator's decision. Requesting a revision opens Revision ${nextRevisionNumber}.`
                              : isPeerReviewRound
                              ? "Review both peer reports (Reviews tab) and select your decision. This is separate from the reviewers' own recommendations -- you have the final say."
                              : "Select one decision based on your evaluation and (if applicable) the reviewers' recommendations."}
                          </p>
                          {isPeerReviewRound && (
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1.5">Editor Comments (optional)</label>
                              <textarea
                                value={editorComments}
                                onChange={(e) => setEditorComments(e.target.value)}
                                disabled={decisionBusy}
                                rows={3}
                                placeholder="Additional comments or instructions..."
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          )}
                          {decisionError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{decisionError}</div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                              { value: 'ACCEPT' as ReviewerRecommendation, label: isRevisionDecision ? 'Accept & Send to Decision' : 'Accept Submission', style: 'border-emerald-300 hover:bg-emerald-50 text-emerald-800' },
                              { value: 'MINOR_REVISION' as ReviewerRecommendation, label: isRevisionDecision ? `Request Revision ${nextRevisionNumber} (Minor)` : 'Minor Revision', style: 'border-amber-300 hover:bg-amber-50 text-amber-800' },
                              { value: 'MAJOR_REVISION' as ReviewerRecommendation, label: isRevisionDecision ? `Request Revision ${nextRevisionNumber} (Major)` : 'Major Revision', style: 'border-orange-300 hover:bg-orange-50 text-orange-800' },
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
                    </>
                  );
                })()}
              </div>
            )}

            {sidebarSection === 'suggestions' && (
              manuscript.status === 'EDITOR_REVIEW' && assignment.recommendation === 'ACCEPT' ? (
                <EditorReviewerSelection
                  manuscriptId={manuscript.id}
                  suggestedReviewers={details.suggestedReviewers || []}
                  onSubmitSuccess={onChanged}
                />
              ) : (
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
              )
            )}

            {sidebarSection === 'review_history' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">REVIEW HISTORY ({details.revisions?.length || 0})</h3>
                {details.revisions && details.revisions.length > 0 ? (
                  <div className="space-y-3">
                    {details.revisions.map((revision, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4">
                        <p className="font-semibold text-slate-900">{revision.revision_number}</p>
                        <p className="text-xs text-slate-600">{formatDate(revision.requested_at)}</p>
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
                    // A revision cycle resets assessment_status back to
                    // NOT_STARTED on this same assignment row without
                    // clearing the actual submitted scores -- see
                    // hasSubmittedEvaluation in EditorEvaluationFormTab.tsx.
                    // Use the same signal here so this step doesn't flip back
                    // to "in progress" once a revision cycle starts.
                    const evaluationDone = evaluationSubmitted || (assignment as any).scientific_merit != null;
                    const sortedRevisions = [...(details.revisions || [])].sort((a, b) => a.revision_number - b.revision_number);
                    // The Coordinator has acted on the original round the
                    // moment a revision cycle exists or the manuscript has
                    // otherwise moved past awaiting a decision.
                    const coordinatorActionDone = sortedRevisions.length > 0 ||
                      (manuscript.status && !['DRAFT', 'SUBMITTED', 'EDITOR_REVIEW', 'UNDER_REVIEW', 'AWAITING_DECISION'].includes(manuscript.status));
                    const finalDecisionDone = manuscript.status && ['ACCEPTED', 'REJECTED', 'PUBLISHED'].includes(manuscript.status);

                    // Base pipeline for the original review round, followed
                    // by one Editor Decision / Coordinator Decision pair per
                    // revision cycle that has actually happened so far (real
                    // data from details.revisions, updated live via the
                    // existing realtime subscription) -- so the timeline
                    // keeps growing across Revision 1, 2, 3... instead of a
                    // fixed 6-step pipeline that can't represent more than
                    // one cycle.
                    const steps = [
                      { label: 'Assignment accepted', done: assignment.status === 'ACCEPTED' || evaluationDone },
                      { label: 'Editor evaluation', done: evaluationDone },
                      { label: 'Reviewer assignment', done: reviewersAssignedDone },
                      { label: 'Peer review', done: peerReviewDone },
                      { label: 'Coordinator action', done: !!coordinatorActionDone },
                      ...sortedRevisions.flatMap((rev) => [
                        { label: `Revision ${rev.revision_number} — Editor Decision`, done: !!rev.editor_decision },
                        { label: `Revision ${rev.revision_number} — Coordinator Decision`, done: !!rev.coordinator_decision },
                      ]),
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
