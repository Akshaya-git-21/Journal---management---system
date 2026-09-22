import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, BookOpen, Building2, Eye, GraduationCap, KeyRound, LogIn, Loader2,
  PackageCheck, ShieldCheck, UserCheck, UserMinus, UserPlus, UserX, Users, UserCog,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { formatDisplayDate } from '../lib/displayPrefs';
import { actionLabel, roleWord } from '../lib/activityLabels';
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
}

// 5.1: one card per total/status count, then one per role, in the spec's order.
const ROLE_CARDS: { key: string; label: string; icon: ReactNode; tone: StatTone }[] = [
  { key: 'ADMIN', label: 'Total Admins', icon: <ShieldCheck className="w-5 h-5" />, tone: 'violet' },
  { key: 'COORDINATOR', label: 'Total Coordinators', icon: <UserCog className="w-5 h-5" />, tone: 'sky' },
  { key: 'AUTHOR', label: 'Total Authors', icon: <GraduationCap className="w-5 h-5" />, tone: 'amber' },
  { key: 'EDITOR', label: 'Total Editors', icon: <BookOpen className="w-5 h-5" />, tone: 'emerald' },
  { key: 'REVIEWER', label: 'Total Reviewers', icon: <Eye className="w-5 h-5" />, tone: 'sky' },
  { key: 'PUBLISHER', label: 'Total Publishers', icon: <Building2 className="w-5 h-5" />, tone: 'violet' },
  { key: 'GD_MEMBER', label: 'Total GD Members', icon: <PackageCheck className="w-5 h-5" />, tone: 'amber' },
];
const ROLE_ORDER = ['ADMIN', 'COORDINATOR', 'EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER', 'AUTHOR'];

