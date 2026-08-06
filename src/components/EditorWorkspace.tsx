import { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getRevisions, subscribeToManuscripts,
  respondToEditorAssignment, submitEditorAssessment, submitEditorRecommendation, publishDecision
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, Check, X as XIcon, Plus, Trash2, ChevronDown, Clock, AlertCircle, Archive, CheckCircle, FileText, Settings } from 'lucide-react';
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

interface Row { manuscript: ManuscriptRow; assignment: EditorAssignmentRow; }

export default function EditorWorkspace({ currentUser }: EditorWorkspaceProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    submissions: true,
    reviewStages: false,
    copyedit: false
  });

  const load = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const manuscripts = await listManuscripts();
      const withAssignments: Row[] = [];
      for (const m of manuscripts) {
        const assignments = await getEditorAssignments(m.id);
        const mine = assignments.find((a) => a.editor_id === data.user?.id);
        if (mine) withAssignments.push({ manuscript: m, assignment: mine });
      }
      setRows(withAssignments);
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
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  const selected = rows.find((r) => r.manuscript.id === selectedManuscriptId) || null;
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (selected) {
    return <AssignmentDetail row={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} currentUser={currentUser} />;
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

function AssignmentList({ rows, onOpen }: { rows: Row[]; onOpen: (id: string) => void }) {
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
          {rows.map(({ manuscript, assignment }) => (
            <tr key={manuscript.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(manuscript.id)}>
              <td className="px-4 py-3 font-bold text-slate-800">{manuscript.title}</td>
              <td className="px-4 py-3"><StatusBadge status={manuscript.status} /></td>
              <td className="px-4 py-3 text-xs font-bold text-slate-600">{assignment.status}</td>
              <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open &rarr;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentDetail({ row, onBack, onChanged, currentUser }: { row: Row; onBack: () => void; onChanged: () => void; currentUser?: { name: string; email: string; role: Role } | null }) {
  const { manuscript, assignment } = row;
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'title' | 'contributors' | 'files' | 'evaluation' | 'history' | 'revisions' | 'comments'>('title');
  const [activePublication, setActivePublication] = useState<'title' | 'contributors' | 'metadata' | 'references' | 'galleries' | 'jats' | 'permissions' | 'issue'>('title');
  const [currentPage, setCurrentPage] = useState(1);
  const [suggestedReviewers, setSuggestedReviewers] = useState<{ name: string; email: string; expertise: string }[]>([
    { name: 'Dr. Emily Johnson', email: 'emily.johnson@university.edu', expertise: '' },
    { name: 'Dr. Robert Williams', email: 'robert.williams@research.org', expertise: '' }
  ]);
  const [decisionLetter, setDecisionLetter] = useState('');
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT' | null>(null);

  useEffect(() => {
    getReviewerAssignments(manuscript.id).then(setReviewerAssignments);
    getRevisions(manuscript.id).then(setRevisions);
  }, [manuscript.id]);

  const handleEditorDecision = async (decision: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT') => {
    setDecisionType(decision);
    setShowDecisionModal(true);
  };

  const submitEditorDecision = async () => {
    if (!decisionType) return;
    setBusy(true);
    try {
      await publishDecision(manuscript.id, decisionType, decisionLetter);
      setShowDecisionModal(false);
      setDecisionLetter('');
      onChanged();
    } catch (e: any) {
      setError(e.message || 'Failed to submit decision');
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: 'title', label: 'Title & Abstract' },
    { id: 'contributors', label: 'Contributors' },
    { id: 'files', label: 'Files for Review' },
    { id: 'evaluation', label: 'Editor Evaluation' },
    { id: 'history', label: 'Review History' },
    { id: 'revisions', label: 'Revisions' },
    { id: 'comments', label: 'Comments' }
  ];

  return (
    <div className="w-full h-full flex bg-white overflow-hidden">
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto p-6 flex flex-col">
        {/* WORKFLOW */}
        <div className="mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">WORKFLOW</p>
          <div className="space-y-2">
            {[
              { label: 'Submission', done: true },
              { label: 'Review', done: true },
              { label: 'Copyediting', done: false },
              { label: 'Production', done: false }
            ].map((item) => (
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
            {[
              { label: 'Submission Received', date: '12 May 2025', done: true },
              { label: 'Under Editor Review', date: '13 May 2025', done: true },
              { label: 'Peer Review In Progress', done: false },
              { label: 'Editor Decision', done: false },
              { label: 'Production Pending', done: false }
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2">
                {item.done ? (
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-5 h-5 border-2 border-slate-300 rounded-full flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm ${item.done ? 'text-slate-900 font-semibold' : 'text-slate-600'}`}>
                    {item.label}
                  </p>
                  {item.date && <p className="text-xs text-slate-500">{item.date}</p>}
                </div>
              </div>
            ))}
          </div>
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
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>Dashboard</span>
              <span>&gt;</span>
              <span>Editorial Desk</span>
              <span>&gt;</span>
              <span>Manuscripts</span>
              <span>&gt;</span>
              <span className="font-bold text-slate-900">{manuscript.id}</span>
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
            <span className="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-bold">Accepted for Review</span>
            <button className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1">
              📥 Download as Word
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-slate-200 px-8 flex-shrink-0">
          <div className="flex gap-8">
            {tabs.map((tab) => (
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

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* CENTER CONTENT */}
          <div className="flex-1 overflow-y-auto p-8">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">{error}</div>}

            {activePublication !== 'title' && (
              <>
                {activePublication === 'contributors' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Contributors</h2>
                      <div className="space-y-4">
                        <div className="border border-slate-200 rounded-lg p-4">
                          <p className="font-semibold text-slate-900">John Doe</p>
                          <p className="text-sm text-slate-600">Corresponding Author</p>
                          <p className="text-xs text-slate-500 mt-1">Department of Computer Science, University of Example</p>
                          <p className="text-xs text-slate-500">Email: john.doe@example.com</p>
                        </div>
                        <div className="border border-slate-200 rounded-lg p-4">
                          <p className="font-semibold text-slate-900">Jane Smith</p>
                          <p className="text-sm text-slate-600">Co-Author</p>
                          <p className="text-xs text-slate-500 mt-1">Institute of Technology, City, Country</p>
                          <p className="text-xs text-slate-500">Email: jane.smith@tech.org</p>
                        </div>
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
                          <p className="text-slate-900">12 May 2025</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Word Count</p>
                          <p className="text-slate-900">6,245</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Language</p>
                          <p className="text-slate-900">English (US)</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-sm font-semibold text-slate-600 mb-2">Status</p>
                          <p className="text-slate-900">Accepted for Review</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'references' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">References</h2>
                      <div className="space-y-3">
                        <p className="text-slate-700">[1] Author et al. (2023). Title of Reference. Journal Name, 45(3), 234-256.</p>
                        <p className="text-slate-700">[2] Smith, J. (2022). Another Reference. Conference Proceedings, pp. 112-125.</p>
                        <p className="text-slate-700">[3] Johnson & Brown. (2024). Recent Advances. Tech Review, 12(4), 45-67.</p>
                        <p className="text-slate-500 text-sm mt-6">Total References: 34</p>
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'galleries' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Galleries & Figures</h2>
                      <div className="grid grid-cols-2 gap-4">
                        {['Figure 1', 'Figure 2', 'Table 1', 'Table 2'].map((item) => (
                          <div key={item} className="border border-slate-200 rounded-lg p-8 bg-slate-50 flex items-center justify-center">
                            <p className="text-slate-600 font-semibold">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'jats' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">JATS XML</h2>
                      <pre className="bg-slate-50 p-4 rounded border border-slate-200 text-xs overflow-x-auto">
{`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2 20190208//EN"
  "JATS-archivearticle1.dtd">
<article xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:mml="http://www.w3.org/1998/Math/MathML">
  <front>
    <article-meta>
      <title-group>
        <article-title>${manuscript.title}</article-title>
      </title-group>
    </article-meta>
  </front>
</article>`}
                      </pre>
                    </div>
                  </div>
                )}

                {activePublication === 'permissions' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Permissions & Disclosure</h2>
                      <div className="space-y-4">
                        <div className="border border-slate-200 rounded-lg p-4">
                          <p className="font-semibold text-slate-900 mb-2">Conflict of Interest Disclosure</p>
                          <p className="text-sm text-slate-600">✓ All authors have completed and submitted the COI disclosure form.</p>
                        </div>
                        <div className="border border-slate-200 rounded-lg p-4">
                          <p className="font-semibold text-slate-900 mb-2">Copyright Transfer Agreement</p>
                          <p className="text-sm text-slate-600">✓ Copyright transfer agreement signed by all authors.</p>
                        </div>
                        <div className="border border-slate-200 rounded-lg p-4">
                          <p className="font-semibold text-slate-900 mb-2">Data Availability</p>
                          <p className="text-sm text-slate-600">Datasets are available upon request from the corresponding author.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activePublication === 'issue' && (
                  <div className="max-w-4xl">
                    <div className="bg-white border border-slate-200 rounded-lg p-8">
                      <h2 className="text-xl font-bold text-slate-900 mb-6">Issue Assignment</h2>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Target Volume</p>
                          <p className="text-slate-900">Volume 45</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Target Issue</p>
                          <p className="text-slate-900">Issue 3 (2025)</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-600 mb-2">Expected Publication Date</p>
                          <p className="text-slate-900">September 2025</p>
                        </div>
                      </div>
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
                      <h2 className="text-2xl font-bold text-center mb-6">{manuscript.title || 'Securing Decentralized Federated Learning Models Against Sybil Poisoning...'}</h2>
                      <div className="text-center mb-4">
                        <p className="text-sm text-slate-700">John Doe¹, Jane Smith², Michael Brown³</p>
                      </div>
                      <div className="text-center mb-8 text-xs text-slate-600 border-b border-slate-200 pb-6">
                        <p>¹Department of Computer Science, University of Example</p>
                        <p>²Institute of Technology, City, Country</p>
                        <p>³AI Research Lab, Tech University, City, Country</p>
                      </div>
                      <div className="mb-6">
                        <p className="text-sm"><span className="font-semibold">Keywords:</span> <span className="italic text-emerald-600">Federated Learning, Sybil Attack, Model Security, Anomaly Detection, Reputation System</span></p>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-emerald-700 mb-3 uppercase">Abstract</h3>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          Federated Learning (FL) enables collaborative model training across decentralized devices without sharing raw data. However, it is vulnerable to malicious actions. This paper proposes a robust defense mechanism with integrated identity verification, reputation scoring, and anomaly detection to mitigate the impact of such attacks. Experimental results show our approach significantly improves model accuracy and resilience against Sybil attacks in non-IID settings.
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
                  <h3 className="font-bold text-slate-900 mb-4">FILES FOR REVIEW</h3>
                  <div className="space-y-3">
                    {[
                      { name: 'Manuscript.docx', size: '54.2 kB', date: '12 May 2025' },
                      { name: 'Figure_1.png', size: '120.4 kB', date: '12 May 2025' },
                      { name: 'Data_Set.xlsx', size: '32.6 kB', date: '12 May 2025' },
                      { name: 'Supplementary_Material.pdf', size: '245.3 kB', date: '12 May 2025' }
                    ].map((file) => (
                      <div key={file.name} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded hover:bg-emerald-50 cursor-pointer transition">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg">📄</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                            <p className="text-xs text-slate-500">{file.size} • {file.date}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="text-slate-600 hover:text-slate-900 p-1">👁️</button>
                          <button className="text-slate-600 hover:text-slate-900 p-1">📥</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'contributors' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">Manuscript Contributors</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No contributors data available.</div>
              </div>
            )}

            {activeTab === 'files' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">FILES FOR REVIEW</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No files available.</div>
              </div>
            )}

            {activeTab === 'evaluation' && (
              <EditorEvaluationForm assignmentId={assignment.id} onSubmitted={onChanged} />
            )}

            {activeTab === 'history' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">REVIEW HISTORY</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No history available.</div>
              </div>
            )}

            {activeTab === 'revisions' && (
              <RevisionReview manuscriptId={manuscript.id} onStatusUpdate={onChanged} />
            )}

            {activeTab === 'comments' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">COMMENTS</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No comments yet.</div>
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR */}
          <aside className="w-80 bg-slate-50 border-l border-slate-200 overflow-y-auto p-6 flex flex-col">
            {/* DECISION */}
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">DECISION</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleEditorDecision('ACCEPT')}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" /> Accept Manuscript
                </button>
                <button
                  onClick={() => handleEditorDecision('MINOR_REVISION')}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Request Minor Revision
                </button>
                <button
                  onClick={() => handleEditorDecision('MAJOR_REVISION')}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Request Major Revision
                </button>
                <button
                  onClick={() => handleEditorDecision('REJECT')}
                  className="w-full text-red-600 text-xs font-bold py-3 rounded-lg hover:bg-red-50 transition flex items-center justify-center gap-2">
                  <XIcon className="w-4 h-4" /> Decline Submission
                </button>
              </div>
            </div>

            {/* REVIEW ROUND */}
            <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">REVIEW ROUND</p>
                <p className="text-emerald-600 font-bold text-sm">Round 1</p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-600">Status</p>
                  <p className="text-sm font-semibold text-blue-600">In Progress</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Reviewers Assigned</p>
                  <p className="text-sm font-bold text-slate-900">2</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Reviews Completed</p>
                  <p className="text-sm font-bold text-slate-900">0 / 2</p>
                </div>
                <button className="text-xs text-emerald-600 font-bold hover:underline">View Review Progress →</button>
              </div>
            </div>

            {/* SUGGEST PEER REFEREES */}
            <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">SUGGEST PEER REFEREES</p>
              <p className="text-xs text-slate-600 mb-4">Suggest potential reviewers for this manuscript.</p>
              <div className="space-y-3 mb-4">
                <input type="text" placeholder="Reviewer Name" className="w-full text-xs border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-emerald-500" />
                <input type="email" placeholder="Reviewer Email" className="w-full text-xs border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-emerald-500" />
                <input type="text" placeholder="Expertise / Specialization" className="w-full text-xs border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-emerald-500" />
              </div>
              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-2">
                <Plus className="w-3 h-3" /> Add Suggestion
              </button>
            </div>

            {/* SUGGESTED REVIEWERS */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">SUGGESTED REVIEWERS ({suggestedReviewers.length})</p>
              <div className="space-y-3">
                {suggestedReviewers.map((reviewer, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded border border-slate-200 hover:bg-slate-100 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <span>👤</span> {reviewer.name}
                        </p>
                        <p className="text-xs text-slate-600">{reviewer.email}</p>
                      </div>
                      <button className="text-slate-400 hover:text-red-600">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="text-xs text-emerald-600 font-bold hover:underline mt-3">View All Suggestions →</button>
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

function EditorEvaluationForm({ assignmentId, onSubmitted }: { assignmentId: string; onSubmitted: () => void }) {
  const [evalData, setEvalData] = useState<EditorEvalState>({
    scientificMerit: 9,
    noveltyInnovation: 8,
    methodologyQuality: 8,
    validityResults: 8,
    clarityPresentation: 9,
    ethicalStandards: 10,
    overallRecommendation: 0,
    commentsToAuthors: '',
    strengths: '',
    weaknesses: '',
    mandatoryRevisions: '',
    suggestedReviewers: []
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await submitEditorAssessment(assignmentId, {
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
        suggestedReviewers: evalData.suggestedReviewers.filter(r => r.name.trim() && r.email.trim())
      });
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
                  onClick={() => updateScore(key as any, score)}
                  className={`w-8 h-8 rounded font-bold text-xs transition ${
                    evalData[key as any] === score ? 'bg-[#008751] text-white' : 'bg-slate-100 hover:bg-slate-200'
                  }`}
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
          <textarea value={evalData.commentsToAuthors} onChange={(e) => updateText('commentsToAuthors', e.target.value)} placeholder="Comments to Authors" className="w-full text-xs border border-slate-200 rounded px-3 py-2" rows={3} />
          <textarea value={evalData.strengths} onChange={(e) => updateText('strengths', e.target.value)} placeholder="Strengths" className="w-full text-xs border border-slate-200 rounded px-3 py-2" rows={2} />
          <textarea value={evalData.weaknesses} onChange={(e) => updateText('weaknesses', e.target.value)} placeholder="Weaknesses" className="w-full text-xs border border-slate-200 rounded px-3 py-2" rows={2} />
          <textarea value={evalData.mandatoryRevisions} onChange={(e) => updateText('mandatoryRevisions', e.target.value)} placeholder="Mandatory Revisions" className="w-full text-xs border border-slate-200 rounded px-3 py-2" rows={2} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-black text-slate-900">SUGGEST PEER REFEREES</h3>
          <button onClick={addReviewer} className="text-[#008751] text-xs font-bold flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {evalData.suggestedReviewers.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No reviewers added yet</p>
        ) : (
          <div className="space-y-2">
            {evalData.suggestedReviewers.map((r, i) => (
              <div key={i} className="border border-slate-200 rounded p-3">
                <p className="text-xs font-bold text-slate-900">{r.name}</p>
                <p className="text-xs text-slate-500">{r.email}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button className="flex-1 bg-white border border-slate-300 text-slate-900 text-xs font-bold py-3 rounded-lg">
          Save Draft
        </button>
        <button disabled={busy} onClick={submit} className="flex-1 bg-[#008751] text-white text-xs font-bold py-3 rounded-lg disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
          SUBMIT EVALUATION
        </button>
      </div>
    </div>
  );
}
