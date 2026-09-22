import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart, Radar, RadarChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { Activity, CalendarDays, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ManuscriptRow, ProfileRow, StatusHistoryRow, subscribeToManuscripts } from '../lib/workflow';
import { getManuscriptStatusLabel } from '../lib/manuscriptStatusLabel';

type Range = '7D' | '30D' | '90D' | '12M';
const RANGES: { key: Range; label: string }[] = [
  { key: '7D', label: '7 days' },
  { key: '30D', label: '30 days' },
  { key: '90D', label: '90 days' },
  { key: '12M', label: '12 months' },
];

const CRITERIA = [
  ['scientific_merit', 'Scientific merit'],
  ['novelty_innovation', 'Novelty'],
  ['methodology_quality', 'Methodology'],
  ['literature_adequacy', 'Literature'],
  ['ethical_compliance', 'Ethics'],
  ['data_reliability', 'Data'],
  ['writing_quality', 'Writing'],
] as const;

const PALETTE = ['#10b981', '#6366f1', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#64748b'];
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: '#f59e0b',
  'EDITORIAL REVIEW': '#3b82f6',
  'IN REVISION': '#f97316',
  'PEER REVIEW': '#8b5cf6',
  'PEER REVIEW 2': '#8b5cf6',
  ACCEPTED: '#10b981',
  REJECTED: '#ef4444',
  PROOFREADING: '#0ea5e9',
  'PRODUCTION PREPARATION': '#14b8a6',
  'EDITOR ASSIGNED': '#6366f1',
  'IN PUBLISH': '#a855f7',
  PUBLISHED: '#047857',
};
const RECOMMENDATION_LABELS: Record<string, string> = {
  ACCEPT: 'Accept',
  MINOR_REVISION: 'Minor revision',
  MAJOR_REVISION: 'Major revision',
  REJECT: 'Reject',
  ADDITIONAL_REVIEW: 'Additional review',
};
const RECOMMENDATION_COLORS: Record<string, string> = {
  ACCEPT: '#10b981',
  MINOR_REVISION: '#0ea5e9',
  MAJOR_REVISION: '#f59e0b',
  REJECT: '#ef4444',
  ADDITIONAL_REVIEW: '#8b5cf6',
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86_400_000;

interface ReviewerAssignmentLite {
  reviewer_id: string;
  status: string;
  invited_at: string | null;
  submitted_at: string | null;
  recommendation: string | null;
  [criterion: string]: any;
}
interface EditorAssignmentLite {
  editor_id: string;
  status: string;
  assessment_status: string | null;
  [criterion: string]: any;
}
interface AnalyticsData {
  reviewerAssignments: ReviewerAssignmentLite[];
  editorAssignments: EditorAssignmentLite[];
  history: StatusHistoryRow[];
}

async function fetchAnalyticsData(): Promise<AnalyticsData> {
  const [reviewerRes, editorRes, historyRes] = await Promise.all([
    supabase.from('reviewer_assignments').select('*'),
    supabase.from('editor_assignments').select('*'),
    supabase.from('manuscript_status_history').select('*').order('created_at', { ascending: false }).limit(2000),
  ]);
  const firstError = reviewerRes.error || editorRes.error || historyRes.error;
  if (firstError) throw new Error(firstError.message);
  return {
    reviewerAssignments: (reviewerRes.data ?? []) as ReviewerAssignmentLite[],
    editorAssignments: (editorRes.data ?? []) as EditorAssignmentLite[],
    history: (historyRes.data ?? []) as StatusHistoryRow[],
  };
}

interface Bucket { label: string; start: number; end: number }

function makeBuckets(range: Range): Bucket[] {
  const now = new Date();
  if (range === '12M') {
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const end = new Date(now.getFullYear(), now.getMonth() - (10 - i), 1);
      return { label: start.toLocaleString('en', { month: 'short' }), start: start.getTime(), end: end.getTime() };
    });
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const step = range === '90D' ? 7 * DAY_MS : DAY_MS;
  const count = range === '7D' ? 7 : range === '30D' ? 30 : 13;
  return Array.from({ length: count }, (_, i) => {
    const end = tomorrow - (count - 1 - i) * step;
    const start = end - step;
    return { label: new Date(start).toLocaleDateString('en', { month: 'short', day: 'numeric' }), start, end };
  });
}

