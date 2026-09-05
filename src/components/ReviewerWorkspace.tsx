import React, { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, ReviewerAssignmentRow, ManuscriptFileRow, ScreeningResponse, RevisionRow,
  listManuscripts, getReviewerAssignments, subscribeToManuscripts,
  respondToReviewInvite, submitPeerReview, getManuscriptFiles, getRevisions, getRevisionFiles
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { getManuscriptStatusLabel } from '../lib/manuscriptStatusLabel';
import { NavGroup, NavItem } from './SidebarNavGroup';
import FilePreviewModal from './FilePreviewModal';
import {
  Loader2, Check, X as XIcon, ChevronDown, User, AlertTriangle, ClipboardList, CheckCircle2, XCircle,
  FileText, Lock, Eye, History, Star, BarChart3, Download, ClipboardCheck
} from 'lucide-react';

const PEER_REVIEW_QUESTIONS: { id: string; label: string; question: string }[] = [
  { id: 'focus_scope_relevance', label: 'Focus, Scope, and Relevance', question: 'Does this manuscript explicitly match the research parameters and technical domain of this journal?' },
  { id: 'theoretical_novelty', label: 'Theoretical Novelty', question: 'Does the study introduce distinct data insights, experimental approaches, or practical advancements that set it apart from prior publications?' },
  { id: 'methodology_soundness', label: 'Methodology Soundness', question: 'Are the experimental designs, control variables, collection systems, and frameworks execution-sound and free from logical error?' },
  { id: 'replicability_check', label: 'Replicability Check', question: 'Is the explanation in the methods section detailed enough for an independent lab to reproduce the exact experiment?' },
  { id: 'structured_completeness', label: 'Structured Completeness', question: 'Are all core structural requirements -- including full data tables, high-resolution figures, and necessary abstract fields -- fully embedded?' },
  { id: 'data_integrity', label: 'Data Integrity', question: 'Are the reported outcomes, statistical values, and graphs logically consistent across all body text and visual metrics?' },
  { id: 'references_relevance', label: 'References Relevance', question: 'Are the cited references accurate, complete, up-to-date, and balanced without showing excessive author self-citations?' },
  { id: 'ethical_attestation', label: 'Ethical Attestation', question: 'Does the text include explicit ethical approval numbers, trial registrations, or relevant human/animal participant safety declarations?' },
  { id: 'structural_clarity', label: 'Structural Clarity', question: 'Is the level of language, sentence flow, and argument layout clear enough to communicate the scientific intent to the global field?' },
  { id: 'conclusion_justification', label: 'Conclusion Justification', question: 'Do the final discussion claims align directly with the verified parameters of the collected data trends?' },
];

interface ReviewerWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (m: any) => void;
  currentUser?: { name: string; email: string; role: Role } | null;
}

interface Row { manuscript: ManuscriptRow; assignment: ReviewerAssignmentRow; priorRounds: ReviewerAssignmentRow[]; }

const TAB_META: Record<string, { title: string; subtitle: string }> = {
  ACTION_REQUIRED: { title: 'Action Required Assignments', subtitle: 'Select items below to accept, decline, or compose consensus reviews.' },
  ALL: { title: 'All Assignments', subtitle: 'Every manuscript you have ever been invited to review.' },
  COMPLETED: { title: 'Completed Reviews', subtitle: 'Reviews you have submitted, now locked for editing.' },
  DECLINED: { title: 'Declined Reports', subtitle: 'Invitations you declined to review.' },
  PUBLISHED: { title: 'Published Papers', subtitle: 'Manuscripts you reviewed that have since been published.' },
  CLOSED: { title: 'Closed Records', subtitle: 'Manuscripts you reviewed that were ultimately rejected.' },
  INVITES: { title: 'Active Review Invites', subtitle: 'Invitations awaiting your accept/decline response.' },
  HISTORY: { title: 'Historic Logs', subtitle: 'A timeline of every action recorded against your assignments.' },
  RUBRIC: { title: 'Scoring Rubric', subtitle: 'The evaluation criteria used when compiling a review.' },
  PERFORMANCE: { title: 'Performance Score', subtitle: 'Your review activity, computed from your real assignment history.' },
};