const FAILED_LOGIN_WINDOW_HOURS = 24;

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
  const [adminActions, setAdminActions] = useState<ActivityRow[]>([]);
  const [loginActivity, setLoginActivity] = useState<ActivityRow[]>([]);
  const [deactivated, setDeactivated] = useState<ActivityRow[]>([]);
  const [failedLoginCount, setFailedLoginCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_HOURS * 3_600_000).toISOString();
    const [people, admin, logins, deactivatedLog, failed] = await Promise.all([
      supabase.from('profiles').select('id, name, role, requested_role, status, created_at').limit(10000),
      supabase.from('activity_log').select('id, created_at, actor_name, actor_role, action, target_name, target_email').eq('actor_role', 'ADMIN').order('created_at', { ascending: false }).limit(5),
      supabase.from('activity_log').select('id, created_at, actor_name, actor_role, action, target_name, target_email').eq('action', 'sign_in').order('created_at', { ascending: false }).limit(5),
      supabase.from('activity_log').select('id, created_at, actor_name, actor_role, action, target_name, target_email').eq('action', 'user_deactivated').order('created_at', { ascending: false }).limit(5),
      supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'sign_in_failed').gte('created_at', since),
    ]);
    if (people.error) setError(people.error.message);
    else { setRows((people.data ?? []) as ProfileRow[]); setError(null); }
    setAdminActions((admin.data ?? []) as ActivityRow[]);
    setLoginActivity((logins.data ?? []) as ActivityRow[]);
    setDeactivated((deactivatedLog.data ?? []) as ActivityRow[]);
    setFailedLoginCount(failed.count ?? 0);
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
  const pendingRequests = live.filter((r) => r.status === 'PENDING_APPROVAL').length;

  const roleChartData = useMemo(() => ROLE_ORDER.map((key) => ({ role: roleWord(key), count: byRole(key) })), [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const recentlyCreated = useMemo(() => [...rows].filter((r) => r.created_at).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 5), [rows]);

  const activityLine = (a: ActivityRow) => (
    <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <span className="text-slate-700 truncate"><strong className="text-slate-900">{a.actor_name || 'System'}</strong> · {actionLabel(a.action)}{a.target_name || a.target_email ? <> · <span className="text-slate-500">{a.target_name || a.target_email}</span></> : null}</span>
      <span className="shrink-0 text-xs text-slate-400">{relTime(a.created_at)}</span>
    </li>
  );

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

      {/* 5.4 Pending Actions -- only ever the real pending-approval queue */}
      {pendingRequests > 0 && (
        <button type="button" onClick={onOpenApprovals} className="w-full text-left flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 hover:bg-amber-100 transition">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-900"><strong>{pendingRequests}</strong> sign-up request{pendingRequests === 1 ? '' : 's'} waiting for your approval.</span>
          <span className="ml-auto text-xs font-bold text-amber-700">Review →</span>
        </button>
      )}

      {/* 5.5 Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => onOpenPeople(true)} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043]"><UserPlus className="w-4 h-4" /> Create User</button>
        <button onClick={() => onOpenPeople()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Users className="w-4 h-4" /> Manage People</button>
        <button onClick={onOpenActivity} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Activity className="w-4 h-4" /> Activity Log</button>
        <button onClick={onOpenAccess} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><KeyRound className="w-4 h-4" /> Access Control</button>
      </div>

      {/* 5.1 User statistics */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatusStatCard title="Total Users" value={live.length} icon={<Users className="w-5 h-5" />} tone="emerald" note="Not counting closed accounts" />
        <StatusStatCard title="Active Users" value={active} icon={<UserCheck className="w-5 h-5" />} tone="sky" note="Can sign in" />
        <StatusStatCard title="Inactive Users" value={inactive} icon={<UserX className="w-5 h-5" />} tone="amber" note="Deactivated by an Admin" />
        {ROLE_CARDS.map((r) => (
          <StatusStatCard key={r.key} title={r.label} value={byRole(r.key)} icon={r.icon} tone={r.tone} />
        ))}
      </div>

      {/* 5.2 User overview */}
      <div className="grid gap-5 xl:grid-cols-2 items-start">
        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <p className="text-lg font-bold text-[#0a2e22]">Users by role</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f1" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="role" width={90} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f4' }} />
                <Bar dataKey="count" fill="#0f766e" radius={[0, 6, 6, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span>Active vs Inactive</span>
            <span className="font-semibold text-slate-700">{active} active · {inactive} inactive</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-sky-500" style={{ width: `${live.length ? (active / live.length) * 100 : 0}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${live.length ? (inactive / live.length) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-[#0a2e22]">Recently created users</p><button onClick={() => onOpenPeople()} className="text-xs font-bold text-[#008751] hover:underline">Open People →</button></div>
          {recentlyCreated.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No users yet.</div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recentlyCreated.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-slate-700 truncate"><strong className="text-slate-900">{p.name || 'Unnamed'}</strong> · <span className="text-slate-500">{roleWord(p.role ?? p.requested_role)}</span></span>
                  <span className="shrink-0 text-xs text-slate-400">{p.created_at ? relTime(p.created_at) : '—'}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between mt-5"><p className="text-lg font-bold text-[#0a2e22]">Recently deactivated users</p></div>
          {deactivated.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Nobody has been deactivated yet.</div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">{deactivated.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-700 truncate"><UserMinus className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" /><strong className="text-slate-900">{a.target_name || a.target_email}</strong></span>
                <span className="shrink-0 text-xs text-slate-400">{relTime(a.created_at)}</span>
              </li>
            ))}</ul>
          )}
        </div>
      </div>

      {/* 5.3 Admin & security activity */}
      <div className="grid gap-5 xl:grid-cols-3 items-start">
        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-[#0a2e22]">Recent admin actions</p><button onClick={onOpenActivity} className="text-xs font-bold text-[#008751] hover:underline">Open →</button></div>
          {adminActions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No admin actions yet.</div>
          ) : <ul className="mt-3 divide-y divide-slate-100">{adminActions.map(activityLine)}</ul>}
        </div>

        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-[#0a2e22]">Recent login activity</p><LogIn className="w-4 h-4 text-slate-400" /></div>
          {loginActivity.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No sign-ins recorded yet.</div>
          ) : <ul className="mt-3 divide-y divide-slate-100">{loginActivity.map(activityLine)}</ul>}
        </div>

        <div className="rounded-2xl bg-white border border-[#e7ebec] p-6 shadow-sm">
          <p className="text-lg font-bold text-[#0a2e22]">Failed sign-ins</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{failedLoginCount}</p>
          <p className="mt-1 text-xs text-slate-500">In the last {FAILED_LOGIN_WINDOW_HOURS} hours</p>
        </div>
      </div>
    </div>
  );
}
