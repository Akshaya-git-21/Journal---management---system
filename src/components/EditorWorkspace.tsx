import { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, getRevisions, subscribeToManuscripts,
  respondToEditorAssignment, submitEditorAssessment, submitEditorRecommendation
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, Check, X as XIcon, Plus, Trash2, ChevronDown, Clock, AlertCircle, Archive, CheckCircle, FileText, Settings } from 'lucide-react';

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

  // If a manuscript is selected, show full-page detail view
  if (selected) {
    return <AssignmentDetail row={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} />;
  }

  return (
    <div className="w-full h-screen bg-slate-50 flex font-sans overflow-hidden">
      {/* Dark Green Sidebar */}
      <aside className="w-80 bg-[#1a4038] text-white flex flex-col overflow-y-auto shadow-lg border-r border-[#0f3f37]">
        {/* User Info */}
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

        {/* Navigation Sections */}
        <nav className="flex-1 p-4 space-y-3 overflow-y-auto">
          {/* SUBMISSIONS Section */}
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

          {/* REVIEW STAGES Section */}
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

          {/* COPYEDIT & PRODUCTION Section */}
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

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
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

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Stats Cards */}
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

          {/* Checklist Card */}
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

          {/* Main Content */}
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

          {/* Feature Highlights */}
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

function AssignmentDetail({ row, onBack, onChanged }: { row: Row; onBack: () => void; onChanged: () => void }) {
  const { manuscript, assignment } = row;
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewRounds, setReviewRounds] = useState(1);
  const [suggestedReviewers, setSuggestedReviewers] = useState<{name: string; email: string}[]>([]);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [manuscriptStatus, setManuscriptStatus] = useState(manuscript.status);

  useEffect(() => {
    getReviewerAssignments(manuscript.id).then(setReviewerAssignments);
    getRevisions(manuscript.id).then(setRevisions);
  }, [manuscript.id]);

  const respond = async (accept: boolean) => {
    setBusy(true); setError('');
    try { await respondToEditorAssignment(assignment.id, accept); onChanged(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const allReviewsIn = reviewerAssignments.length > 0 && reviewerAssignments.every((r) => r.status === 'SUBMITTED' || r.status === 'DECLINED');

  return (
    <div className="w-full h-full flex flex-col -mx-8 -my-8 bg-white">
      {/* Dark Green Header */}
      <div className="bg-[#1a4038] text-white px-8 py-4 flex items-center justify-between shrink-0 border-b-4 border-[#008751]">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-emerald-300 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-emerald-300">{manuscript.id}</span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-1 rounded font-bold uppercase">LEVELAGE</span>
            <h1 className="text-lg font-black">{manuscript.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-emerald-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold">
            📋 Activity Log
          </button>
          <button className="text-emerald-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold">
            📚 Library
          </button>
        </div>
      </div>

      {/* Three-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Workflow */}
        <div className="w-80 bg-slate-50 border-r border-slate-200 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">WORKFLOW</p>
              <div className="space-y-2">
                {[
                  { label: 'Submission', done: true },
                  { label: 'Review', done: true },
                  { label: 'Copyediting', done: false },
                  { label: 'Production', done: false }
                ].map((step) => (
                  <div key={step.label} className="flex items-center gap-2 text-sm">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${step.done ? 'bg-emerald-100 border-emerald-300' : 'border-slate-300 bg-white'}`}>
                      {step.done && <Check className="w-3 h-3 text-emerald-600" />}
                    </div>
                    <span className={step.done ? 'text-slate-700 font-semibold' : 'text-slate-500'}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">PUBLICATION</p>
              <div className="space-y-2">
                {['Title & Abstract', 'Contributors', 'Metadata', 'References', 'Galleys', 'JATS XML', 'Permissions & Disclosure', 'Issue'].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-slate-700 font-semibold">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">NEED HELP?</p>
              <p className="text-xs text-slate-600">Read our editor guidelines or contact support.</p>
              <button className="text-emerald-600 text-xs font-bold mt-2 hover:text-emerald-700">View Guidelines →</button>
            </div>
          </div>
        </div>

        {/* Center Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">{error}</div>}

          {/* Decision Phase */}
          <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-2xl p-6 border-2 border-emerald-600">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-200 mb-2">INTAKE SCREENING PHASE</p>
                <h2 className="text-xl font-black">Initial Desk Screening & Intake Decisions</h2>
              </div>
              <span className="bg-emerald-500/30 text-emerald-100 text-xs px-3 py-1 rounded-full font-bold">Ready for Desk Evaluation</span>
            </div>
            <p className="text-sm text-emerald-100 mb-4">{manuscript.abstract}</p>
            <div className="flex gap-3">
              <button className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-5 py-2.5 rounded-lg transition flex items-center gap-1.5">
                ✓ Desk Accept Manuscript
              </button>
              <button className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition">
                Send to Peer Review
              </button>
              <button className="bg-red-500/20 hover:bg-red-500/30 text-red-100 text-xs font-bold px-5 py-2.5 rounded-lg transition">
                Desk Reject Manuscript
              </button>
            </div>
          </div>

          {/* Suggest Peer Referees */}
          <div className="bg-white border border-emerald-200/50 rounded-2xl p-6">
            <h3 className="text-sm font-black text-slate-900 mb-4">👥 SUGGEST PEER REFEREES</h3>
            <div className="space-y-3 mb-4">
              <input type="text" placeholder="Reviewer Name" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} className="w-full text-xs border border-slate-200 rounded px-3 py-2" />
              <input type="email" placeholder="Reviewer Email" value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} className="w-full text-xs border border-slate-200 rounded px-3 py-2" />
              <button onClick={() => { if(reviewerName && reviewerEmail) { setSuggestedReviewers([...suggestedReviewers, {name: reviewerName, email: reviewerEmail}]); setReviewerName(''); setReviewerEmail(''); } }} className="w-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold py-2 rounded-lg transition">
                + Add Suggestion
              </button>
            </div>
            {suggestedReviewers.length > 0 && (
              <div className="space-y-2">
                {suggestedReviewers.map((r, i) => (
                  <div key={i} className="text-xs p-2 bg-slate-50 rounded border border-slate-200 flex justify-between items-center">
                    <span>{r.name} ({r.email})</span>
                    <button onClick={() => setSuggestedReviewers(suggestedReviewers.filter((_, j) => j !== i))} className="text-red-500">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Files for Review */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h3 className="text-sm font-black text-slate-900 mb-4">FILES FOR REVIEW</h3>
            {viewingFile ? (
              <div className="bg-slate-100 p-6 rounded-lg mb-4 relative">
                <button onClick={() => setViewingFile(null)} className="absolute top-2 right-2 text-2xl text-slate-500 hover:text-slate-700">×</button>
                <p className="text-xs text-slate-600 mb-2">Viewing: {viewingFile}</p>
                <div className="bg-white p-8 rounded border border-slate-300 text-center text-slate-500 min-h-96">
                  [Document Preview: {viewingFile}]
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              {['Figure.docx', 'Submission_PKP Image.jpg', 'Data_Set.docx', 'Article_Text_Submission.pdf'].map((file) => (
                <div key={file} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-sm text-slate-700">{file}</span>
                  <button onClick={() => setViewingFile(file)} className="text-emerald-600 text-xs font-bold hover:text-emerald-700">View & Read</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Decision Desk */}
        <div className="w-72 bg-slate-50 border-l border-slate-200 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">DECISION DESK</h3>
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded-full font-bold">ACTIVE</span>
            </div>

            <button onClick={() => { setManuscriptStatus('ACCEPTED'); setBusy(false); }} disabled={busy} className="w-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold py-3 rounded-lg transition disabled:opacity-50">
              Accept Submission
            </button>
            <button onClick={() => setReviewRounds(r => r + 1)} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-900 text-xs font-bold py-3 rounded-lg transition">
              Create Review Round {reviewRounds + 1}
            </button>
            <button onClick={() => setManuscriptStatus('REJECTED')} className="w-full text-red-600 hover:text-red-700 text-xs font-bold py-3 rounded-lg transition">
              Decline Submission
            </button>

            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">STATUS TRACKING</p>
              <div className="space-y-1 text-[10px] text-slate-600">
                <p>Manuscript: <span className="font-bold text-slate-900">{manuscriptStatus}</span></p>
                <p>Review Rounds: <span className="font-bold text-slate-900">{reviewRounds}</span></p>
                <p>Suggested Reviewers: <span className="font-bold text-slate-900">{suggestedReviewers.length}</span></p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">OVERRIDE / DECISION NOTES:</p>
              <textarea
                placeholder="E.g. Please address referee comments in Section 5"
                className="w-full text-xs border border-slate-200 rounded p-2 focus:border-emerald-500 focus:outline-none"
                rows={4}
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">PARTICIPANTS</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold">U</div>
                  <div>
                    <p className="font-semibold text-slate-900">Unassigned</p>
                    <p className="text-slate-500">Assigned Editor</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ScoreState {
  scientificMerit: number; noveltyInnovation: number; methodologyQuality: number;
  literatureAdequacy: number; ethicalCompliance: number; dataReliability: number; writingQuality: number;
}

function EvaluationForm({ assignmentId, onSubmitted }: { assignmentId: string; onSubmitted: () => void }) {
  const [scores, setScores] = useState<ScoreState>({
    scientificMerit: 7, noveltyInnovation: 7, methodologyQuality: 7, literatureAdequacy: 7, ethicalCompliance: 7, dataReliability: 7, writingQuality: 7
  });
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [mandatoryRevisions, setMandatoryRevisions] = useState('');
  const [commentsToCoordinator, setCommentsToCoordinator] = useState('');
  const [suggested, setSuggested] = useState<{ name: string; email: string; note: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setScore = (key: keyof ScoreState, value: number) => setScores((s) => ({ ...s, [key]: value }));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await submitEditorAssessment(assignmentId, {
        ...scores, strengths, weaknesses, mandatoryRevisions, commentsToCoordinator,
        suggestedReviewers: suggested.filter((s) => s.name.trim())
      });
      onSubmitted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const scoreFields: [keyof ScoreState, string][] = [
    ['scientificMerit', 'Scientific Merit'], ['noveltyInnovation', 'Novelty / Innovation'], ['methodologyQuality', 'Methodology'],
    ['literatureAdequacy', 'Literature Adequacy'], ['ethicalCompliance', 'Ethical Compliance'], ['dataReliability', 'Data Reliability'], ['writingQuality', 'Writing Quality']
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
      <h3 className="text-sm font-black text-slate-900">Editor Evaluation</h3>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2">{error}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {scoreFields.map(([key, label]) => (
          <div key={key}>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</label>
            <input type="number" min={1} max={10} value={scores[key]} onChange={(e) => setScore(key, Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        ))}
      </div>
      <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} placeholder="Strengths" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <textarea value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} rows={2} placeholder="Weaknesses" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <textarea value={mandatoryRevisions} onChange={(e) => setMandatoryRevisions(e.target.value)} rows={2} placeholder="Mandatory revisions (if any)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <textarea value={commentsToCoordinator} onChange={(e) => setCommentsToCoordinator(e.target.value)} rows={2} placeholder="Comments to Coordinator" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-slate-600">Suggested Reviewers</label>
          <button onClick={() => setSuggested([...suggested, { name: '', email: '', note: '' }])} className="text-[11px] font-bold text-[#008751] cursor-pointer flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
        </div>
        <div className="space-y-2">
          {suggested.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <input value={s.name} onChange={(e) => setSuggested(suggested.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <input value={s.email} onChange={(e) => setSuggested(suggested.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} placeholder="Email" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <div className="flex gap-1">
                <input value={s.note} onChange={(e) => setSuggested(suggested.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} placeholder="Note" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1" />
                <button onClick={() => setSuggested(suggested.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button disabled={busy} onClick={submit} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-5 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit Assessment to Coordinator
      </button>
    </div>
  );
}

function RecommendationForm({ busy, onSubmit }: { busy: boolean; onSubmit: (rec: ReviewerRecommendation) => void }) {
  const [rec, setRec] = useState<ReviewerRecommendation>('MINOR_REVISION');
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-3">Submit Your Recommendation</h3>
      <select value={rec} onChange={(e) => setRec(e.target.value as ReviewerRecommendation)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs mb-3">
        <option value="ACCEPT">Accept</option>
        <option value="MINOR_REVISION">Minor Revision</option>
        <option value="MAJOR_REVISION">Major Revision</option>
        <option value="REJECT">Reject</option>
      </select>
      <button disabled={busy} onClick={() => onSubmit(rec)} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Recommendation'}
      </button>
    </div>
  );
}