const countIn = (times: number[], b: Bucket) => times.filter((t) => t >= b.start && t < b.end).length;
const toTime = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const round1 = (n: number) => Math.round(n * 10) / 10;

function timeAgo(iso: string, nowMs: number) {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 6px 20px rgba(15,23,42,.08)' };
const axisTick = { fontSize: 11, fill: '#94a3b8' };

function Card({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-white border border-slate-200 p-5 shadow-sm ${className}`}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">{title}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty({ text = 'No data yet' }: { text?: string }) {
  return <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">{text}</div>;
}

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200 relative overflow-hidden">
      <span className="absolute left-0 top-5 bottom-5 w-1 rounded-r-full" style={{ background: accent || '#10b981' }} />
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-black text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function Gauge({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ name: label, value: clamped, fill: color }]} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
            <RadialBar dataKey="value" cornerRadius={12} background={{ fill: '#f1f5f9' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-slate-900">{Math.round(clamped)}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-700 -mt-2">{label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

interface Props {
  items: ManuscriptRow[];
  editors: ProfileRow[];
  reviewers: ProfileRow[];
  overdueReviews: number;
  productionByManuscript: Record<string, string>;
}

export default function ReportsAnalyticsDashboard({ items, editors, reviewers, overdueReviews, productionByManuscript }: Props) {
  const [range, setRange] = useState<Range>('30D');
  const [data, setData] = useState<AnalyticsData>({ reviewerAssignments: [], editorAssignments: [], history: [] });
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [nowMs, setNowMs] = useState(Date.now());

  // Live data: refetch the supporting tables whenever any workflow table
  // changes (same subscription the manuscript queue uses). `items` itself is
  // pushed down from the workspace, which reloads on the same events.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchAnalyticsData()
        .then((d) => { if (!cancelled) { setData(d); setError(null); setLastUpdated(new Date()); } })
        .catch((e) => { if (!cancelled) setError(e.message || 'Unable to load analytics.'); });
    };
    refresh();
    const unsubscribe = subscribeToManuscripts(refresh);
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  useEffect(() => { setLastUpdated(new Date()); }, [items, editors, reviewers]);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const analytics = useMemo(() => {
    const { reviewerAssignments, editorAssignments, history } = data;
    const buckets = makeBuckets(range);
    const manuscriptsById = new Map(items.map((m) => [m.id, m]));
    const eventTimes = (status: string) => history.filter((h) => h.to_status === status && manuscriptsById.has(h.manuscript_id)).map((h) => toTime(h.created_at));

    const submittedTimes = items.map((m) => toTime(m.submitted_at || m.created_at)).filter((t) => !isNaN(t));
    const acceptedTimes = eventTimes('ACCEPTED');
    const rejectedTimes = eventTimes('REJECTED');
    const publishedTimes = items.map((m) => toTime(m.published_at)).filter((t) => !isNaN(t));

    const trend = buckets.map((b) => ({
      label: b.label,
      Submissions: countIn(submittedTimes, b),
      Accepted: countIn(acceptedTimes, b),
      Rejected: countIn(rejectedTimes, b),
      Published: countIn(publishedTimes, b),
    }));

    const rangeStart = buckets[0].start;
    const prevStart = rangeStart - (buckets[buckets.length - 1].end - rangeStart);
    const inRange = submittedTimes.filter((t) => t >= rangeStart).length;
    const inPrev = submittedTimes.filter((t) => t >= prevStart && t < rangeStart).length;

    // Cumulative volume over time (all-time running total sampled per bucket).
    const cumulative = buckets.map((b) => ({ label: b.label, Manuscripts: submittedTimes.filter((t) => t < b.end).length }));

    const statusCounts = new Map<string, number>();
    for (const m of items) {
      const label = getManuscriptStatusLabel(m, null, productionByManuscript[m.id]);
      statusCounts.set(label, (statusCounts.get(label) || 0) + 1);
    }
    const statusData = [...statusCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Funnel: distinct manuscripts that have ever reached each stage.
    const reached = (status: string) => {
      const ids = new Set(history.filter((h) => h.to_status === status).map((h) => h.manuscript_id));
      for (const m of items) if (m.status === status) ids.add(m.id);
      return ids.size;
    };
    const funnel = [
      { stage: 'Submitted', value: items.length },
      { stage: 'Editor review', value: reached('EDITOR_REVIEW') },
      { stage: 'Peer review', value: reached('UNDER_REVIEW') },
      { stage: 'Decision', value: reached('AWAITING_DECISION') },
      { stage: 'Accepted', value: reached('ACCEPTED') },
      { stage: 'Published', value: reached('PUBLISHED') },
    ];

    const typeCounts = new Map<string, number>();
    for (const m of items) {
      const key = (m.manuscript_type || m.section || 'Unspecified').toString();
      typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    }
    const typeData = [...typeCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

    const recommendationCounts = new Map<string, number>();
    for (const r of reviewerAssignments) {
      if (r.recommendation) recommendationCounts.set(r.recommendation, (recommendationCounts.get(r.recommendation) || 0) + 1);
    }
    const recommendationData = [...recommendationCounts.entries()].map(([key, value]) => ({ key, name: RECOMMENDATION_LABELS[key] || key, value }));

    const responseCounts = { INVITED: 0, ACCEPTED: 0, SUBMITTED: 0, DECLINED: 0 } as Record<string, number>;
    for (const r of reviewerAssignments) responseCounts[r.status] = (responseCounts[r.status] || 0) + 1;
    const responseData = [
      { name: 'Invited', value: responseCounts.INVITED, fill: '#f59e0b' },
      { name: 'Accepted', value: responseCounts.ACCEPTED, fill: '#0ea5e9' },
      { name: 'Submitted', value: responseCounts.SUBMITTED, fill: '#10b981' },
      { name: 'Declined', value: responseCounts.DECLINED, fill: '#ef4444' },
    ];

    const avgOf = (rows: any[], key: string) => {
      const vals = rows.map((r) => Number(r[key])).filter((v) => Number.isFinite(v) && v > 0);
      return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };
    const radar = CRITERIA.map(([key, label]) => ({
      criterion: label,
      Reviewers: avgOf(reviewerAssignments, key),
      Editors: avgOf(editorAssignments, key),
    }));
    const radarHasData = radar.some((r) => r.Reviewers > 0 || r.Editors > 0);

    const turnaroundRows = reviewerAssignments
      .map((r) => ({ submitted: toTime(r.submitted_at), invited: toTime(r.invited_at) }))
      .filter((r) => !isNaN(r.submitted) && !isNaN(r.invited) && r.submitted >= r.invited);
    const turnaroundTrend = buckets.map((b) => {
      const rows = turnaroundRows.filter((r) => r.submitted >= b.start && r.submitted < b.end);
      return {
        label: b.label,
        'Avg days': rows.length ? round1(rows.reduce((a, r) => a + (r.submitted - r.invited) / DAY_MS, 0) / rows.length) : null,
        Reviews: rows.length,
      };
    });
    const avgTurnaround = turnaroundRows.length ? round1(turnaroundRows.reduce((a, r) => a + (r.submitted - r.invited) / DAY_MS, 0) / turnaroundRows.length) : null;

    const editorNames = new Map(editors.map((e) => [e.id, e.name]));
    const editorLoad = new Map<string, { Active: number; Pending: number }>();
    for (const a of editorAssignments) {
      if (a.status === 'DECLINED') continue;
      const row = editorLoad.get(a.editor_id) || { Active: 0, Pending: 0 };
      if (a.status === 'ACCEPTED') row.Active += 1; else row.Pending += 1;
      editorLoad.set(a.editor_id, row);
    }
    const editorData = [...editorLoad.entries()]
      .map(([id, v]) => ({ name: editorNames.get(id) || 'Editor', ...v, total: v.Active + v.Pending }))
      .sort((a, b) => b.total - a.total).slice(0, 8);

    const reviewerNames = new Map(reviewers.map((r) => [r.id, r.name]));
    const reviewerLoad = new Map<string, { Completed: number; 'In progress': number }>();
    for (const a of reviewerAssignments) {
      if (a.status === 'DECLINED') continue;
      const row = reviewerLoad.get(a.reviewer_id) || { Completed: 0, 'In progress': 0 };
      if (a.status === 'SUBMITTED') row.Completed += 1; else row['In progress'] += 1;
      reviewerLoad.set(a.reviewer_id, row);
    }
    const reviewerData = [...reviewerLoad.entries()]
      .map(([id, v]) => ({ name: reviewerNames.get(id) || 'Reviewer', ...v, total: v.Completed + v['In progress'] }))
      .sort((a, b) => b.total - a.total).slice(0, 8);

    const weekday = WEEKDAYS.map((day) => ({ day, Events: 0, Submissions: 0 }));
    for (const h of history) weekday[new Date(h.created_at).getDay()].Events += 1;
    for (const t of submittedTimes) weekday[new Date(t).getDay()].Submissions += 1;

    const accepted = items.filter((m) => m.status === 'ACCEPTED' || m.status === 'PUBLISHED').length;
    const rejected = items.filter((m) => m.status === 'REJECTED').length;
    const acceptanceRate = accepted + rejected > 0 ? (accepted / (accepted + rejected)) * 100 : 0;
    const reviewCompletion = reviewerAssignments.length
      ? (responseCounts.SUBMITTED / Math.max(1, reviewerAssignments.length - responseCounts.DECLINED)) * 100 : 0;
    const underReview = items.filter((m) => getManuscriptStatusLabel(m) === 'PEER REVIEW').length;
    const workloadIndex = items.length > 0 ? Math.min(100, Math.round((underReview / items.length) * 100)) : 0;

    const feed = history.slice(0, 10).map((h) => ({ ...h, title: manuscriptsById.get(h.manuscript_id)?.title || h.manuscript_id }));

    return {
      trend, cumulative, statusData, funnel, typeData, recommendationData, responseData, radar, radarHasData,
      turnaroundTrend, avgTurnaround, editorData, reviewerData, weekday, acceptanceRate, reviewCompletion,
      workloadIndex, inRange, inPrev, feed, underReview,
      awaitingDecision: items.filter((m) => m.status === 'AWAITING_DECISION').length,
      unassigned: items.filter((m) => m.status === 'SUBMITTED').length,
      published: items.filter((m) => m.status === 'PUBLISHED').length,
    };
  }, [data, items, range, editors, reviewers, productionByManuscript]);

  const delta = analytics.inPrev > 0 ? Math.round(((analytics.inRange - analytics.inPrev) / analytics.inPrev) * 100) : null;
  const rangeLabel = RANGES.find((r) => r.key === range)!.label;
  const totalReviewers = analytics.responseData.reduce((a, r) => a + r.value, 0);

  return (
    <div className="space-y-5 overflow-y-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Review editorial metrics and system activity at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" title="Charts refresh automatically when data changes">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
            {RANGES.map((r) => (
              <button key={r.key} type="button" onClick={() => setRange(r.key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${range === r.key ? 'bg-[#123c2f] text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> {new Date(nowMs).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">Some analytics could not be loaded: {error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total Manuscripts" value={items.length} hint={`${analytics.inRange} new in last ${rangeLabel}${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta}% vs prior)` : ''}`} accent="#10b981" />
        <Kpi label="Submitted" value={analytics.unassigned} hint="Awaiting editor assignment" accent="#f59e0b" />
        <Kpi label="Under Review" value={analytics.underReview} hint="In peer review" accent="#8b5cf6" />
        <Kpi label="Decision Pending" value={analytics.awaitingDecision} hint="Need a final decision" accent="#0ea5e9" />
        <Kpi label="Published" value={analytics.published} hint="Live in the journal" accent="#047857" />
        <Kpi label="Avg Review Turnaround" value={analytics.avgTurnaround !== null ? `${analytics.avgTurnaround}d` : '—'} hint="Invite → review submitted" accent="#6366f1" />
        <Kpi label="Overdue Reviews" value={overdueReviews} hint="Past reviewer due date" accent="#ef4444" />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card title="Submissions & decisions" subtitle={`Activity over the last ${rangeLabel}`} className="xl:col-span-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.trend} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="subFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Submissions" stroke="#10b981" strokeWidth={2.5} fill="url(#subFill)" />
                <Bar dataKey="Accepted" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="Rejected" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Line type="monotone" dataKey="Published" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Status distribution" subtitle="Where every manuscript is right now">
          {analytics.statusData.length === 0 ? <Empty /> : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.statusData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} cornerRadius={4}>
                    {analytics.statusData.map((s, i) => <Cell key={s.name} fill={STATUS_COLORS[s.name] || PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card title="Pipeline funnel" subtitle="Manuscripts that reached each stage">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.funnel} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="stage" width={90} tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="value" name="Manuscripts" radius={[0, 8, 8, 0]} barSize={20}>
                  {analytics.funnel.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Growth" subtitle="Cumulative manuscripts received">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.cumulative} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="stepAfter" dataKey="Manuscripts" stroke="#6366f1" strokeWidth={2.5} fill="url(#cumFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Manuscript types" subtitle="Volume by type / section">
          {analytics.typeData.length === 0 ? <Empty /> : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.typeData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={0} tickFormatter={(v: string) => v.length > 9 ? `${v.slice(0, 8)}…` : v} />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" name="Manuscripts" radius={[8, 8, 0, 0]} maxBarSize={32}>
                    {analytics.typeData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <Card title="Health gauges" subtitle="Key ratios" className="xl:col-span-2">
          <div className="grid grid-cols-3 gap-2">
            <Gauge label="Acceptance rate" value={analytics.acceptanceRate} color="#10b981" hint="Accepted / decided" />
            <Gauge label="Review completion" value={analytics.reviewCompletion} color="#6366f1" hint="Reviews submitted" />
            <Gauge label="Workload index" value={analytics.workloadIndex} color="#f59e0b" hint="In peer review" />
          </div>
        </Card>

        <Card title="Reviewer recommendations" subtitle="What reviewers advise">
          {analytics.recommendationData.length === 0 ? <Empty text="No reviews submitted yet" /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.recommendationData} dataKey="value" nameKey="name" outerRadius="85%" paddingAngle={2} cornerRadius={4}>
                    {analytics.recommendationData.map((r, i) => <Cell key={r.key} fill={RECOMMENDATION_COLORS[r.key] || PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Review invitations" subtitle={`${totalReviewers} reviewer assignments`}>
          {totalReviewers === 0 ? <Empty text="No invitations yet" /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.responseData} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" vertical={false} />
                  <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" name="Assignments" radius={[8, 8, 0, 0]} maxBarSize={36}>
                    {analytics.responseData.map((r) => <Cell key={r.name} fill={r.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card title="Review turnaround" subtitle="Average days from invite to submitted review">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.turnaroundTrend} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="Avg days" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Evaluation scores" subtitle="Average criterion score: reviewers vs editors">
          {!analytics.radarHasData ? <Empty text="No scored evaluations yet" /> : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={analytics.radar} outerRadius="72%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar name="Reviewers" dataKey="Reviewers" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                  <Radar name="Editors" dataKey="Editors" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Weekly rhythm" subtitle="Submissions and workflow events by weekday">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.weekday} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" vertical={false} />
                <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Submissions" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={16} />
                <Bar dataKey="Events" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card title="Editor workload" subtitle={`${editors.length} active editor profiles`}>
          {analytics.editorData.length === 0 ? <Empty text="No editor assignments yet" /> : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.editorData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Active" stackId="a" fill="#10b981" />
                  <Bar dataKey="Pending" stackId="a" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Reviewer leaderboard" subtitle={`${reviewers.length} active reviewer profiles`}>
          {analytics.reviewerData.length === 0 ? <Empty text="No reviewer assignments yet" /> : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.reviewerData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Completed" stackId="a" fill="#6366f1" />
                  <Bar dataKey="In progress" stackId="a" fill="#c7d2fe" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Live activity" subtitle="Latest workflow events">
          {analytics.feed.length === 0 ? <Empty text="No activity yet" /> : (
            <ul className="h-[260px] overflow-y-auto divide-y divide-slate-100 -my-2">
              {analytics.feed.map((h) => (
                <li key={h.id} className="py-2.5 flex items-start gap-2.5">
                  <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: STATUS_COLORS[h.to_status.replace('_', ' ')] || '#10b981' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate">{h.title}</p>
                    <p className="text-[11px] text-slate-500">{h.from_status ? `${h.from_status.replace(/_/g, ' ')} → ` : ''}{h.to_status.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />{timeAgo(h.created_at, nowMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
