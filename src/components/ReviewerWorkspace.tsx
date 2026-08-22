import React, { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, ReviewerAssignmentRow,
  listManuscripts, getReviewerAssignments, subscribeToManuscripts,
  respondToReviewInvite, submitReview
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { getManuscriptStatusLabel } from '../lib/manuscriptStatusLabel';
import { NavGroup, NavItem } from './SidebarNavGroup';
import {
  Loader2, Check, X as XIcon, ChevronDown, User, AlertTriangle, ClipboardList, CheckCircle2, XCircle,
  FileText, Lock, Eye, History, Star, BarChart3, Download, ClipboardCheck, Pencil, ShieldAlert
} from 'lucide-react';

interface ReviewerWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (m: any) => void;
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

interface Row { manuscript: ManuscriptRow; assignment: ReviewerAssignmentRow; }

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
        const mine = assignments.find((a) => a.reviewer_id === data.user?.id);
        if (mine) withAssignments.push({ manuscript: m, assignment: mine });
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
      <p className="text-xs text-slate-500 mb-5">These are the exact criteria used in the evaluation form when you review a manuscript, scored 1 (Poor) to 10 (Excellent).</p>
      <div className="space-y-4">
        {SCORE_FIELDS.map(([key, label, description], idx) => (
          <div key={key} className="border-b border-slate-100 pb-4 last:border-b-0">
            <p className="text-xs font-black text-slate-900">{idx + 1}. {label}</p>
            <p className="text-xs text-slate-600 mt-0.5">{description}</p>
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
                  {assignment.status === 'INVITED' ? 'ASSIGNMENT STATUS: INVITED' :
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
                  <p className="text-slate-900 font-bold">{manuscript.status?.replace(/_/g, ' ')}</p>
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
              <button
                onClick={(e) => handleDownload(e, manuscript.id)}
                disabled={downloading === manuscript.id}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
              >
                {downloading === manuscript.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Download Manuscript
              </button>
              {(assignment.status === 'INVITED' || assignment.status === 'ACCEPTED') && (
                <button
                  onClick={() => onOpen(manuscript.id)}
                  className="px-4 py-2 bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs rounded-lg transition-all whitespace-nowrap"
                >
                  {assignment.status === 'INVITED' ? 'Accept/Decline' : 'Open Evaluation'}
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

function ManuscriptDetail({ row, onBack, onChanged }: { row: Row; onBack: () => void; onChanged: () => void }) {
  const { manuscript, assignment } = row;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const respond = async (accept: boolean) => {
    setBusy(true); setError('');
    try { await respondToReviewInvite(assignment.id, accept); onChanged(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // In a real implementation, this would download the manuscript file from storage
      setTimeout(() => {
        alert(`Downloading manuscript ${manuscript.id}...`);
        setDownloading(false);
      }, 1000);
    } catch (e: any) {
      setError('Download failed: ' + e.message);
      setDownloading(false);
    }
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
            <h2 className="text-lg font-black text-slate-900 mt-2">{manuscript.title}</h2>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Manuscript Status</p>
                <p className="text-sm font-bold text-slate-900">{getManuscriptStatusLabel(manuscript.status)}</p>
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
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
          >
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download PDF
          </button>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{manuscript.abstract}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {assignment.status === 'INVITED' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" /> Accept or Decline Review Invitation</h3>
          <p className="text-xs text-slate-600 mb-4">Do you accept this peer review invitation? You can decline if this manuscript is outside your area of expertise or you have a conflict of interest.</p>
          <div className="flex gap-3">
            <button disabled={busy} onClick={() => respond(true)} className="flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-5 py-3 rounded-lg cursor-pointer disabled:opacity-50 transition-all flex-1">
              <Check className="w-4 h-4" /> ACCEPT REVIEW INVITATION
            </button>
            <button disabled={busy} onClick={() => respond(false)} className="flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 transition-all">
              <XIcon className="w-4 h-4" /> DECLINE
            </button>
          </div>
        </div>
      )}

      {assignment.status === 'ACCEPTED' && (
        <ReviewForm manuscript={manuscript} assignmentId={assignment.id} onSubmitted={onChanged} />
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

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">Scores</label>
                {assignment.scores && (
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded">
                    {Object.entries(assignment.scores).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-slate-600">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="font-bold text-slate-900">{value}/10</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">Comments to Author</label>
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-900 min-h-20">
                  {assignment.comments_to_author || 'No comments provided'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-2">Strengths</label>
                  <div className="p-3 bg-emerald-50 rounded border border-emerald-200 text-xs text-emerald-900 min-h-20">
                    {assignment.strengths || 'No strengths noted'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-2">Weaknesses</label>
                  <div className="p-3 bg-orange-50 rounded border border-orange-200 text-xs text-orange-900 min-h-20">
                    {assignment.weaknesses || 'No weaknesses noted'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">Mandatory Revisions</label>
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-900 min-h-20">
                  {assignment.mandatory_revisions || 'No revisions requested'}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label className="block text-xs font-bold text-blue-900 mb-2 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Confidential Editor Comments</label>
                <div className="p-3 bg-white rounded border border-blue-200 text-xs text-slate-900 min-h-20">
                  {assignment.comments_to_editor || 'No confidential comments provided'}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 italic mt-4">This review is locked and cannot be edited. Contact the coordinator if you need to make changes.</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ScoreState {
  scientificMerit: number; noveltyInnovation: number; methodologyQuality: number;
  literatureAdequacy: number; ethicalCompliance: number; dataReliability: number; writingQuality: number; overallRecommendationScore: number;
}

const SCORE_FIELDS: [keyof ScoreState, string, string][] = [
  ['scientificMerit', 'SCIENTIFIC MERIT', 'Original contribution and study rigor'],
  ['noveltyInnovation', 'NOVELTY & INNOVATION', 'Breakthrough contributions and uniqueness'],
  ['methodologyQuality', 'METHODOLOGY QUALITY', 'Experimental setup and verification rigor'],
  ['literatureAdequacy', 'LITERATURE REVIEW', 'Mathematical reproducibility and accuracy'],
  ['dataReliability', 'RESULTS & VALIDITY', 'Data quality and statistical validity'],
  ['writingQuality', 'WRITING QUALITY', 'Clarity of presentation and writing'],
  ['ethicalCompliance', 'ETHICAL STANDARDS', 'Research ethics and moral bounds'],
  ['overallRecommendationScore', 'OVERALL RECOMMENDATION SCORE', 'Manual comprehensive peer rating evaluating overall scientific substance'],
];

function ReviewForm({ manuscript, assignmentId, onSubmitted }: { manuscript: ManuscriptRow; assignmentId: string; onSubmitted: () => void }) {
  const [scores, setScores] = useState<ScoreState>({
    scientificMerit: 0, noveltyInnovation: 0, methodologyQuality: 0, literatureAdequacy: 0, ethicalCompliance: 0, dataReliability: 0, writingQuality: 0, overallRecommendationScore: 0
  });
  const [criteriaReasons, setCriteriaReasons] = useState<Record<string, string>>({
    scientificMerit: '', noveltyInnovation: '', methodologyQuality: '', literatureAdequacy: '', ethicalCompliance: '', dataReliability: '', writingQuality: '', overallRecommendationScore: ''
  });
  const [recommendation, setRecommendation] = useState<ReviewerRecommendation>('MINOR_REVISION');
  const [commentsToAuthor, setCommentsToAuthor] = useState('');
  const [commentsToEditor, setCommentsToEditor] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [revisions, setRevisions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);

  const setScore = (key: keyof ScoreState, value: number) => setScores((s) => ({ ...s, [key]: value }));

  const saveDraft = async () => {
    setBusy(true);
    setError('');
    try {
      await supabase
        .from('review_drafts')
        .upsert(
          {
            assignment_id: assignmentId,
            scores: scores,
            recommendation: recommendation,
            comments_to_author: commentsToAuthor,
            comments_to_editor: commentsToEditor,
            strengths: strengths,
            weaknesses: weaknesses,
            mandatory_revisions: revisions,
            last_saved_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id' }
        );
      setLastSaveTime(new Date().toLocaleTimeString());
      setSuccess('Draft saved successfully');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError('Failed to save draft: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (commentsToAuthor || commentsToEditor || strengths || weaknesses || revisions) {
        saveDraft();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [scores, recommendation, commentsToAuthor, commentsToEditor, strengths, weaknesses, revisions, assignmentId]);

  const validateForm = (): string | null => {
    // Check all scores are filled
    const allScoresFilled = scoreFields.every(([key]) => scores[key] > 0);
    if (!allScoresFilled) {
      return 'Please provide scores for all evaluation criteria (1-10 scale).';
    }

    // Check qualitative fields
    if (!commentsToAuthor.trim()) {
      return 'Comments to Authors is required.';
    }
    if (!strengths.trim()) {
      return 'Strengths of Manuscript is required.';
    }
    if (!weaknesses.trim()) {
      return 'Weaknesses of Manuscript is required.';
    }
    if (!revisions.trim()) {
      return 'Mandatory Revisions is required.';
    }

    // Check recommendation is selected
    if (!recommendation) {
      return 'Please select a recommendation.';
    }

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
      await submitReview(assignmentId, {
        ...scores,
        recommendation,
        commentsToAuthor,
        commentsToEditor,
        strengths,
        weaknesses,
        mandatory_revisions: revisions,
        criteriaReasons
      });
      setSuccess('Review submitted successfully!');
      setTimeout(() => onSubmitted(), 1500);
    } catch (e: any) {
      setError(e.message || 'Failed to submit review');
    } finally {
      setBusy(false);
    }
  };

  if (!showModal) return null;

  const scoreFields = SCORE_FIELDS;

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
          <button onClick={() => setShowModal(false)} className="text-white font-black text-sm hover:opacity-75 flex items-center gap-1.5"><XIcon className="w-4 h-4" /> Close</button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3">{error}</div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-800">
            <p className="font-bold mb-1 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Your Expert Evaluation is Desired</p>
            <p>Please provide your direct expert assessment by scoring each criterion and drafting qualitative critiques. All scores must be entered manually; no automated suggestions are applied.</p>
          </div>

          {/* Evaluation Criteria */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-sm text-slate-900">EVALUATION CRITERIA</h3>
              <span className="text-xs font-bold text-blue-600">Scale: 1 (Poor) to 10 (Excellent)</span>
            </div>
            <div className="space-y-5">
              {scoreFields.map(([key, label, description], idx) => (
                <div key={key} className="border-b border-slate-200 pb-5 last:border-b-0">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <label className="block text-xs font-black text-slate-900 mb-1">{idx + 1}. {label}</label>
                      <p className="text-xs text-slate-600">{description}</p>
                    </div>
                    <label className="flex items-center gap-1 text-xs text-slate-600 font-semibold">
                      <input type="checkbox" className="w-4 h-4 rounded" />
                      N/A
                    </label>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setScore(key, i + 1)}
                        className={`w-8 h-8 rounded font-bold text-xs transition-all ${
                          scores[key] === i + 1
                            ? 'bg-[#008751] text-white'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-blue-600 font-bold mb-2">SCORE SELECTION: {scores[key]} / 10</p>
                  <label className="block text-xs font-bold text-slate-700 mb-2">Reason for this score</label>
                  <textarea
                    value={criteriaReasons[key]}
                    onChange={(e) => setCriteriaReasons(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Explain your score for this criterion..."
                    disabled={busy}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="font-black text-sm text-slate-900 mb-4">FINAL RECOMMENDATION</h3>
            <p className="text-xs text-slate-600 mb-4">Please select only one final recommendation for this manuscript.</p>
            <div className="grid grid-cols-1 gap-3">
              {[
                { value: 'ACCEPT', label: 'Accept', desc: 'Suitable for immediate publication as is', dot: 'bg-emerald-500' },
                { value: 'MINOR_REVISION', label: 'Minor Revision', desc: 'Requires minor refinements or polishing', dot: 'bg-amber-500' },
                { value: 'MAJOR_REVISION', label: 'Major Revision', desc: 'Requires substantial conceptual refinements', dot: 'bg-orange-500' },
                { value: 'REJECT', label: 'Reject', desc: 'Not suitable for presentation or publication', dot: 'bg-red-500' },
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
          </div>

          {/* Qualitative Appraisals */}
          <div>
            <h3 className="font-black text-sm text-slate-900 mb-3">QUALITATIVE APPRAISALS</h3>
            <p className="text-xs text-slate-600 mb-4">Provide detailed, comprehensive reports inside these specific comments gates.</p>

            <label className="block mb-5 pb-5 border-b border-slate-200">
              <p className="text-xs font-bold text-slate-900 mb-1">1. Comments to Authors <span className="text-red-600">*</span></p>
              <p className="text-[11px] text-slate-500 mb-2">Visible to authors</p>
              <textarea
                value={commentsToAuthor}
                onChange={(e) => setCommentsToAuthor(e.target.value)}
                rows={4}
                placeholder="Provide feedback visible to the authors..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans focus:border-[#008751] focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-3 gap-4 mb-5">
              <label>
                <p className="text-xs font-bold text-slate-900 mb-2">Strengths of Manuscript <span className="text-red-600">*</span></p>
                <div className="relative">
                  <textarea
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                    rows={4}
                    placeholder="List key strengths..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans focus:border-[#008751] focus:outline-none"
                  />
                  <button className="absolute bottom-2 right-2 text-slate-400 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                </div>
              </label>
              <label>
                <p className="text-xs font-bold text-slate-900 mb-2">Weaknesses of Manuscript <span className="text-red-600">*</span></p>
                <div className="relative">
                  <textarea
                    value={weaknesses}
                    onChange={(e) => setWeaknesses(e.target.value)}
                    rows={4}
                    placeholder="List key weaknesses..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans focus:border-[#008751] focus:outline-none"
                  />
                  <button className="absolute bottom-2 right-2 text-slate-400 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                </div>
              </label>
              <label>
                <p className="text-xs font-bold text-slate-900 mb-2">Mandatory Revisions <span className="text-red-600">*</span></p>
                <div className="relative">
                  <textarea
                    value={revisions}
                    onChange={(e) => setRevisions(e.target.value)}
                    rows={4}
                    placeholder="List mandatory changes..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans focus:border-[#008751] focus:outline-none"
                  />
                  <button className="absolute bottom-2 right-2 text-slate-400 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                </div>
              </label>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-xs font-bold text-emerald-900 mb-1">📋 Confidential Comments to Editor</p>
              <p className="text-xs text-emerald-800">Private feedback regarding manuscript novelty or scientific validity. Locked strictly to editors.</p>
              <textarea
                value={commentsToEditor}
                onChange={(e) => setCommentsToEditor(e.target.value)}
                rows={4}
                placeholder="Private notes for editors only..."
                className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-xs font-sans mt-2 bg-white focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 italic">All edits auto-saved to Supabase every 30 seconds. {lastSaveTime && <span className="text-emerald-600 font-semibold">Last saved: {lastSaveTime}</span>}</p>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 p-4 flex items-center justify-between bg-slate-50">
          <div className="text-xs text-slate-600">
            {success && <span className="text-emerald-600 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{success}</span>}
            {error && <span className="text-red-600 font-semibold">✗ {error}</span>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowModal(false)}
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
