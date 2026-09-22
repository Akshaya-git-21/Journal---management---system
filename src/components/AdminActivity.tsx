import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDisplayDate, zoneOptions } from '../lib/displayPrefs';
import { actionLabel, detailSummary, inferModule, roleWord } from '../lib/activityLabels';
import { Role } from '../types';

interface PersonSummary {
  user_id: string;
  name: string;
  email: string;
  role: Role | null;
  status: string;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
  last_action: string | null;
  last_category: string | null;
  last_target_role: string | null;
}

interface ActivityRow {
  id: string;
  created_at: string;
  action: string;
  target_name: string | null;
  target_email: string | null;
  target_role: string | null;
  category: string | null;
  manuscript_id: string | null;
  manuscript_title: string | null;
  details: Record<string, any> | null;
}

const ROLE_ORDER: Role[] = ['ADMIN', 'COORDINATOR', 'EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER', 'AUTHOR'];
// Someone with a logged action in the last 5 minutes counts as "Active now".
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const FEED_PAGE = 20;
type Period = 'TODAY' | '7D' | '30D' | 'ALL' | 'CUSTOM';
const PERIOD_LABEL: Record<Period, string> = { TODAY: 'Today', '7D': 'Last 7 days', '30D': 'Last 30 days', ALL: 'All time', CUSTOM: 'Custom range' };

const timeText = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', ...zoneOptions() });

/** "3 minutes ago" / "2 hours ago" / "5 days ago" / "Never". */
function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDisplayDate(iso);
}

const isActiveNow = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < ACTIVE_WINDOW_MS;

/** Period + optional custom dates -> the [from, to) range to send to the RPC. */
function periodRange(period: Period, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'TODAY') return { from: startOfToday.toISOString(), to: null };
  if (period === '7D') { const d = new Date(startOfToday); d.setDate(d.getDate() - 6); return { from: d.toISOString(), to: null }; }
  if (period === '30D') { const d = new Date(startOfToday); d.setDate(d.getDate() - 29); return { from: d.toISOString(), to: null }; }
  if (period === 'CUSTOM') {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : null;
    const to = customTo ? (() => { const d = new Date(`${customTo}T00:00:00`); d.setDate(d.getDate() + 1); return d.toISOString(); })() : null;
    return { from, to };
  }
  return { from: null, to: null }; // ALL
}

function ActivityFeed({ person, from, to }: { person: PersonSummary; from: string | null; to: string | null }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    const { data, error: rpcError } = await supabase.rpc('admin_activity_search', {
      p_person: person.email, p_from: from, p_to: to, p_limit: FEED_PAGE, p_offset: offset,
    });
    if (rpcError) setError(rpcError.message);
    else {
      const page = (data ?? []) as ActivityRow[];
      setRows((prev) => (append ? [...(prev ?? []), ...page] : page));
      setHasMore(page.length >= FEED_PAGE);
      setError(null);
    }
    setLoadingMore(false);
  };

  useEffect(() => { load(0, false); }, [person.email, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="px-4 py-3 text-xs text-red-700">{error}</div>;
  if (!rows) return <div className="px-4 py-6 text-center text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading activity...</div>;
  if (rows.length === 0) return <div className="px-4 py-6 text-center text-slate-400 text-sm">No activity in this period.</div>;

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((r) => {
        const module = inferModule(r);
        return (
          <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">{actionLabel(r.action)}{module && <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 align-middle">{module}</span>}</p>
              {(r.target_name || r.target_email || r.manuscript_id) && (
                <p className="text-xs text-slate-500 truncate">
                  {r.target_name || r.target_email}
                  {r.manuscript_id ? `${r.target_name || r.target_email ? ' · ' : ''}${r.manuscript_id}${r.manuscript_title ? ` · ${r.manuscript_title}` : ''}` : ''}
                </p>
              )}
              {detailSummary(r.details) && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{detailSummary(r.details)}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold text-slate-600">{formatDisplayDate(r.created_at)}</p>
              <p className="text-[11px] text-slate-400">{timeText(r.created_at)}</p>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <div className="px-4 py-3 text-center">
          <button onClick={() => load(rows.length, true)} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Load more
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminActivity() {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role | ''>('');
  const [personId, setPersonId] = useState('');
  const [period, setPeriod] = useState<Period>('TODAY');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_user_activity_summary');
    if (rpcError) setError(rpcError.message);
    else { setPeople((data ?? []) as PersonSummary[]); setError(null); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase.channel('admin-activity-summary-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => { load(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Recompute "Active now" every 30s so it ages out on its own.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    people.forEach((p) => { const r = p.role || ''; c[r] = (c[r] || 0) + 1; });
    return c;
  }, [people]);

  const namesForRole = useMemo(() => people.filter((p) => p.role === role).sort((a, b) => a.name.localeCompare(b.name)), [people, role]);
  const selected = useMemo(() => people.find((p) => p.user_id === personId) || null, [people, personId]);
  // `now` isn't read directly -- its 30s ticks just force this render to
  // re-run isActiveNow() so "Active now" ages out on its own.
  const activeNow = now > 0 && isActiveNow(selected?.last_activity_at ?? null);

  const { from, to } = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const module = selected ? inferModule(selected) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Administration</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">Activity</h1>
        <p className="mt-1 text-sm text-slate-500">Choose a role, then a person, to see when they last signed in and what they've been doing.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold mb-1">Role</label>
          <select value={role} onChange={(e) => { setRole(e.target.value as Role | ''); setPersonId(''); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-[#008751] focus:outline-none">
            <option value="">Choose a role...</option>
            {ROLE_ORDER.map((r) => <option key={r} value={r}>{roleWord(r)} ({counts[r] || 0})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold mb-1">Person</label>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={!role} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-[#008751] focus:outline-none disabled:opacity-50">
            <option value="">{role ? 'Choose a person...' : 'Choose a role first'}</option>
            {namesForRole.map((p) => <option key={p.user_id} value={p.user_id}>{p.name || p.email}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{error}{/does not exist|schema cache/i.test(error) ? ' — run the 0120 SQL in Supabase (SQL Editor).' : ''}</div>}

      {loading ? (
        <div className="px-4 py-14 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...</div>
      ) : !selected ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl px-6 py-16 text-center text-sm text-slate-400">
          {role ? 'Choose a person to see their activity.' : 'Choose a role, then a person, to see their activity.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 grid gap-4 sm:grid-cols-4 border-b border-slate-100">
            <div className="sm:col-span-4 flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-slate-900">{selected.name || selected.email}</h2>
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{roleWord(selected.role)}</span>
              <span className="text-xs text-slate-400">{selected.email}</span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Status</p>
              {activeNow ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
                  Active now
                </p>
              ) : (
                <p className="mt-1 text-sm font-bold text-slate-800">{timeAgo(selected.last_activity_at)}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Last login</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{timeAgo(selected.last_sign_in_at)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Last accessed module</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{module || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Last activity</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{selected.last_action ? actionLabel(selected.last_action) : '—'}</p>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
            {(['TODAY', '7D', '30D', 'ALL', 'CUSTOM'] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${period === p ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {PERIOD_LABEL[p]}
              </button>
            ))}
            {period === 'CUSTOM' && (
              <span className="inline-flex items-center gap-2 ml-1">
                <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#008751] focus:outline-none" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#008751] focus:outline-none" />
              </span>
            )}
          </div>

          <ActivityFeed person={selected} from={from} to={to} />
        </div>
      )}
    </div>
  );
}
