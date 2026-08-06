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

  if (selected) {
    return <AssignmentDetail row={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} />;
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

function AssignmentDetail({ row, onBack, onChanged }: { row: Row; onBack: () => void; onChanged: () => void }) {
  const { manuscript, assignment } = row;
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'title' | 'contributors' | 'files' | 'evaluation' | 'history' | 'comments'>('title');

  useEffect(() => {
    getReviewerAssignments(manuscript.id).then(setReviewerAssignments);
    getRevisions(manuscript.id).then(setRevisions);
  }, [manuscript.id]);

  const tabs = [
    { id: 'title', label: 'Title & Abstract' },
    { id: 'contributors', label: 'Contributors' },
    { id: 'files', label: 'Files for Review' },
    { id: 'evaluation', label: 'Editor Evaluation' },
    { id: 'history', label: 'Review History' },
    { id: 'comments', label: 'Comments' }
  ];

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden">
      <div className="bg-[#1a4038] text-white px-8 py-4 flex items-center justify-between shrink-0 border-b-4 border-[#008751]">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button onClick={onBack} className="text-emerald-300 hover:text-white transition flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-bold text-emerald-300 flex-shrink-0">{manuscript.id}</span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-1 rounded font-bold uppercase flex-shrink-0">Accepted for Review</span>
            <h1 className="text-lg font-black truncate">{manuscript.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button className="text-emerald-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold">
            📋 Activity Log
          </button>
          <button className="text-emerald-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold">
            📚 Library
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-8 flex-shrink-0">
        <div className="flex gap-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-2 py-4 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
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
        <div className="w-80 bg-slate-50 border-r border-slate-200 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">Referrer</p>
              <p className="text-sm font-semibold text-slate-900">Dr. Richard Hamming</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">STATUS</p>
              <p className="text-sm font-bold text-emerald-600">Accepted for Review</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">REVIEW ROUND</p>
              <p className="text-2xl font-black text-slate-900">Round 1</p>
              <p className="text-xs text-slate-500 mt-1">2 Reviewers Assigned</p>
              <p className="text-xs text-slate-500">0 / 2 Completed</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">{error}</div>}

          {activeTab === 'title' && (
            <div className="max-w-4xl">
              <div className="bg-white border border-slate-200 rounded-2xl p-8">
                <h2 className="text-2xl font-black text-slate-900 mb-4">{manuscript.title}</h2>
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Abstract</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">{manuscript.abstract}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contributors' && (
            <div className="max-w-4xl">
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">Manuscript Contributors</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No contributors data available.</div>
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="max-w-4xl">
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">FILES FOR REVIEW</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No files available.</div>
              </div>
            </div>
          )}

          {activeTab === 'evaluation' && (
            <div className="max-w-4xl">
              <EditorEvaluationForm assignmentId={assignment.id} onSubmitted={onChanged} />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-4xl">
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">REVIEW HISTORY</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No history available.</div>
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="max-w-4xl">
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-black text-slate-900 mb-4">COMMENTS</h3>
                <div className="text-center py-8 text-slate-400 text-sm">No comments yet.</div>
              </div>
            </div>
          )}
        </div>

        <div className="w-72 bg-slate-50 border-l border-slate-200 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">DECISION DESK</h3>
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded-full font-bold">ACTIVE</span>
            </div>
            <button className="w-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold py-3 rounded-lg transition">
              Accept Submission
            </button>
            <button className="w-full bg-slate-200 hover:bg-slate-300 text-slate-900 text-xs font-bold py-3 rounded-lg transition">
              Create New Review Round
            </button>
            <button className="w-full text-red-600 hover:text-red-700 text-xs font-bold py-3 rounded-lg transition">
              Decline Submission
            </button>
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">DECISION NOTES:</p>
              <textarea
                placeholder="E.g. Please address referee comments..."
                className="w-full text-xs border border-slate-200 rounded p-2 focus:border-emerald-500 focus:outline-none"
                rows={4}
              />
            </div>
          </div>
        </div>
      </div>
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
