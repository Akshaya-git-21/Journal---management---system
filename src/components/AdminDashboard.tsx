import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlarmClock, CheckCircle2, ClipboardCheck, Clock, Eye, FileSearch, FileText,
  KeyRound, Loader2, Mail, RefreshCw, UserCheck, UserCog, UserMinus,
  UserPlus, Users, XCircle,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LabelList } from 'recharts';
import { supabase } from '../lib/supabase';
import { formatDisplayDate } from '../lib/displayPrefs';
import { actionLabel, humanize, roleWord } from '../lib/activityLabels';
import { StatusStatCard, StatTone } from './StatusStatCard';

interface ProfileRow {
  id: string;
  name: string;
  role: string | null;
  requested_role: string | null;
  status: string;
  created_at: string | null;
}

interface ActivityRow {
  id: string;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  target_name: string | null;
  target_email: string | null;
  target_role?: string | null;
  manuscript_id?: string | null;
  manuscript_title?: string | null;
  details?: Record<string, any> | null;
}

interface ManuscriptRow {
  id: string;
  status: string;
}

interface ReviewerAssignmentRow {
  status: string;
  due_date: string | null;
}

// "Users by role" only covers the journal's working roles -- Admins run the
// console, they aren't part of the editorial roster this chart is about.
const BAR_ROLE_KEYS = ['REVIEWER', 'EDITOR', 'AUTHOR', 'COORDINATOR', 'GD_MEMBER', 'PUBLISHER'];
const ROLE_COLORS: Record<string, string> = {
  REVIEWER: '#6366f1',
  EDITOR: '#0d9488',
  AUTHOR: '#3b82f6',
  COORDINATOR: '#f5a623',
  GD_MEMBER: '#d946ef',
  PUBLISHER: '#22d3ee',
};

/** Manuscript pipeline stages shown as the dashboard's top stat cards, in
 * submission order (see ManuscriptStatus in src/types.ts). DRAFT and
 * PUBLISHED are excluded -- a draft hasn't entered the pipeline yet, and
 * published manuscripts have left it. */
const WORKFLOW_TILES: { key: string; label: string; icon: ReactNode; tone: StatTone }[] = [
  { key: 'SUBMITTED', label: 'Submitted', icon: <FileText className="w-5 h-5" />, tone: 'sky' },
  { key: 'EDITOR_REVIEW', label: 'Editorial', icon: <UserCog className="w-5 h-5" />, tone: 'emerald' },
  { key: 'UNDER_REVIEW', label: 'Peer Review', icon: <Eye className="w-5 h-5" />, tone: 'violet' },
  { key: 'REVISION_REQUESTED', label: 'Revision', icon: <RefreshCw className="w-5 h-5" />, tone: 'amber' },
  { key: 'AWAITING_DECISION', label: 'Awaiting Decision', icon: <Clock className="w-5 h-5" />, tone: 'orange' },
  { key: 'ACCEPTED', label: 'Accepted', icon: <CheckCircle2 className="w-5 h-5" />, tone: 'emerald' },
  { key: 'REJECTED', label: 'Rejected', icon: <XCircle className="w-5 h-5" />, tone: 'rose' },
];

const ACTIVITY_ICONS: Record<string, ReactNode> = {
  submit_manuscript: <FileText className="w-4 h-4" />,
  editor_assigned: <UserCog className="w-4 h-4" />,
  editor_assignment_accepted: <UserCog className="w-4 h-4" />,
  editor_assignment_declined: <UserCog className="w-4 h-4" />,
  reviewer_invited: <Eye className="w-4 h-4" />,
  reviewer_accepted: <Eye className="w-4 h-4" />,
  reviewer_declined: <Eye className="w-4 h-4" />,
  review_submitted: <ClipboardCheck className="w-4 h-4" />,
  all_reviews_submitted: <ClipboardCheck className="w-4 h-4" />,
  revision_requested: <RefreshCw className="w-4 h-4" />,
  submit_revision: <RefreshCw className="w-4 h-4" />,
  publish_decision: <CheckCircle2 className="w-4 h-4" />,
};
const activityIcon = (action: string) => ACTIVITY_ICONS[action] || <Activity className="w-4 h-4" />;

/** "JAI-2026-0142 -> Dr. Sarah Johnson" style detail: prefer the person the
 * action concerned, then whatever the action's own detail was about. */
