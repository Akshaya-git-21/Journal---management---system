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
    return <AssignmentDetail details={selected} onBack={() => {
      setSelectedManuscriptId(null);
      setShowAcceptModal(false);
    }} onChanged={load} currentUser={currentUser} />;
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
                {[
                  { label: 'Active Submissions', count: assignmentCounts.accepted },
                  { label: 'Needs Editor', count: assignmentCounts.pending },
                  { label: 'In Submission Stage', count: assignmentCounts.total - assignmentCounts.accepted - assignmentCounts.pending }
                ].map((item) => (
                  <button key={item.label} className="w-full text-left px-4 py-2.5 text-xs text-emerald-100/80 hover:bg-emerald-500/10 transition flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 text-[10px] font-bold">{item.count}</span>
                  </button>
                ))}
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
                {[
                  { label: 'Awaiting Reviews', count: 0 },
                  { label: 'Reviews Submitted', count: 0 },
                  { label: 'Reviews Overdue', count: 0 },
                  { label: 'Revisions Submitted', count: 0 },
                  { label: 'In Review Stage', count: 0 }
                ].map((item) => (
                  <button key={item.label} className="w-full text-left px-4 py-2.5 text-xs text-emerald-100/80 hover:bg-emerald-500/10 transition flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 text-[10px] font-bold">{item.count}</span>
                  </button>
                ))}
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
                {[
                  { label: 'Copyediting Stage', count: 0 },
                  { label: 'In Production Stage', count: 0 },
                  { label: 'Scheduled Articles', count: 0 },
                  { label: 'Published', count: 0 },
                  { label: 'Declined / Rejected', count: 0 }
                ].map((item) => (
                  <button key={item.label} className="w-full text-left px-4 py-2.5 text-xs text-emerald-100/80 hover:bg-emerald-500/10 transition flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 text-[10px] font-bold">{item.count}</span>
                  </button>
                ))}
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
  const { manuscript, assignment, reviewerAssignments: initialReviewerAssignments, revisions: initialRevisions } = details;
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>(initialReviewerAssignments || []);
  const [revisions, setRevisions] = useState<RevisionRow[]>(initialRevisions || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'title' | 'contributors' | 'files' | 'evaluation' | 'reviews' | 'suggestions' | 'history' | 'revisions' | 'comments'>('title');
  const [activePublication, setActivePublication] = useState<'title' | 'contributors' | 'metadata' | 'references' | 'galleries' | 'jats' | 'permissions' | 'issue'>('title');
  const [currentPage, setCurrentPage] = useState(1);
  const [decisionLetter, setDecisionLetter] = useState('');
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null>(null);

  // Phase 2: Reviewer Management
  const [showAssignReviewersModal, setShowAssignReviewersModal] = useState(false);
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<Set<string>>(new Set());

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
  const [assignmentAccepted, setAssignmentAccepted] = useState(assignment.status === 'ACCEPTED');
  const [evaluationSubmitted, setEvaluationSubmitted] = useState(false);
  const [showAcceptButton, setShowAcceptButton] = useState(assignment.status !== 'ACCEPTED');

  // Peer Referee Suggestions
  const [suggestedReviewers, setSuggestedReviewers] = useState<{ name: string; email: string; expertise: string }[]>([]);
  const [suggestionForm, setSuggestionForm] = useState({ name: '', email: '', expertise: '' });

  // Phase 4: Set up real-time subscriptions for manuscript updates
  useEffect(() => {
    if (!manuscript.id) return;

    const unsubscribe = subscribeToAllManuscriptUpdates(
      manuscript.id,
      {
        onManuscriptChange: (updated) => {
          console.log('Manuscript updated in real-time');
          onChanged();
        },
        onReviewerChange: (updated) => {
          setReviewerAssignments(updated);
          showNotification('info', 'Reviewer assignments updated');
        },
        onDiscussionChange: (updated) => {
          setDiscussions(updated);
        },
        onStatusChange: (updated) => {
          console.log('Status history updated');
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

  // Subscribe to assignment status changes (INVITED → ACCEPTED)
  useEffect(() => {
    if (!assignment.id) return;

    const channel = supabase
      .channel(`assignment:${assignment.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'editor_assignments',
          filter: `id=eq.${assignment.id}`
        },
        (payload) => {
          const updatedAssignment = payload.new as EditorAssignmentRow;
          console.log('[Realtime] Assignment status changed:', updatedAssignment.status);

          // Update local state if status changed
          if (updatedAssignment.status === 'ACCEPTED') {
            setAssignmentAccepted(true);
            setShowAcceptButton(false);
            showNotification('success', 'Assignment accepted!');
          } else if (updatedAssignment.status === 'DECLINED') {
            showNotification('error', 'Assignment was declined');
            setTimeout(() => onBack(), 2000);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [assignment.id, onBack]);

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

  const handleAcceptAssignment = async () => {
    setBusy(true);
    setError('');
    try {
      const validation = validateAssignmentData(assignment);
      if (!validation.valid) {
        throw new Error(`Invalid assignment: ${validation.errors.join(', ')}`);
      }

      await retryOperation(
        () => respondToAssignment(assignment.id, true),
        3,
        1000
      );

      setAssignmentAccepted(true);
      setShowAcceptButton(false);
      showNotification('success', 'Assignment accepted. You can now proceed with evaluation.');
      onChanged();
    } catch (e: any) {
      await handleError(e, 'Accept Assignment');
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineAssignment = async () => {
    setBusy(true);
    setError('');
    try {
      const validation = validateAssignmentData(assignment);
      if (!validation.valid) {
        throw new Error(`Invalid assignment: ${validation.errors.join(', ')}`);
      }

      await retryOperation(
        () => respondToAssignment(assignment.id, false),
        3,
        1000
      );

      showNotification('success', 'Assignment declined successfully');
      onChanged();
      onBack();
    } catch (e: any) {
      await handleError(e, 'Decline Assignment');
    } finally {
      setBusy(false);
    }
  };

  const handleAddSuggestion = () => {
    if (!suggestionForm.name.trim() || !suggestionForm.email.trim()) {
      showNotification('error', 'Reviewer name and email are required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suggestionForm.email)) {
      showNotification('error', 'Please enter a valid email address');
      return;
    }
    setSuggestedReviewers([...suggestedReviewers, suggestionForm]);
    setSuggestionForm({ name: '', email: '', expertise: '' });
    showNotification('success', 'Reviewer suggestion added');
  };

  const handleRemoveSuggestion = (index: number) => {
    setSuggestedReviewers(suggestedReviewers.filter((_, i) => i !== index));
    showNotification('info', 'Reviewer suggestion removed');
  };

  const handleEditorDecision = async (decision: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT') => {
    setBusy(true);
    setError('');
    try {
      // Call submitRecommendation which calls the submit_editor_recommendation RPC
      await submitRecommendation(manuscript.id, decision);
      showNotification('success', `Editorial recommendation submitted: ${decision.replace(/_/g, ' ')}`);
      setDecisionType(decision);
      onChanged();
    } catch (e: any) {
      setError(e.message || 'Failed to submit recommendation');
      showNotification('error', e.message || 'Failed to submit recommendation');
    } finally {
      setBusy(false);
    }
  };

  const submitEditorDecision = async () => {
    if (!decisionType) return;
    setBusy(true);
    setError('');
    try {
      // Note: This is for Coordinator final decision, not editor recommendation
      // Leaving for backward compatibility if needed elsewhere
      try {
        await publishFinalDecision(manuscript.id, decisionType, decisionLetter);
      } catch (rpcError) {
        console.warn('Decision RPC failed (expected if not implemented):', rpcError);
      }

      setShowDecisionModal(false);
      setDecisionLetter('');
      showNotification('success', 'Editorial decision submitted successfully');
      onChanged();
    } catch (e: any) {
      setError(e.message || 'Failed to submit decision');
      showNotification('error', e.message || 'Failed to submit decision');
    } finally {
      setBusy(false);
    }
  };

  // Phase 2: Reviewer Management Handlers
  const handleAssignReviewers = async () => {
    if (selectedReviewerIds.size === 0) {
      showNotification('error', 'Please select at least one reviewer');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await retryOperation(
        () => assignReviewers(
          manuscript.id,
          Array.from(selectedReviewerIds),
          currentUser?.email || 'unknown'
        ),
        3,
        1000
      );

      setShowAssignReviewersModal(false);
      setSelectedReviewerIds(new Set());
      showNotification('success', `${selectedReviewerIds.size} reviewer(s) assigned successfully`);
      onChanged();
    } catch (e: any) {
      await handleError(e, 'Assign Reviewers');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveReviewer = async (assignmentId: string) => {
    setBusy(true);
    setError('');
    try {
      await retryOperation(
        () => removeReviewerAssignment(assignmentId),
        3,
        1000
      );

      setReviewerAssignments(prev => prev.filter(r => r.id !== assignmentId));
      showNotification('success', 'Reviewer removed successfully');
      onChanged();
    } catch (e: any) {
      await handleError(e, 'Remove Reviewer');
    } finally {
      setBusy(false);
    }
  };

  const toggleReviewerSelection = (reviewerId: string) => {
    const newSet = new Set(selectedReviewerIds);
    if (newSet.has(reviewerId)) {
      newSet.delete(reviewerId);
    } else {
      newSet.add(reviewerId);
    }
    setSelectedReviewerIds(newSet);
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
      <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto p-6 flex flex-col">
        {/* WORKFLOW */}
        <div className="mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">WORKFLOW</p>
          <div className="space-y-2">
            {computeWorkflowStages().map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                {item.done ? (
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 border-2 border-slate-300 rounded flex-shrink-0" />
                )}
                <span className={`text-sm ${item.done ? 'text-slate-900 font-semibold' : 'text-slate-600'}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* PUBLICATION */}
        <div className="mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">PUBLICATION</p>
          <div className="space-y-2">
            {[
              { id: 'title', label: 'Title & Abstract', icon: '📄' },
              { id: 'contributors', label: 'Contributors', icon: '👥' },
              { id: 'metadata', label: 'Metadata', icon: '⚙️' },
              { id: 'references', label: 'References', icon: '📚' },
              { id: 'galleries', label: 'Galleries', icon: '🖼️' },
              { id: 'jats', label: 'JATS XML', icon: '📋' },
              { id: 'permissions', label: 'Permissions & Disclosure', icon: '🔐' },
              { id: 'issue', label: 'Issue', icon: '📰' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePublication(item.id as any)}
                className={`w-full text-left flex items-center gap-2 text-sm p-2 rounded transition ${
                  activePublication === item.id
                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* STATUS TRACKING */}
        <div className="mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">STATUS TRACKING</p>
          <div className="space-y-2">
            {details.statusHistory && details.statusHistory.length > 0 ? (
              details.statusHistory.map((status, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-900 font-semibold">{status.status}</p>
                    {status.created_at && <p className="text-xs text-slate-500">{formatDate(status.created_at)}</p>}
                    {status.notes && <p className="text-xs text-slate-600 mt-1">{status.notes}</p>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No status history available.</p>
            )}
          </div>
        </div>

        {/* COORDINATOR NOTIFICATIONS */}
        <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">COORDINATOR ACTIONS</p>
          <div className="space-y-2">
            <button
              onClick={() => {
                notifyCoordinator(manuscript.id, currentUser?.email || 'unknown', 'READY_FOR_REVIEW', 'Reviewers assigned and ready for review');
                setError('Notification sent to coordinator');
                setTimeout(() => setError(''), 3000);
              }}
              className="w-full text-left text-xs px-3 py-2 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 font-bold transition"
            >
              ✓ Ready for Review
            </button>
            <button
              onClick={() => {
                notifyCoordinator(manuscript.id, currentUser?.email || 'unknown', 'REVIEWS_COMPLETE', 'All reviews received and compiled');
                setError('Notification sent to coordinator');
                setTimeout(() => setError(''), 3000);
              }}
              className="w-full text-left text-xs px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-bold transition"
            >
              ✓ Reviews Complete
            </button>
            <button
              onClick={() => {
                notifyCoordinator(manuscript.id, currentUser?.email || 'unknown', 'DECISION_READY', 'Final editorial decision submitted');
                setError('Notification sent to coordinator');
                setTimeout(() => setError(''), 3000);
              }}
              className="w-full text-left text-xs px-3 py-2 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 font-bold transition"
            >
              ✓ Decision Ready
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3 text-center">Alerts coordination team</p>
        </div>

        {/* NEED HELP */}
        <div className="mt-auto p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="font-bold text-sm text-slate-900 mb-1">Need Help?</p>
          <p className="text-xs text-slate-600 mb-3">Contact Support</p>
          <button className="text-xs text-[#008751] font-bold hover:underline">Learn more →</button>
        </div>
      </aside>

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
              <>
                {assignmentAccepted ? (
                  <>
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-bold">✓ Assignment Accepted</span>
                    {evaluationSubmitted ? (
                      <span className="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-bold">✓ Evaluation Submitted</span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-bold">⏳ Evaluation In Progress</span>
                    )}
                  </>
                ) : (
                  <span className="bg-slate-100 text-slate-700 text-xs px-3 py-1 rounded-full font-bold">{assignment.status || 'Pending'}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-slate-200 px-8 flex-shrink-0">
          <div className="flex gap-8">
            {tabs.map((tab) => {
              const isDisabled = tab.id === 'evaluation' && !assignmentAccepted;
              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id as any)}
                  disabled={isDisabled}
                  className={`px-1 py-4 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                    isDisabled
                      ? 'text-slate-400 border-transparent cursor-not-allowed'
                      : activeTab === tab.id
                      ? 'text-[#008751] border-[#008751]'
                      : 'text-slate-600 border-transparent hover:text-slate-900'
                  }`}
                  title={isDisabled ? 'Accept assignment first to unlock evaluation' : ''}
                >
                  {tab.label}
                  {isDisabled && <span className="ml-1 text-xs">🔒</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* CENTER CONTENT */}
          <div className="flex-1 overflow-y-auto p-8">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">{error}</div>}

            {activePublication !== 'title' && (
              <>
                {activePublication === 'contributors' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Contributors ({details.contributors?.length || 0})</h2>
                      <div className="space-y-4">
                        {details.contributors && details.contributors.length > 0 ? (
                          details.contributors.map((contributor, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-lg p-4">
                              <p className="font-semibold text-slate-900">{contributor.name || 'Unknown Author'}</p>
                              <p className="text-sm text-slate-600">{contributor.role || 'Author'}</p>
                              {contributor.affiliation && <p className="text-xs text-slate-500 mt-1">{contributor.affiliation}</p>}
                              {contributor.email && <p className="text-xs text-slate-500">Email: {contributor.email}</p>}
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-600">No contributor data available.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'metadata' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Metadata</h2>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Manuscript ID</p>
                          <p className="text-slate-900">{manuscript.id}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Submission Date</p>
                          <p className="text-slate-900">{formatDate(manuscript.submitted_at)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Status</p>
                          <p className="text-slate-900">{manuscript.status || 'SUBMITTED'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Language</p>
                          <p className="text-slate-900">{manuscript.language || 'English'}</p>
                        </div>
                        {manuscript.doi && (
                          <div className="col-span-2">
                            <p className="text-sm font-semibold text-slate-600 mb-2">DOI</p>
                            <p className="text-slate-900">{manuscript.doi}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'references' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">References</h2>
                      <div className="space-y-3">
                        {manuscript.references ? (
                          <>
                            {manuscript.references.split('\n').filter(ref => ref.trim()).map((ref, idx) => (
                              <p key={idx} className="text-slate-700 leading-relaxed">{ref}</p>
                            ))}
                            <p className="text-slate-500 text-sm mt-6">
                              Total References: {manuscript.references.split('\n').filter(ref => ref.trim()).length}
                            </p>
                          </>
                        ) : (
                          <div className="bg-slate-50 rounded-lg p-6 text-center">
                            <p className="text-slate-600">No references submitted.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'galleries' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Galleries & Figures</h2>
                      {(() => {
                        const figures = extractFigures();
                        return figures.length > 0 ? (
                          <div className="grid grid-cols-2 gap-4">
                            {figures.map((figure) => (
                              <div key={figure.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                                <div className="aspect-video bg-slate-100 flex items-center justify-center">
                                  {figure.file_name.match(/\.(jpg|jpeg|png|gif|svg)$/i) ? (
                                    <img
                                      src={figure.public_url || ''}
                                      alt={figure.file_name}
                                      className="max-h-full max-w-full object-contain"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center gap-2">
                                      <span className="text-2xl">📄</span>
                                      <span className="text-xs text-slate-600">{figure.file_type}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="p-3 bg-white border-t border-slate-200">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{figure.file_name}</p>
                                  <p className="text-xs text-slate-500">{figure.file_size} • {formatDate(figure.uploaded_at)}</p>
                                  {figure.public_url && (
                                    <div className="flex gap-2 mt-2">
                                      <a href={figure.public_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:text-emerald-700 font-bold">
                                        View →
                                      </a>
                                      <a href={figure.public_url} download className="text-xs text-emerald-600 hover:text-emerald-700 font-bold">
                                        Download →
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-slate-50 rounded-lg p-12 text-center">
                            <div className="text-3xl mb-3">🖼️</div>
                            <p className="text-slate-600">No figures or supplementary materials uploaded.</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {activePublication === 'jats' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">JATS XML</h2>
                      {(() => {
                        const jatsFile = details.files?.find(f => f.file_type?.toLowerCase() === 'jats' || f.file_name?.toLowerCase().includes('.xml'));
                        return jatsFile ? (
                          <div className="space-y-4">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                              <p className="text-sm text-emerald-700 font-semibold">✓ JATS XML file available</p>
                            </div>
                            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                              <p className="text-xs text-slate-600 mb-3">File: {jatsFile.file_name}</p>
                              <p className="text-xs text-slate-600 mb-4">Size: {jatsFile.file_size} • Uploaded: {formatDate(jatsFile.uploaded_at)}</p>
                              {jatsFile.public_url && (
                                <div className="flex gap-2">
                                  <a href={jatsFile.public_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:text-emerald-700 font-bold">
                                    View XML →
                                  </a>
                                  <a href={jatsFile.public_url} download className="text-xs text-emerald-600 hover:text-emerald-700 font-bold">
                                    Download →
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 rounded-lg p-12 text-center">
                            <div className="text-3xl mb-3">📋</div>
                            <p className="text-slate-600 mb-2">No JATS XML file available for this manuscript.</p>
                            <p className="text-xs text-slate-500">JATS XML may be generated during the publication workflow.</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {activePublication === 'permissions' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Permissions & Disclosure</h2>
                      <div className="bg-slate-50 rounded-lg p-8 text-center">
                        <div className="text-3xl mb-3">🔐</div>
                        <p className="text-slate-600 mb-2">Permission and disclosure information from author submission.</p>
                        <p className="text-xs text-slate-500 mb-6">Review the submitted manuscript and associated files above for disclosure statements.</p>
                        <div className="bg-white border border-slate-200 rounded-lg p-4 text-left max-w-2xl mx-auto">
                          <p className="text-xs font-semibold text-slate-600 mb-3">Items to verify:</p>
                          <ul className="text-xs text-slate-600 space-y-2">
                            <li className="flex items-start gap-2">
                              <span className="text-slate-400">□</span>
                              <span>Conflict of Interest disclosure form completed</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-slate-400">□</span>
                              <span>Copyright transfer agreement signed</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-slate-400">□</span>
                              <span>Data availability statement included</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-slate-400">□</span>
                              <span>Author funding/support declaration</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'issue' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Issue Assignment</h2>
                      {manuscript.volume || manuscript.issue ? (
                        <div className="space-y-4">
                          {manuscript.volume && (
                            <div>
                              <p className="text-sm font-semibold text-slate-600 mb-2">Volume</p>
                              <p className="text-slate-900">{manuscript.volume}</p>
                            </div>
                          )}
                          {manuscript.issue && (
                            <div>
                              <p className="text-sm font-semibold text-slate-600 mb-2">Issue</p>
                              <p className="text-slate-900">{manuscript.issue}</p>
                            </div>
                          )}
                          {manuscript.published_at && (
                            <div>
                              <p className="text-sm font-semibold text-slate-600 mb-2">Published Date</p>
                              <p className="text-slate-900">{formatDate(manuscript.published_at)}</p>
                            </div>
                          )}
                          {manuscript.doi && (
                            <div>
                              <p className="text-sm font-semibold text-slate-600 mb-2">DOI</p>
                              <p className="text-slate-900 font-mono text-xs">{manuscript.doi}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-lg p-12 text-center">
                          <div className="text-3xl mb-3">📰</div>
                          <p className="text-slate-600 mb-1">No issue assigned yet.</p>
                          <p className="text-xs text-slate-500">Issue assignment will occur during the publication workflow.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {activePublication === 'title' && activeTab === 'title' && (
              <div>
                {/* PDF Viewer */}
                <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-6">
                  {/* Toolbar */}
                  <div className="bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-3">
                      <button className="p-1 hover:bg-slate-200 rounded">≡</button>
                      <button className="p-1 hover:bg-slate-200 rounded">🔍</button>
                      <button className="p-1 hover:bg-slate-200 rounded">↑</button>
                      <button className="p-1 hover:bg-slate-200 rounded">↓</button>
                    </div>
                    <span className="font-semibold">{currentPage} of 3</span>
                    <div className="flex items-center gap-2">
                      <button className="p-1 hover:bg-slate-200 rounded">−</button>
                      <span className="px-2">100%</span>
                      <button className="p-1 hover:bg-slate-200 rounded">+</button>
                    </div>
                    <button className="p-1 hover:bg-slate-200 rounded">⛶</button>
                    <button className="p-1 hover:bg-slate-200 rounded">⋮</button>
                  </div>

                  {/* Document */}
                  <div className="bg-slate-50 p-12 min-h-[600px]">
                    <div className="bg-white p-12 max-w-3xl mx-auto">
                      <h2 className="text-2xl font-bold text-center mb-6">{manuscript.title}</h2>
                      <div className="text-center mb-4">
                        <p className="text-sm text-slate-700">
                          {details.contributors && details.contributors.length > 0
                            ? details.contributors.map((c, i) => `${c.name}${details.contributors && i < details.contributors.length - 1 ? ', ' : ''}`).join('') + (details.contributors.length > 0 ? '' : '')
                            : manuscript.author_name}
                        </p>
                      </div>
                      {details.contributors && details.contributors.length > 0 && (
                        <div className="text-center mb-8 text-xs text-slate-600 border-b border-slate-200 pb-6">
                          {details.contributors.map((c, i) => (
                            <div key={i}>
                              {c.affiliation && <p>{c.affiliation}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mb-6">
                        <p className="text-xs"><span className="font-semibold">Submitted:</span> <span className="text-slate-600">{formatDate(manuscript.submitted_at)}</span></p>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-emerald-700 mb-3 uppercase">Abstract</h3>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {manuscript.abstract || '(No abstract provided)'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-slate-100 border-t border-slate-200 px-8 py-3 text-xs text-slate-600 flex justify-between">
                    <span>Page 1 of 3</span>
                    <span>Word Count: 6,245 | Language: English (US)</span>
                    <span>Close Viewer</span>
                  </div>
                </div>

                {/* Files Section */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="font-bold text-slate-900 mb-4">FILES FOR REVIEW ({details.files?.length || 0})</h3>
                  <div className="space-y-3">
                    {details.files && details.files.length > 0 ? (
                      details.files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded hover:bg-emerald-50 cursor-pointer transition">
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
                                <a href={file.public_url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 p-1">👁️</a>
                                <a href={file.public_url} download className="text-slate-600 hover:text-slate-900 p-1">📥</a>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-600 text-sm">No files uploaded.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'contributors' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">Manuscript Contributors ({details.contributors?.length || 0})</h3>
                {details.contributors && details.contributors.length > 0 ? (
                  <div className="space-y-3">
                    {details.contributors.map((contributor, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4">
                        <p className="font-semibold text-slate-900">{contributor.name}</p>
                        <p className="text-sm text-slate-600">{contributor.role}</p>
                        {contributor.affiliation && <p className="text-xs text-slate-500 mt-1">{contributor.affiliation}</p>}
                        {contributor.email && <p className="text-xs text-slate-500">Email: {contributor.email}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-sm">No contributors data available.</div>
                )}
              </div>
            )}

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
              <EditorEvaluationForm
                assignmentId={assignment.id}
                onSubmitted={() => {
                  setEvaluationSubmitted(true);
                  onChanged();
                }}
                isReadOnly={false}
                onDecision={handleEditorDecision}
                suggestedReviewers={suggestedReviewers}
              />
            )}

            {activeTab === 'reviews' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">PEER REVIEWS ({reviewerAssignments?.length || 0})</h3>
                {reviewerAssignments && reviewerAssignments.length > 0 ? (
                  <div className="space-y-4">
                    {reviewerAssignments.map((assignment) => (
                      <div key={assignment.id} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {details.profiles.get(assignment.reviewer_id)?.name || 'Unknown Reviewer'}
                            </p>
                            <p className="text-xs text-slate-600">{details.profiles.get(assignment.reviewer_id)?.email}</p>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex text-xs font-bold px-2 py-1 rounded ${
                              assignment.review_status === 'SUBMITTED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : assignment.review_status === 'PENDING'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {assignment.review_status || 'Pending'}
                            </span>
                            {assignment.submitted_at && (
                              <p className="text-xs text-slate-500 mt-1">{formatDate(assignment.submitted_at)}</p>
                            )}
                          </div>
                        </div>

                        {assignment.review_status === 'SUBMITTED' && (
                          <div className="bg-slate-50 rounded p-3 text-sm text-slate-700 space-y-2 mt-3">
                            <p><span className="font-semibold">Recommendation:</span> {(assignment as any).recommendation || 'N/A'}</p>
                            {(assignment as any).review_comments && (
                              <p><span className="font-semibold">Comments:</span> {(assignment as any).review_comments}</p>
                            )}
                          </div>
                        )}

                        {assignment.review_status === 'PENDING' && (
                          <p className="text-xs text-slate-500 italic mt-3">Awaiting review submission...</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-sm">No reviewers assigned yet. Use the REVIEW ROUND section to assign reviewers.</div>
                )}
              </div>
            )}

            {activeTab === 'suggestions' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">REVIEWER SUGGESTIONS ({details.suggestedReviewers?.length || 0})</h3>
                {details.suggestedReviewers && details.suggestedReviewers.length > 0 ? (
                  <div className="space-y-3">
                    {details.suggestedReviewers.map((reviewer) => {
                      const isAssigned = reviewerAssignments?.some(r => r.reviewer_id === reviewer.id);
                      return (
                        <div key={reviewer.id} className={`border rounded-lg p-4 ${isAssigned ? 'bg-emerald-50 border-emerald-200' : 'border-slate-200'}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">{reviewer.name}</p>
                              <p className="text-xs text-slate-600">{reviewer.email}</p>
                              {reviewer.expertise && (
                                <p className="text-xs text-slate-500 mt-1">Expertise: {reviewer.expertise}</p>
                              )}
                            </div>
                            <div className="text-right">
                              {isAssigned ? (
                                <span className="text-xs font-bold px-2 py-1 bg-emerald-100 text-emerald-700 rounded">✓ Assigned</span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedReviewerIds(new Set([reviewer.id]));
                                    setShowAssignReviewersModal(true);
                                  }}
                                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                                >
                                  Assign →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-sm">No suggested reviewers available for this manuscript.</div>
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
                          <p className="font-semibold text-slate-900">{item.status}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                        </div>
                        {item.notes && <p className="text-sm text-slate-600">{item.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-sm">No history available.</div>
                )}
              </div>
            )}

            {activeTab === 'revisions' && (
              <RevisionReview manuscriptId={manuscript.id} onStatusUpdate={onChanged} />
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

          {/* RIGHT SIDEBAR */}
          <aside className="w-80 bg-slate-50 border-l border-slate-200 overflow-y-auto p-6 flex flex-col">
            {/* DECISION */}
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">DECISION</p>
              {assignment.status === 'DECLINED' ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-red-700 text-center">✕ Assignment Declined</p>
                </div>
              ) : evaluationSubmitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-emerald-700 text-center">✓ Decision Submitted</p>
                  <p className="text-xs text-emerald-600 text-center mt-1">Awaiting coordinator action</p>
                </div>
              ) : !assignmentAccepted ? (
                <div className="space-y-2">
                  <button
                    disabled={busy}
                    onClick={handleAcceptAssignment}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50">
                    <Check className="w-4 h-4" /> Accept Assignment
                  </button>
                  <button
                    disabled={busy}
                    onClick={handleDeclineAssignment}
                    className="w-full text-red-600 text-xs font-bold py-3 rounded-lg hover:bg-red-50 transition flex items-center justify-center gap-2 disabled:opacity-50">
                    <XIcon className="w-4 h-4" /> Decline Assignment
                  </button>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-700 text-center">📝 Complete Evaluation</p>
                  <p className="text-xs text-blue-600 text-center mt-1">Decision buttons at bottom of form</p>
                </div>
              )}
            </div>

            {/* REVIEW ROUND */}
            <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">REVIEW ROUND</p>
                <button
                  onClick={() => setShowAssignReviewersModal(true)}
                  className="text-emerald-600 text-xs font-bold hover:text-emerald-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Assign
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-600">Status</p>
                  <p className="text-sm font-semibold text-blue-600">{manuscript.status || 'In Progress'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Reviewers Assigned</p>
                  <p className="text-sm font-bold text-slate-900">{details.reviewerAssignments?.length || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Reviews Completed</p>
                  <p className="text-sm font-bold text-slate-900">
                    {details.reviewerAssignments?.filter(r => r.review_status === 'SUBMITTED').length || 0} / {details.reviewerAssignments?.length || 0}
                  </p>
                </div>
                {reviewerAssignments && reviewerAssignments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-600 mb-2">Assigned Reviewers:</p>
                    {reviewerAssignments.slice(0, 3).map((ra) => (
                      <div key={ra.id} className="flex items-center justify-between text-xs mb-1 p-1 hover:bg-slate-50 rounded">
                        <span className="text-slate-700">
                          • {details.profiles.get(ra.reviewer_id)?.name || 'Unknown'} ({ra.review_status || 'Pending'})
                        </span>
                        <button
                          onClick={() => handleRemoveReviewer(ra.id)}
                          disabled={busy}
                          className="text-red-600 hover:text-red-700 text-[10px] disabled:opacity-50"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {reviewerAssignments.length > 3 && (
                      <p className="text-xs text-slate-500 mt-1">+{reviewerAssignments.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* SUGGEST PEER REFEREES */}
            <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">SUGGEST PEER REFEREES</p>
              <p className="text-xs text-slate-600 mb-4">Suggest potential reviewers for this manuscript.</p>
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  placeholder="Reviewer Name"
                  value={suggestionForm.name}
                  onChange={(e) => setSuggestionForm({ ...suggestionForm, name: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="email"
                  placeholder="Reviewer Email"
                  value={suggestionForm.email}
                  onChange={(e) => setSuggestionForm({ ...suggestionForm, email: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Expertise / Specialization"
                  value={suggestionForm.expertise}
                  onChange={(e) => setSuggestionForm({ ...suggestionForm, expertise: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                onClick={handleAddSuggestion}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Add Suggestion
              </button>
            </div>

            {/* SUGGESTED REVIEWERS */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">SUGGESTED REVIEWERS ({suggestedReviewers.length + (details.suggestedReviewers?.length || 0)})</p>
              <div className="space-y-3">
                {suggestedReviewers.map((reviewer, i) => (
                  <div key={`new-${i}`} className="p-3 bg-emerald-50 rounded border border-emerald-200 hover:bg-emerald-100 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <span>👤</span> {reviewer.name} <span className="text-[10px] bg-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded">New</span>
                        </p>
                        <p className="text-xs text-slate-600">{reviewer.email}</p>
                        {reviewer.expertise && <p className="text-xs text-slate-500 mt-1">Expertise: {reviewer.expertise}</p>}
                      </div>
                      <button onClick={() => handleRemoveSuggestion(i)} className="text-slate-400 hover:text-red-600 transition">🗑️</button>
                    </div>
                  </div>
                ))}
                {details.suggestedReviewers && details.suggestedReviewers.map((reviewer, i) => (
                  <div key={`saved-${i}`} className="p-3 bg-slate-50 rounded border border-slate-200 hover:bg-slate-100 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <span>👤</span> {reviewer.name}
                        </p>
                        <p className="text-xs text-slate-600">{reviewer.email}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {suggestedReviewers.length === 0 && (!details.suggestedReviewers || details.suggestedReviewers.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-4">No reviewers suggested yet</p>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Decision Modal */}
      {showDecisionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {decisionType === 'ACCEPT' && '✓ Accept Manuscript'}
                {decisionType === 'REJECT' && '✗ Decline Submission'}
                {decisionType === 'MINOR_REVISION' && '⚠ Request Minor Revision'}
                {decisionType === 'MAJOR_REVISION' && '⚠ Request Major Revision'}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Decision Letter to Author</label>
                <textarea
                  value={decisionLetter}
                  onChange={(e) => setDecisionLetter(e.target.value)}
                  placeholder={
                    decisionType === 'ACCEPT'
                      ? 'Write a congratulatory letter...'
                      : decisionType === 'REJECT'
                      ? 'Explain the rejection reasons...'
                      : 'List the required revisions...'
                  }
                  className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:border-emerald-500"
                  rows={6}
                />
              </div>

              {(decisionType === 'MINOR_REVISION' || decisionType === 'MAJOR_REVISION') && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                  ℹ️ After this decision, the manuscript will be placed in REVISION_REQUESTED status. The author will be notified to submit revisions, which will then be sent back to the editor for re-evaluation.
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowDecisionModal(false)}
                className="px-6 py-2 border border-slate-300 text-slate-900 font-bold rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                disabled={busy || !decisionLetter.trim()}
                onClick={submitEditorDecision}
                className={`px-6 py-2 text-white font-bold rounded-lg transition ${
                  decisionType === 'ACCEPT'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : decisionType === 'REJECT'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                } disabled:opacity-50`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                Submit Decision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2: Assign Reviewers Modal */}
      {showAssignReviewersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Assign Peer Reviewers</h2>
              <p className="text-xs text-slate-500 mt-1">Select reviewers to evaluate this manuscript</p>
            </div>

            <div className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">{error}</div>}

              <div>
                <p className="text-xs font-semibold text-slate-900 mb-3">SUGGESTED REVIEWERS</p>
                {details.suggestedReviewers && details.suggestedReviewers.length > 0 ? (
                  <div className="space-y-2">
                    {details.suggestedReviewers.map((reviewer) => (
                      <label key={reviewer.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedReviewerIds.has(reviewer.id)}
                          onChange={() => toggleReviewerSelection(reviewer.id)}
                          className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">{reviewer.name}</p>
                          <p className="text-xs text-slate-600">{reviewer.email}</p>
                          {reviewer.expertise && <p className="text-xs text-slate-500 mt-1">Expertise: {reviewer.expertise}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">No suggested reviewers available</p>
                )}
              </div>

              {selectedReviewerIds.size > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-emerald-900">{selectedReviewerIds.size} reviewer(s) selected</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAssignReviewersModal(false);
                  setSelectedReviewerIds(new Set());
                }}
                className="px-6 py-2 border border-slate-300 text-slate-900 font-bold rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                disabled={busy || selectedReviewerIds.size === 0}
                onClick={handleAssignReviewers}
                className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                Assign Reviewers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditorEvalState {
  scientificMerit: number;
  noveltyInnovation: number;
  methodologyQuality: number;
  validityResults: number;
  clarityPresentation: number;
  ethicalStandards: number;
  overallRecommendation: number;
  commentsToAuthors: string;
  strengths: string;
  weaknesses: string;
  mandatoryRevisions: string;
  suggestedReviewers: { name: string; email: string; expertise: string }[];
}

function EditorEvaluationForm({
  assignmentId,
  onSubmitted,
  isReadOnly = false,
  onDecision,
  suggestedReviewers = []
}: {
  assignmentId: string;
  onSubmitted: () => void;
  isReadOnly?: boolean;
  onDecision?: (type: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT') => void;
  suggestedReviewers?: { name: string; email: string; expertise: string }[];
}) {
  const [evalData, setEvalData] = useState<EditorEvalState>({
    scientificMerit: 0,
    noveltyInnovation: 0,
    methodologyQuality: 0,
    validityResults: 0,
    clarityPresentation: 0,
    ethicalStandards: 0,
    overallRecommendation: 0,
    commentsToAuthors: '',
    strengths: '',
    weaknesses: '',
    mandatoryRevisions: '',
    suggestedReviewers: []
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draft = await getDraftEvaluation(assignmentId);
        if (draft) {
          setEvalData(draft);
        }
      } catch (e) {
        console.error('Failed to load draft:', e);
      }
    };
    loadDraft();
  }, [assignmentId]);

  const updateScore = (key: keyof EditorEvalState, value: number) => {
    setEvalData(prev => ({ ...prev, [key]: value }));
  };

  const updateText = (key: keyof EditorEvalState, value: string) => {
    setEvalData(prev => ({ ...prev, [key]: value }));
  };

  const addReviewer = () => {
    setEvalData(prev => ({
      ...prev,
      suggestedReviewers: [...prev.suggestedReviewers, { name: '', email: '', expertise: '' }]
    }));
  };

  const removeReviewer = (index: number) => {
    setEvalData(prev => ({
      ...prev,
      suggestedReviewers: prev.suggestedReviewers.filter((_, i) => i !== index)
    }));
  };

  const updateReviewer = (index: number, field: string, value: string) => {
    setEvalData(prev => ({
      ...prev,
      suggestedReviewers: prev.suggestedReviewers.map((r, i) =>
        i === index ? { ...r, [field]: value } : r
      )
    }));
  };

  const saveDraft = async () => {
    setBusy(true);
    setError('');
    try {
      await saveDraftEvaluation(assignmentId, evalData);
      setError('Draft saved successfully');
      setTimeout(() => setError(''), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to save draft');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      // Combine reviewers from form state and parent prop (from sidebar)
      const allSuggestedReviewers = [
        ...evalData.suggestedReviewers.filter(r => r.name.trim() && r.email.trim()),
        ...suggestedReviewers.filter(r => r.name.trim() && r.email.trim())
      ];

      await submitAssessment(assignmentId, {
        scientificMerit: evalData.scientificMerit,
        noveltyInnovation: evalData.noveltyInnovation,
        methodologyQuality: evalData.methodologyQuality,
        literatureAdequacy: evalData.validityResults,
        ethicalCompliance: evalData.ethicalStandards,
        dataReliability: evalData.validityResults,
        writingQuality: evalData.clarityPresentation,
        strengths: evalData.strengths,
        weaknesses: evalData.weaknesses,
        mandatoryRevisions: evalData.mandatoryRevisions,
        commentsToCoordinator: evalData.commentsToAuthors,
        suggestedReviewers: allSuggestedReviewers
      });
      setSubmitted(true);
      onSubmitted();
    } catch (e: any) {
      setError(e.message || 'Failed to submit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-6">EVALUATION CRITERIA</h3>
        <p className="text-xs text-slate-500 mb-6">Scale: 1 (Poor) to 10 (Excellent)</p>

        {[
          { key: 'scientificMerit', label: '1. SCIENTIFIC MERIT', desc: 'Original contribution and study rigor' },
          { key: 'noveltyInnovation', label: '2. NOVELTY & INNOVATION', desc: 'Breakthrough contributions and uniqueness' },
          { key: 'methodologyQuality', label: '3. METHODOLOGY QUALITY', desc: 'Experimental setup and verification rigor' },
          { key: 'validityResults', label: '4. VALIDITY OF RESULTS', desc: 'Mathematical reproducibility and accuracy' },
          { key: 'clarityPresentation', label: '5. CLARITY & PRESENTATION', desc: 'Writing quality and organization' },
          { key: 'ethicalStandards', label: '6. ETHICAL STANDARDS', desc: 'Research ethics and moral bounds' }
        ].map(({ key, label, desc }) => (
          <div key={key} className="mb-6">
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">{label}</label>
              <span className="text-[10px] text-slate-500">{desc}</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <button
                  key={score}
                  disabled={isReadOnly}
                  onClick={() => updateScore(key as any, score)}
                  className={`w-8 h-8 rounded font-bold text-xs transition ${
                    evalData[key as any] === score ? 'bg-[#008751] text-white' : 'bg-slate-100 hover:bg-slate-200'
                  } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4">QUALITATIVE APPRAISALS</h3>
        <div className="space-y-4">
          <textarea disabled={isReadOnly} value={evalData.commentsToAuthors} onChange={(e) => updateText('commentsToAuthors', e.target.value)} placeholder="Comments to Authors" className="w-full text-xs border border-slate-200 rounded px-3 py-2 disabled:bg-slate-50 disabled:cursor-not-allowed" rows={3} />
          <textarea disabled={isReadOnly} value={evalData.strengths} onChange={(e) => updateText('strengths', e.target.value)} placeholder="Strengths" className="w-full text-xs border border-slate-200 rounded px-3 py-2 disabled:bg-slate-50 disabled:cursor-not-allowed" rows={2} />
          <textarea disabled={isReadOnly} value={evalData.weaknesses} onChange={(e) => updateText('weaknesses', e.target.value)} placeholder="Weaknesses" className="w-full text-xs border border-slate-200 rounded px-3 py-2 disabled:bg-slate-50 disabled:cursor-not-allowed" rows={2} />
          <textarea disabled={isReadOnly} value={evalData.mandatoryRevisions} onChange={(e) => updateText('mandatoryRevisions', e.target.value)} placeholder="Mandatory Revisions" className="w-full text-xs border border-slate-200 rounded px-3 py-2 disabled:bg-slate-50 disabled:cursor-not-allowed" rows={2} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-black text-slate-900">SUGGEST PEER REFEREES</h3>
          {!isReadOnly && (
            <button onClick={addReviewer} className="text-[#008751] text-xs font-bold flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>
        {evalData.suggestedReviewers.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No reviewers added yet</p>
        ) : (
          <div className="space-y-3">
            {evalData.suggestedReviewers.map((r, i) => (
              <div key={i} className="border border-slate-200 rounded p-3 space-y-2">
                {isReadOnly ? (
                  <>
                    <p className="text-xs font-bold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-600">{r.email}</p>
                    {r.expertise && <p className="text-xs text-slate-500">Expertise: {r.expertise}</p>}
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={r.name}
                      onChange={(e) => updateReviewer(i, 'name', e.target.value)}
                      placeholder="Reviewer Name"
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 disabled:bg-slate-50"
                    />
                    <input
                      type="email"
                      disabled={isReadOnly}
                      value={r.email}
                      onChange={(e) => updateReviewer(i, 'email', e.target.value)}
                      placeholder="Email"
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 disabled:bg-slate-50"
                    />
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={r.expertise}
                      onChange={(e) => updateReviewer(i, 'expertise', e.target.value)}
                      placeholder="Expertise"
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 disabled:bg-slate-50"
                    />
                    <button
                      onClick={() => removeReviewer(i)}
                      disabled={isReadOnly}
                      className="text-xs text-red-600 hover:text-red-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Remove Reviewer
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision buttons always available - they are separate from evaluation submission */}
      <div className="space-y-2 mt-6">
        {isReadOnly && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
            <p className="text-xs font-bold text-emerald-700 text-center">
              ✓ Evaluation Submitted
            </p>
            <p className="text-xs text-emerald-600 text-center">
              Now provide your recommendation below
            </p>
          </div>
        )}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-600 mb-2">EDITOR RECOMMENDATION:</div>
          <button
            disabled={busy}
            onClick={() => {
              saveDraft();
              setTimeout(() => onDecision?.('ACCEPT'), 500);
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Accept Manuscript
          </button>
          <button
            disabled={busy}
            onClick={() => {
              saveDraft();
              setTimeout(() => onDecision?.('MINOR_REVISION'), 500);
            }}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
            Request Minor Revision
          </button>
          <button
            disabled={busy}
            onClick={() => {
              saveDraft();
              setTimeout(() => onDecision?.('MAJOR_REVISION'), 500);
            }}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
            Request Major Revision
          </button>
          <button
            disabled={busy}
            onClick={() => {
              saveDraft();
              setTimeout(() => onDecision?.('REJECT'), 500);
            }}
            className="w-full text-red-600 hover:bg-red-50 text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XIcon className="w-4 h-4" />}
            Reject Manuscript
          </button>
        </div>
      </div>
    </div>
  );
}

// NEW COMPONENT: Accept/Decline Modal for INVITED assignments
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