export default function ReviewerWorkspace({ currentUser }: ReviewerWorkspaceProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTION_REQUIRED' | 'ALL' | 'COMPLETED' | 'DECLINED' | 'PUBLISHED' | 'CLOSED' | 'INVITES' | 'HISTORY' | 'RUBRIC' | 'PERFORMANCE'>('ACTION_REQUIRED');
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({ assignments: true, status: true, modules: true });
  const toggleNavGroup = (key: string) => setExpandedNavGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const load = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const manuscripts = await listManuscripts();
      const withAssignments: Row[] = [];
      for (const m of manuscripts) {
        const assignments = await getReviewerAssignments(m.id);
        // A re-review round (Phase 2 Checkpoint C) creates a new
        // reviewer_assignments row per manuscript_revisions cycle -- the
        // most recent one (highest revision_number) is the one the reviewer
        // should act on; earlier rounds are kept as read-only context.
        const mine = assignments
          .filter((a) => a.reviewer_id === data.user?.id)
          .sort((a, b) => b.revision_number - a.revision_number);
        if (mine.length > 0) withAssignments.push({ manuscript: m, assignment: mine[0], priorRounds: mine.slice(1) });
      }
      setRows(withAssignments);
    } finally {
      setLoading(false);
    }
  };

  const counts = {
    actionRequired: rows.filter((r) => r.assignment.status === 'INVITED' || r.assignment.status === 'ACCEPTED').length,
    total: rows.length,
    completed: rows.filter((r) => r.assignment.status === 'SUBMITTED').length,
    declined: rows.filter((r) => r.assignment.status === 'DECLINED').length,
    published: rows.filter((r) => r.manuscript.status === 'PUBLISHED').length,
    closed: rows.filter((r) => r.manuscript.status === 'REJECTED').length,
    invites: rows.filter((r) => r.assignment.status === 'INVITED').length,
  };

  const filteredRows = rows.filter((row) => {
    switch (activeTab) {
      case 'ACTION_REQUIRED':
        return row.assignment.status === 'INVITED' || row.assignment.status === 'ACCEPTED';
      case 'COMPLETED':
        return row.assignment.status === 'SUBMITTED';
      case 'DECLINED':
        return row.assignment.status === 'DECLINED';
      case 'PUBLISHED':
        return row.manuscript.status === 'PUBLISHED';
      case 'CLOSED':
        return row.manuscript.status === 'REJECTED';
      case 'ALL':
      default:
        return true;
    }
  });

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  const selected = rows.find((r) => r.manuscript.id === selectedManuscriptId) || null;

  const menuItems = [
    { id: 'ACTION_REQUIRED' as const, label: 'Action Required', count: counts.actionRequired, icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'ALL' as const, label: 'All Assignments', count: counts.total, icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'COMPLETED' as const, label: 'Completed', count: counts.completed, icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'DECLINED' as const, label: 'Declined Reports', count: counts.declined, icon: <XCircle className="w-4 h-4" /> },
    { id: 'PUBLISHED' as const, label: 'Published Papers', count: counts.published, icon: <FileText className="w-4 h-4" /> },
    { id: 'CLOSED' as const, label: 'Closed Records', count: counts.closed, icon: <Lock className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 bg-[#00170f] md:border-r border-[#002116] p-4 md:min-h-screen md:sticky md:top-0 md:max-h-screen md:overflow-y-auto shrink-0">
        {/* Profile Card */}
        <div className="rounded-3xl border border-[#00311f] bg-[#001d14] p-5 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#008751]/15 border border-[#008751]/30 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-sm leading-tight text-white">{currentUser?.name || 'Reviewer'}</h3>
              <p className="text-emerald-300 text-xs font-bold uppercase tracking-wide">ASSIGNED VALIDATOR</p>
            </div>
          </div>
          <div className="space-y-3 border-t border-white/10 pt-3">
            <div>
              <p className="text-emerald-100/60 text-[11px] uppercase tracking-wider font-semibold mb-1">Active Dummy Reviewer Persona:</p>
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-100">
                <span>{currentUser?.name || 'Reviewer'}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-auto" />
              </div>
            </div>
            <div className="pt-2 border-t border-white/10">
              <p className="text-emerald-100/60 text-[11px] uppercase tracking-wider font-semibold mb-1">Reviews Filed:</p>
              <p className="text-2xl font-black text-emerald-300">{counts.completed} <span className="text-xs text-emerald-200/70 font-semibold">Complete</span></p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <div className="space-y-3">
          <NavGroup title="My Active Assignments" icon={<AlertTriangle className="w-4 h-4" />} expanded={expandedNavGroups.assignments} onToggle={() => toggleNavGroup('assignments')}>
            {menuItems.slice(0, 2).map((item) => (
              <NavItem key={item.id} icon={item.icon} label={item.label} count={item.count} active={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
            ))}
          </NavGroup>

          <NavGroup title="Review Status" icon={<CheckCircle2 className="w-4 h-4" />} expanded={expandedNavGroups.status} onToggle={() => toggleNavGroup('status')}>
            {menuItems.slice(2).map((item) => (
              <NavItem key={item.id} icon={item.icon} label={item.label} count={item.count} active={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
            ))}
          </NavGroup>

          <NavGroup title="Additional Modules" icon={<Star className="w-4 h-4" />} expanded={expandedNavGroups.modules} onToggle={() => toggleNavGroup('modules')}>
            {([
              { id: 'INVITES' as const, label: 'Active Review Invites', count: counts.invites, icon: <Eye className="w-4 h-4" /> },
              { id: 'HISTORY' as const, label: 'Historic Logs', count: 0, icon: <History className="w-4 h-4" /> },
              { id: 'RUBRIC' as const, label: 'Scoring Rubric', count: 0, icon: <Star className="w-4 h-4" /> },
              { id: 'PERFORMANCE' as const, label: 'Performance Score', count: 0, icon: <BarChart3 className="w-4 h-4" /> },
            ]).map((item) => (
              <NavItem key={item.id} icon={item.icon} label={item.label} count={item.count} active={activeTab === item.id} onClick={() => { setActiveTab(item.id); setSelectedManuscriptId(null); }} />
            ))}
          </NavGroup>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="max-w-none">
          <h1 className="text-2xl font-black text-slate-900 mb-1">{TAB_META[activeTab].title}</h1>
          <p className="text-sm text-slate-500 font-semibold mb-6">{TAB_META[activeTab].subtitle}</p>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          ) : selected ? (
            <ManuscriptDetail row={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} />
          ) : activeTab === 'INVITES' ? (
            <ManuscriptList rows={rows.filter((r) => r.assignment.status === 'INVITED')} onOpen={setSelectedManuscriptId} />
          ) : activeTab === 'HISTORY' ? (
            <HistoryLog rows={rows} />
          ) : activeTab === 'RUBRIC' ? (
            <ScoringRubricReference />
          ) : activeTab === 'PERFORMANCE' ? (
            <PerformanceScoreScreen rows={rows} />
          ) : (
            <ManuscriptList rows={filteredRows} onOpen={setSelectedManuscriptId} />
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryLog({ rows }: { rows: Row[] }) {
  type Event = { manuscriptId: string; title: string; label: string; at: string };
  const events: Event[] = [];
  for (const { manuscript, assignment } of rows) {
    if (assignment.invited_at) events.push({ manuscriptId: manuscript.id, title: manuscript.title, label: 'Invited to review', at: assignment.invited_at });
    if (assignment.responded_at) events.push({ manuscriptId: manuscript.id, title: manuscript.title, label: assignment.status === 'DECLINED' ? 'Declined invitation' : 'Accepted invitation', at: assignment.responded_at });
    if (assignment.submitted_at) events.push({ manuscriptId: manuscript.id, title: manuscript.title, label: 'Review submitted', at: assignment.submitted_at });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  if (events.length === 0) {
    return <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-400">No recorded activity yet.</div>;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
      {events.map((e, idx) => (
        <div key={idx} className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{e.label}</p>
            <p className="text-xs text-slate-500 truncate">{e.title} • {e.manuscriptId}</p>
          </div>
          <span className="text-xs text-slate-400 shrink-0">{new Date(e.at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function ScoringRubricReference() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <p className="text-xs text-slate-500 mb-5">These are the exact questions used in the review questionnaire when you review a manuscript. Each requires a Yes/No answer and a reason.</p>
      <div className="space-y-4">
        {PEER_REVIEW_QUESTIONS.map((q, idx) => (
          <div key={q.id} className="border-b border-slate-100 pb-4 last:border-b-0">
            <p className="text-xs font-black text-slate-900">{idx + 1}. {q.label}</p>
            <p className="text-xs text-slate-600 mt-0.5">{q.question}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceScoreScreen({ rows }: { rows: Row[] }) {
  const invited = rows.length;
  const responded = rows.filter((r) => r.assignment.status !== 'INVITED').length;
  const accepted = rows.filter((r) => ['ACCEPTED', 'SUBMITTED'].includes(r.assignment.status)).length;
  const declined = rows.filter((r) => r.assignment.status === 'DECLINED').length;
  const completed = rows.filter((r) => r.assignment.status === 'SUBMITTED').length;
  const acceptanceRate = responded > 0 ? Math.round((accepted / responded) * 100) : 0;
  const completionRate = accepted > 0 ? Math.round((completed / accepted) * 100) : 0;

  const turnaroundDays = rows
    .filter((r) => r.assignment.status === 'SUBMITTED' && r.assignment.submitted_at && r.assignment.responded_at)
    .map((r) => (new Date(r.assignment.submitted_at!).getTime() - new Date(r.assignment.responded_at!).getTime()) / 86400000);
  const avgTurnaround = turnaroundDays.length > 0 ? (turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Total Invitations</p>
          <p className="text-2xl font-black text-slate-900">{invited}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Acceptance Rate</p>
          <p className="text-2xl font-black text-slate-900">{acceptanceRate}%</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Completion Rate</p>
          <p className="text-2xl font-black text-slate-900">{completionRate}%</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Declined</p>
          <p className="text-2xl font-black text-slate-900">{declined}</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Average Turnaround (Accept → Submit)</p>
        <p className="text-2xl font-black text-slate-900">{avgTurnaround !== null ? `${avgTurnaround} days` : 'Not enough data yet'}</p>
      </div>
    </div>
  );
}

function ManuscriptList({ rows, onOpen }: { rows: Row[]; onOpen: (id: string) => void }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (e: React.MouseEvent, manuscriptId: string) => {
    e.stopPropagation();
    setDownloading(manuscriptId);
    try {
      // In a real implementation, this would download the manuscript file
      // For now, just show a success message
      setTimeout(() => {
        alert(`Downloading manuscript ${manuscriptId}...`);
        setDownloading(null);
      }, 1000);
    } catch (error) {
      console.error('Download failed:', error);
      setDownloading(null);
    }
  };

  if (rows.length === 0) {
    return <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-400">No assignments in this category.</div>;
  }

  return (
    <div className="space-y-4">
      {rows.map(({ manuscript, assignment }) => (
        <div
          key={manuscript.id}
          className="bg-white border border-slate-200 rounded-xl p-6 hover:border-[#008751] hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between gap-6 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{manuscript.id}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  assignment.status === 'INVITED' ? 'bg-amber-100 text-amber-700' :
                  assignment.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-700' :
                  assignment.status === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {assignment.status === 'INVITED' ? (assignment.revision_number > 0 ? `ASSIGNMENT STATUS: REVISION ${assignment.revision_number} - RE-REVIEW` : 'ASSIGNMENT STATUS: INVITED') :
                   assignment.status === 'ACCEPTED' ? 'ASSIGNMENT STATUS: ACCEPTED FOR REVIEW' :
                   assignment.status === 'SUBMITTED' ? 'REVIEW SUBMITTED' :
                   'DECLINED'}
                </span>
              </div>
              <h3 className="font-black text-lg text-slate-900 mb-2 leading-tight">{manuscript.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">{manuscript.abstract?.substring(0, 200)}...</p>

              {/* Metadata Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4 pb-4 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-slate-500 font-semibold mb-1">Manuscript Status</p>
                  <p className="text-slate-900 font-bold">{getManuscriptStatusLabel(manuscript)}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold mb-1">Double-Blind Status</p>
                  <p className="text-emerald-700 font-bold flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Double-Blind Seal Active</p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold mb-1">Assigned Date</p>
                  <p className="text-slate-900 font-bold">{assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold mb-1">Due Date</p>
                  <p className="text-red-700 font-bold">{assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'TBD'}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons Column */}
            <div className="flex flex-col gap-2 min-w-max">
              {/* No manuscript access before the reviewer accepts the
                  invitation -- see Phase 2 spec ("Reviewer login shows
                  manuscript info only... before accepting"). Found live: this
                  download button ignored that and was clickable while still
                  INVITED. */}
              {assignment.status !== 'INVITED' && (
                <button
                  onClick={(e) => handleDownload(e, manuscript.id)}
                  disabled={downloading === manuscript.id}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
                >
                  {downloading === manuscript.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Download Manuscript
                </button>
              )}
              {(assignment.status === 'INVITED' || assignment.status === 'ACCEPTED') && (
                <button
                  onClick={() => onOpen(manuscript.id)}
                  className="px-4 py-2 bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs rounded-lg transition-all whitespace-nowrap"
                >
                  {assignment.status === 'INVITED' ? 'View Invitation' : 'View Assignment'}
                </button>
              )}
              {assignment.status === 'SUBMITTED' && (
                <button
                  onClick={() => onOpen(manuscript.id)}
                  className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold text-xs rounded-lg transition-all whitespace-nowrap"
                >
                  View Review
                </button>
              )}
            </div>
          </div>

          {assignment.status === 'ACCEPTED' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-bold text-blue-900">📝 Review Evaluation Pending Submission</p>
              <p className="text-xs text-blue-800 mt-1">This manuscript is waiting for your manual scholarly critique. Please review the blinded PDF thoroughly and compile your assessment score indices, recommendation and reports.</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Read-only summary of the reviewer's own earlier round(s) on this
// manuscript -- shown when re-reviewing a revision (Phase 2 Checkpoint C)
// so the reviewer can see what they said last time before evaluating the
// changes.
function PriorRoundsContext({ priorRounds }: { priorRounds: ReviewerAssignmentRow[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sorted = [...priorRounds].sort((a, b) => a.revision_number - b.revision_number);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      {sorted.map((r) => (
        <div key={r.id} className="border-b border-slate-200 last:border-b-0">
          <button
            type="button"
            onClick={() => setExpanded(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 transition"
          >
            <span className="text-xs font-bold text-slate-700">
              Your Previous Review — {r.revision_number === 0 ? 'Original Submission' : `Revision ${r.revision_number}`}
            </span>
            <span className="text-xs font-bold text-slate-500">{r.recommendation?.replace(/_/g, ' ') || r.status} {expanded[r.id] ? '▲' : '▼'}</span>
          </button>
          {expanded[r.id] && (
            <div className="px-4 pb-4 space-y-2">
              {(r.screening_responses || []).map((resp, idx) => {
                const meta = PEER_REVIEW_QUESTIONS.find(q => q.id === resp.question_id);
                return (
                  <div key={resp.question_id} className="bg-white border border-slate-200 rounded p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-slate-800">{idx + 1}. {meta?.label || resp.question_id}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${resp.answer ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {resp.answer ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {resp.reason && <p className="text-xs text-slate-600">{resp.reason}</p>}
                  </div>
                );
              })}
              {r.comments_to_author && (
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Your Comments to Author</p>
                  <p className="text-xs text-slate-700">{r.comments_to_author}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ManuscriptDetail({ row, onBack, onChanged }: { row: Row; onBack: () => void; onChanged: () => void }) {
  const { manuscript, assignment, priorRounds } = row;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [files, setFiles] = useState<ManuscriptFileRow[]>([]);
  const [filesRevisionNumber, setFilesRevisionNumber] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<ManuscriptFileRow | null>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);

  useEffect(() => {
    // The manuscript PDF is only unlocked once the invitation is accepted
    // (see spec: "Do not show the manuscript PDF ... before the reviewer
    // accepts the invitation").
    if (assignment.status === 'INVITED') return;

    // getManuscriptFiles() only ever returns the ORIGINAL submission's files
    // (revision_id is null). Once the author has submitted ANY revision --
    // even an EDITOR_SCREENING-origin one that never touched this reviewer's
    // own assignment (assignment.revision_number can still be 0 in that
    // case, e.g. peer reviewers assigned after an earlier screening-only
    // revision loop) -- those original files are stale. Always prefer the
    // most recent revision's actual files when one exists; fall back to the
    // original submission only if no revision has ever happened.
    getRevisions(manuscript.id)
      .then(async (revs) => {
        const latest = revs.reduce<typeof revs[number] | null>((best, r) => (!best || r.revision_number > best.revision_number ? r : best), null);
        const revFiles = latest ? await getRevisionFiles(latest.id) : [];
        if (revFiles.length > 0) {
          setFilesRevisionNumber(latest!.revision_number);
          return revFiles;
        }
        setFilesRevisionNumber(null);
        return getManuscriptFiles(manuscript.id);
      })
      .then(setFiles)
      .catch(() => {});
  }, [manuscript.id, assignment.status]);

  const accept = async () => {
    setBusy(true); setError('');
    try { await respondToReviewInvite(assignment.id, true); onChanged(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    if (!declineReason.trim()) { setError('Please provide a reason for declining.'); return; }
    setBusy(true); setError('');
    try {
      await respondToReviewInvite(assignment.id, false, declineReason.trim());
      setShowDeclineModal(false);
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer underline">
        ← Back to assignments
      </button>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <p className="font-mono text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded w-fit">{manuscript.id}</p>
            <div className="flex items-center gap-2 mt-2">
              <h2 className="text-lg font-black text-slate-900">{manuscript.title}</h2>
              {assignment.revision_number > 0 && (
                <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                  Revision {assignment.revision_number} re-review
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Manuscript Status</p>
                <p className="text-sm font-bold text-slate-900">{getManuscriptStatusLabel(manuscript)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Submitted</p>
                <p className="text-sm font-bold text-slate-900">{manuscript.submitted_at ? new Date(manuscript.submitted_at).toLocaleDateString() : 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Double-Blind</p>
                <p className="text-sm font-bold text-emerald-700 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Active</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Assignment Status</p>
                <p className={`text-sm font-bold ${
                  assignment.status === 'INVITED' ? 'text-amber-700' :
                  assignment.status === 'ACCEPTED' ? 'text-blue-700' :
                  assignment.status === 'SUBMITTED' ? 'text-emerald-700' :
                  'text-red-700'
                }`}>
                  {assignment.status}
                </p>
              </div>
            </div>
          </div>
          {assignment.status === 'ACCEPTED' && (
            <button
              onClick={() => setShowEvaluation(true)}
              className="px-4 py-2 bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Open Evaluation
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{manuscript.abstract}</p>

        {assignment.status !== 'INVITED' && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">
              {filesRevisionNumber !== null
                ? `Revision ${filesRevisionNumber} File${files.length !== 1 ? 's' : ''} (${files.length})`
                : `Manuscript File${files.length !== 1 ? 's' : ''} (${files.length})`}
            </h3>
            {files.length === 0 ? (
              <p className="text-xs text-slate-500 py-1">
                {filesRevisionNumber !== null ? 'No files were uploaded for this revision.' : 'No files were uploaded by the author.'}
              </p>
            ) : (
              <div className="space-y-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{f.file_name}</p>
                        <p className="text-[11px] text-slate-500">{f.file_type}{f.file_size ? ` · ${f.file_size}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setPreviewFile(f)} className="p-1.5 hover:bg-slate-200 rounded transition" title="View">
                        <Eye className="w-4 h-4 text-slate-600" />
                      </button>
                      {f.public_url && (
                        <a href={f.public_url} download={f.file_name} className="p-1.5 hover:bg-slate-200 rounded transition" title="Download">
                          <Download className="w-4 h-4 text-slate-600" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {priorRounds.length > 0 && (
        <PriorRoundsContext priorRounds={priorRounds} />
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {assignment.status === 'INVITED' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" /> Accept or Decline Review Invitation</h3>
          <p className="text-xs text-slate-600 mb-4">Do you accept this peer review invitation? You can decline if this manuscript is outside your area of expertise or you have a conflict of interest. The manuscript PDF and review questionnaire unlock once you accept.</p>
          <div className="flex gap-3">
            <button disabled={busy} onClick={accept} className="flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-5 py-3 rounded-lg cursor-pointer disabled:opacity-50 transition-all flex-1">
              <Check className="w-4 h-4" /> ACCEPT REVIEW INVITATION
            </button>
            <button disabled={busy} onClick={() => setShowDeclineModal(true)} className="flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 transition-all">
              <XIcon className="w-4 h-4" /> DECLINE
            </button>
          </div>
        </div>
      )}

      {showDeclineModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Decline Review Invitation</h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">Reason for declining *</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                disabled={busy}
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                rows={4}
                placeholder="e.g. outside my area of expertise, conflict of interest..."
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => { setShowDeclineModal(false); setError(''); }}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={decline}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-1.5"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {assignment.status === 'ACCEPTED' && (
        <ReviewForm
          manuscript={manuscript}
          assignmentId={assignment.id}
          onSubmitted={onChanged}
          isReReview={assignment.revision_number > 0}
          revisionNumber={assignment.revision_number}
          open={showEvaluation}
          onOpenChange={setShowEvaluation}
        />
      )}

      {assignment.status === 'SUBMITTED' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-black text-sm text-emerald-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Review Submitted</p>
                <p className="text-xs text-emerald-700 mt-1">Your review has been successfully submitted and locked for editing.</p>
              </div>
              <span className="bg-emerald-200 text-emerald-900 px-3 py-1 rounded-full text-xs font-bold">READ-ONLY</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-emerald-700 font-semibold mb-1">Submitted At</p>
                <p className="text-emerald-900 font-bold">{assignment.submitted_at ? new Date(assignment.submitted_at).toLocaleString() : 'N/A'}</p>
              </div>
              <div>
                <p className="text-emerald-700 font-semibold mb-1">Recommendation</p>
                <p className="text-emerald-900 font-bold">{assignment.recommendation?.replace(/_/g, ' ') || 'N/A'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-1.5"><FileText className="w-4 h-4" /> Review Details (Read-Only)</h3>

            <div className="space-y-3">
              {(assignment.screening_responses || []).map((r, idx) => {
                const meta = PEER_REVIEW_QUESTIONS.find(q => q.id === r.question_id);
                return (
                  <div key={r.question_id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-slate-800">{idx + 1}. {meta?.label || r.question_id}</p>
                      {r.answer ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Yes
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          <XIcon className="w-3 h-3" /> No
                        </span>
                      )}
                    </div>
                    {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                  </div>
                );
              })}
            </div>

            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">Comments to Author</label>
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-900 min-h-20">
                  {assignment.comments_to_author || 'No comments provided'}
                </div>
              </div>

            </div>

            <p className="text-xs text-slate-500 italic mt-4">This review is locked and cannot be edited. Contact the coordinator if you need to make changes.</p>
          </div>
        </div>
      )}

      {previewFile && (
        <FilePreviewModal
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          fileName={previewFile.file_name}
          fileType={previewFile.file_type}
          fileSize={previewFile.file_size || undefined}
          publicUrl={previewFile.public_url || undefined}
        />
      )}
    </div>
  );
}

function ReviewForm({ manuscript, assignmentId, onSubmitted, isReReview, revisionNumber, open, onOpenChange }: { manuscript: ManuscriptRow; assignmentId: string; onSubmitted: () => void; isReReview: boolean; revisionNumber: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [responses, setResponses] = useState<Record<string, { answer: boolean | null; reason: string }>>(
    () => Object.fromEntries(PEER_REVIEW_QUESTIONS.map(q => [q.id, { answer: null, reason: '' }]))
  );
  const [recommendation, setRecommendation] = useState<ReviewerRecommendation | null>(null);
  const [commentsToAuthor, setCommentsToAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);

  // Re-review context: which revision this round is re-checking, its
  // uploaded files, and the author's response note -- so the reviewer can
  // see what changed instead of re-reviewing blind. Only fetched for a
  // re-review round (isReReview); the original round has no revision yet.
  const [revision, setRevision] = useState<RevisionRow | null>(null);
  const [revisionFiles, setRevisionFiles] = useState<ManuscriptFileRow[]>([]);
  const [loadingRevision, setLoadingRevision] = useState(isReReview);

  useEffect(() => {
    if (!isReReview) return;
    let isMounted = true;
    setLoadingRevision(true);
    getRevisions(manuscript.id)
      .then(async (revs) => {
        const rev = revs.find((r) => r.revision_number === revisionNumber) || null;
        if (!isMounted) return;
        setRevision(rev);
        if (rev) {
          const files = await getRevisionFiles(rev.id);
          if (isMounted) setRevisionFiles(files);
        }
      })
      .catch((e) => console.error('Failed to load revision context:', e))
      .finally(() => { if (isMounted) setLoadingRevision(false); });
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReReview, manuscript.id, revisionNumber]);

  const setAnswer = (id: string, answer: boolean) => setResponses(prev => ({ ...prev, [id]: { ...prev[id], answer } }));
  const setReason = (id: string, reason: string) => setResponses(prev => ({ ...prev, [id]: { ...prev[id], reason } }));

  const draftKey = `reviewer_draft_${assignmentId}`;

  // Restore any previously saved draft for this assignment. This is a pure
  // client-side load (no submission, no status change) so it's safe to run
  // once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.responses) setResponses(draft.responses);
      if (draft.recommendation) setRecommendation(draft.recommendation);
      if (typeof draft.commentsToAuthor === 'string') setCommentsToAuthor(draft.commentsToAuthor);
      if (draft.lastSavedAt) setLastSaveTime(new Date(draft.lastSavedAt).toLocaleTimeString());
    } catch {
      // Corrupted/unreadable draft -- ignore and start from a blank form.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saving a draft only persists the in-progress form locally -- it never
  // calls submitPeerReview and never touches manuscript/reviewer status.
  const saveDraft = async () => {
    setBusy(true);
    setError('');
    try {
      const savedAt = new Date().toISOString();
      localStorage.setItem(draftKey, JSON.stringify({ responses, recommendation, commentsToAuthor, lastSavedAt: savedAt }));
      setLastSaveTime(new Date(savedAt).toLocaleTimeString());
      setSuccess('Draft saved successfully');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError('Failed to save draft: ' + (e?.message || 'local storage unavailable'));
    } finally {
      setBusy(false);
    }
  };

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (commentsToAuthor) saveDraft();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, recommendation, commentsToAuthor, assignmentId]);

  const unanswered = PEER_REVIEW_QUESTIONS.filter(q => responses[q.id].answer === null);
  const missingReasons = PEER_REVIEW_QUESTIONS.filter(q => responses[q.id].answer !== null && !responses[q.id].reason.trim());
  const questionnaireComplete = isReReview || (unanswered.length === 0 && missingReasons.length === 0);

  const validateForm = (): string | null => {
    if (!questionnaireComplete) return 'Please answer all 10 questions and provide a reason for each.';
    if (!commentsToAuthor.trim()) return 'Comments to Author is required.';
    if (!recommendation) return 'Please select a recommendation.';
    return null;
  };

  const submit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true); setError('');
    try {
      // Re-review rounds skip the full questionnaire (see below) -- the
      // reviewer already answered it for the original submission, and is
      // only re-checking whether their prior concerns were addressed.
      const payload: ScreeningResponse[] = isReReview ? [] : PEER_REVIEW_QUESTIONS.map(q => ({
        question_id: q.id,
        answer: responses[q.id].answer as boolean,
        reason: responses[q.id].reason.trim(),
      }));
      await submitPeerReview(assignmentId, payload, commentsToAuthor, recommendation as ReviewerRecommendation);
      try { localStorage.removeItem(draftKey); } catch { /* non-fatal */ }
      setSuccess('Review submitted successfully!');
      setTimeout(() => onSubmitted(), 1500);
    } catch (e: any) {
      setError(e.message || 'Failed to submit review');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#1a4038] to-[#0f2e2a] text-white p-5 flex items-center justify-between">
          <div>
            <h2 className="font-black text-base">REVIEWER EVALUATION WORKSPACE</h2>
            <p className="text-xs text-emerald-100 mt-1">
              <span className="font-bold">Manuscript:</span> {manuscript.title.substring(0, 60)}...
            </p>
            <p className="text-xs text-emerald-100 mt-0.5">
              <span className="font-bold">Status:</span> ACCEPTED FOR REVIEW | <span className="font-bold">Referee:</span> You
            </p>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-white font-black text-sm hover:opacity-75 flex items-center gap-1.5"><XIcon className="w-4 h-4" /> Close</button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3">{error}</div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-800">
            <p className="font-bold mb-1 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Your Expert Evaluation is Desired</p>
            <p>{isReReview
              ? 'You already answered the full questionnaire for the original submission -- just confirm whether this revision addresses your prior concerns. This review is a recommendation only -- the Editor makes the final editorial decision.'
              : 'Please answer each questionnaire item and explain your reasoning. This review is a recommendation only -- the Editor makes the final editorial decision.'}</p>
          </div>

          {/* Questionnaire -- only for the original round. A re-review round
              (isReReview) only asks whether the revision addressed what was
              already flagged, so it skips straight to Comments + Recommendation
              below -- same simplification the Editor's own re-review screen
              (EditorRevisionReview.tsx) already uses instead of repeating its
              full first-round evaluation form. */}
          {!isReReview && (
          <div>
            <h3 className="font-black text-sm text-slate-900 mb-4">REVIEW QUESTIONNAIRE</h3>
            <div className="space-y-5">
              {PEER_REVIEW_QUESTIONS.map((q, idx) => {
                const state = responses[q.id];
                return (
                  <div key={q.id} className="border-b border-slate-200 pb-5 last:border-b-0">
                    <label className="block text-xs font-black text-slate-900 mb-1">{idx + 1}. {q.label.toUpperCase()}</label>
                    <p className="text-xs text-slate-600 mb-3">{q.question}</p>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAnswer(q.id, true)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
                          state.answer === true ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        <Check className="w-4 h-4" /> Yes
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAnswer(q.id, false)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
                          state.answer === false ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        <XIcon className="w-4 h-4" /> No
                      </button>
                    </div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">Reason *</label>
                    <textarea
                      value={state.reason}
                      onChange={(e) => setReason(q.id, e.target.value)}
                      placeholder="Explain your answer for this question..."
                      disabled={busy}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                      rows={2}
                    />
                  </div>
                );
              })}
            </div>
            {!questionnaireComplete && (
              <p className="text-xs text-amber-700 font-semibold mt-3">
                Answer all 10 questions with a reason for each before submitting ({unanswered.length + missingReasons.length} remaining).
              </p>
            )}
          </div>
          )}

          {/* Re-review context: Revision N files + Author's Response */}
          {isReReview && (
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">
                  Revision {revisionNumber} — Updated File{revisionFiles.length !== 1 ? 's' : ''}
                </h3>
                {loadingRevision ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading revision files...
                  </div>
                ) : revisionFiles.length === 0 ? (
                  <p className="text-xs text-slate-500 py-1">No files were uploaded for this revision.</p>
                ) : (
                  <div className="space-y-2">
                    {revisionFiles.map((f) => (
                      <div key={f.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <p className="text-xs font-semibold text-slate-900 truncate">{f.file_name}</p>
                        </div>
                        {f.public_url && (
                          <div className="flex items-center gap-1 shrink-0">
                            <a href={f.public_url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-slate-100 rounded transition" title="View">
                              <Eye className="w-4 h-4 text-slate-600" />
                            </a>
                            <a href={f.public_url} download={f.file_name} className="p-1.5 hover:bg-slate-100 rounded transition" title="Download">
                              <Download className="w-4 h-4 text-slate-600" />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Author's Response</h3>
                {revision?.author_response ? (
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{revision.author_response}</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">The author did not provide a response note with this revision.</p>
                )}
              </div>
            </div>
          )}

          {/* Comments to Author */}
          <div className="border-t border-slate-200 pt-6">
            <p className="text-xs font-bold text-slate-900 mb-1">Comments to Author <span className="text-red-600">*</span></p>
            <p className="text-[11px] text-slate-500 mb-2">This is your detailed feedback that will eventually be shared with the Author through the Coordinator.</p>
            <textarea
              value={commentsToAuthor}
              onChange={(e) => setCommentsToAuthor(e.target.value)}
              rows={5}
              placeholder="Provide detailed feedback for the author..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans focus:border-[#008751] focus:outline-none"
            />
          </div>

          {/* Recommendation */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="font-black text-sm text-slate-900 mb-4">RECOMMENDATION</h3>
            <p className="text-xs text-slate-600 mb-4">Please select only one recommendation for this manuscript.</p>
            <div className="grid grid-cols-1 gap-3">
              {[
                { value: 'ACCEPT', label: 'Accept', desc: 'Suitable for immediate publication as is', dot: 'bg-emerald-500' },
                { value: 'MINOR_REVISION', label: 'Accept with Minor Revision', desc: 'Requires minor refinements or polishing', dot: 'bg-amber-500' },
                { value: 'MAJOR_REVISION', label: 'Accept with Major Revision', desc: 'Requires substantial conceptual refinements', dot: 'bg-orange-500' },
                // Reject only applies to the original round -- a re-review
                // round is purely "did this revision address what I flagged",
                // so only Accept/Minor/Major make sense there.
                ...(isReReview ? [] : [{ value: 'REJECT', label: 'Reject', desc: 'Not suitable for presentation or publication', dot: 'bg-red-500' }]),
              ].map((option) => (
                <label key={option.value} className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  recommendation === option.value
                    ? `border-[#008751] bg-emerald-50`
                    : `border-slate-200 hover:border-[#008751] hover:bg-slate-50`
                }`}>
                  <input
                    type="radio"
                    name="recommendation"
                    value={option.value}
                    checked={recommendation === option.value}
                    onChange={(e) => setRecommendation(e.target.value as ReviewerRecommendation)}
                    className="w-4 h-4 mt-0.5 accent-[#008751]"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-sm text-slate-900 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${option.dot}`} />{option.label}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 italic mt-3">Your recommendation and review comments will be forwarded to the Editor for final editorial assessment.</p>
          </div>

          <p className="text-xs text-slate-500 italic">Draft auto-saved locally every 30 seconds. {lastSaveTime && <span className="text-emerald-600 font-semibold">Last saved: {lastSaveTime}</span>}</p>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 p-4 flex items-center justify-between bg-slate-50">
          <div className="text-xs text-slate-600">
            {success && <span className="text-emerald-600 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{success}</span>}
            {error && <span className="text-red-600 font-semibold">✗ {error}</span>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={saveDraft}
              disabled={busy}
              className="px-4 py-2.5 border border-blue-300 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-50 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Draft
            </button>
            <button
              disabled={busy}
              onClick={submit}
              className="px-4 py-2.5 bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} SUBMIT REVIEW
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