const activityDetail = (a: ActivityRow) => {
  if (a.target_name) return a.target_name;
  const d = a.details;
  if (d?.recommendation) return humanize(d.recommendation);
  if (d?.to_status) return humanize(d.to_status);
  if (d?.decision_type) return humanize(d.decision_type);
  return a.manuscript_title || '—';
};

const relTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDisplayDate(iso);
};

interface AdminDashboardProps {
  onOpenPeople: (autoCreate?: boolean) => void;
  onOpenApprovals: () => void;
  onOpenActivity: () => void;
  onOpenAccess: () => void;
}

export default function AdminDashboard({ onOpenPeople, onOpenApprovals, onOpenActivity, onOpenAccess }: AdminDashboardProps) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [journalActivity, setJournalActivity] = useState<ActivityRow[]>([]);
  const [deactivated, setDeactivated] = useState<ActivityRow[]>([]);
  const [manuscripts, setManuscripts] = useState<ManuscriptRow[]>([]);
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [people, activity, deactivatedLog, mss, revs] = await Promise.all([
      supabase.from('profiles').select('id, name, role, requested_role, status, created_at').limit(10000),
      supabase.from('activity_log').select('id, created_at, actor_name, actor_role, action, target_name, target_email, manuscript_id, manuscript_title, details').eq('category', 'workflow').order('created_at', { ascending: false }).limit(8),
      supabase.from('activity_log').select('id, created_at, actor_name, actor_role, action, target_name, target_email, target_role').eq('action', 'user_deactivated').order('created_at', { ascending: false }).limit(6),
      supabase.from('manuscripts').select('id, status').limit(10000),
      supabase.from('reviewer_assignments').select('status, due_date').limit(10000),
    ]);
    if (people.error) setError(people.error.message);
    else { setRows((people.data ?? []) as ProfileRow[]); setError(null); }
    setJournalActivity((activity.data ?? []) as ActivityRow[]);
    setDeactivated((deactivatedLog.data ?? []) as ActivityRow[]);
    setManuscripts((mss.data ?? []) as ManuscriptRow[]);
    setReviewerAssignments((revs.data ?? []) as ReviewerAssignmentRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const profilesChannel = supabase.channel('admin-dashboard-profiles-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { load(); })
      .subscribe();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const activityChannel = supabase.channel('admin-dashboard-activity-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => {
        clearTimeout(timer);
        timer = setTimeout(load, 400);
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(profilesChannel); supabase.removeChannel(activityChannel); };
  }, []);

  const live = useMemo(() => rows.filter((r) => r.status !== 'DELETED'), [rows]);
  const byRole = (key: string) => live.filter((r) => (r.role ?? r.requested_role) === key).length;
  const active = live.filter((r) => r.status === 'ACTIVE').length;
  const inactive = live.filter((r) => r.status === 'INACTIVE').length;
  const pendingApprovalCount = live.filter((r) => r.status === 'PENDING_APPROVAL').length;

  const roleChartData = useMemo(
    () => BAR_ROLE_KEYS.map((key) => ({ role: roleWord(key), count: byRole(key), color: ROLE_COLORS[key] })).sort((a, b) => b.count - a.count),
    [live] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const statusChartData = useMemo(() => [
    { name: 'Active', value: active, color: '#059669' },
    { name: 'Inactive', value: inactive, color: '#bbf7d0' },
  ], [active, inactive]);

  const workflowCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    manuscripts.forEach((m) => { counts[m.status] = (counts[m.status] || 0) + 1; });
    return counts;
  }, [manuscripts]);

  const today = new Date().toISOString().slice(0, 10);
  const pendingActions = useMemo(() => [
    { key: 'approvals', label: 'Users awaiting approval', count: pendingApprovalCount, icon: <UserCheck className="w-4 h-4" />, tone: 'bg-violet-100 text-violet-700', onClick: onOpenApprovals },
    { key: 'invites', label: 'Reviewer invitations pending', count: reviewerAssignments.filter((r) => r.status === 'INVITED').length, icon: <Mail className="w-4 h-4" />, tone: 'bg-amber-100 text-amber-700' },
    { key: 'unassigned', label: 'Manuscripts awaiting editor assignment', count: workflowCounts.SUBMITTED || 0, icon: <FileSearch className="w-4 h-4" />, tone: 'bg-sky-100 text-sky-700' },
    { key: 'overdue', label: 'Overdue reviews', count: reviewerAssignments.filter((r) => r.status === 'ACCEPTED' && r.due_date && r.due_date < today).length, icon: <AlarmClock className="w-4 h-4" />, tone: 'bg-orange-100 text-orange-700' },
    { key: 'decision', label: 'Manuscripts awaiting final decision', count: workflowCounts.AWAITING_DECISION || 0, icon: <ClipboardCheck className="w-4 h-4" />, tone: 'bg-red-100 text-red-700' },
  ], [pendingApprovalCount, reviewerAssignments, workflowCounts, today]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dashboard...</div>;
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Administration</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">Admin dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Everyone in the journal at a glance.</p>
      </div>
      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Could not load the numbers: {error}.</div>}

      {/* 5.5 Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => onOpenPeople(true)} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043]"><UserPlus className="w-4 h-4" /> Create User</button>
        <button onClick={() => onOpenPeople()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Users className="w-4 h-4" /> Manage People</button>
        <button onClick={onOpenActivity} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Activity className="w-4 h-4" /> Activity Log</button>
        <button onClick={onOpenAccess} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><KeyRound className="w-4 h-4" /> Access Control</button>
      </div>

      {/* Manuscript Workflow Overview */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {WORKFLOW_TILES.map((t) => (
          <StatusStatCard key={t.key} title={t.label} value={workflowCounts[t.key] || 0} icon={t.icon} tone={t.tone} />
        ))}
      </div>

      {/* Users by role + Account status */}
      <div className="grid gap-5 xl:grid-cols-2 items-start">
        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-[#0a2e22]">Users by role</p>
            <span className="text-xs font-semibold text-slate-400">Total users: {live.length}</span>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleChartData} layout="vertical" margin={{ left: 8, right: 28 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f1" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="role" width={90} tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={18}>
                  {roleChartData.map((entry) => <Cell key={entry.role} fill={entry.color} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fontWeight: 700, fill: '#334155' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <p className="text-lg font-bold text-[#0a2e22]">Account status</p>
          <div className="mt-5 flex items-center gap-8">
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={3} startAngle={90} endAngle={-270} stroke="none">
                    {statusChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-slate-900">{live.length}</span>
                <span className="text-[11px] text-slate-400">total users</span>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-emerald-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">Active</p>
                  <p className="text-xl font-black text-slate-900">{active}</p>
                  <p className="text-xs text-slate-400">{live.length ? ((active / live.length) * 100).toFixed(1) : '0.0'}%</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-emerald-200 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">Inactive</p>
                  <p className="text-xl font-black text-slate-900">{inactive}</p>
                  <p className="text-xs text-slate-400">{live.length ? ((inactive / live.length) * 100).toFixed(1) : '0.0'}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Journal Activity + Pending Actions */}
      <div className="grid gap-5 xl:grid-cols-2 items-start">
        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-[#0a2e22]">Journal Activity</p><button onClick={onOpenActivity} className="text-xs font-bold text-[#008751] hover:underline">View all →</button></div>
          {journalActivity.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No manuscript activity yet.</div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {journalActivity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">{activityIcon(a.action)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900 truncate">{actionLabel(a.action)}</span>
                    <span className="block text-xs text-slate-400 truncate">{a.manuscript_id ? `${a.manuscript_id} → ` : ''}{activityDetail(a)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{relTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-[#0a2e22]">Pending Actions</p><button onClick={onOpenApprovals} className="text-xs font-bold text-[#008751] hover:underline">View all →</button></div>
          <ul className="mt-3 divide-y divide-slate-100">
            {pendingActions.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={p.onClick}
                  disabled={!p.onClick}
                  className={`flex w-full items-center gap-3 py-2.5 text-left text-sm ${p.onClick ? 'cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg' : 'cursor-default'}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${p.tone}`}>{p.icon}</span>
                  <span className="flex-1 font-medium text-slate-700">{p.label}</span>
                  <span className="shrink-0 text-sm font-black text-slate-900">{p.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recently Deactivated Users */}
      <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
        <div className="flex items-center justify-between"><p className="text-lg font-bold text-[#0a2e22]">Recently Deactivated Users</p><button onClick={onOpenActivity} className="text-xs font-bold text-[#008751] hover:underline">View all →</button></div>
        {deactivated.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Nobody has been deactivated yet.</div>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="font-semibold pb-2">Name</th>
                <th className="font-semibold pb-2">Role</th>
                <th className="font-semibold pb-2 text-right">Deactivated On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deactivated.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 text-slate-900 font-semibold truncate"><UserMinus className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />{a.target_name || a.target_email}</td>
                  <td className="py-2.5 text-slate-500">{roleWord(a.target_role)}</td>
                  <td className="py-2.5 text-right text-xs text-slate-400">{relTime(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
