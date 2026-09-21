import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, CheckCircle2, Download, Loader2, MonitorCog, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_SETTINGS, JournalSettings, getSettings, loadSettings, saveSettings } from '../lib/settings';
import {
  DATE_FORMAT_OPTIONS, DEFAULT_DISPLAY_PREFS, DisplayPrefs, ROWS_PER_PAGE_OPTIONS, SLA_DISMISSED_KEY, TIME_ZONE_OPTIONS,
  formatDisplayDate, getDisplayPrefs, setDisplayPrefs,
} from '../lib/displayPrefs';
import { downloadCsv } from '../lib/csv';
import { ManuscriptRow, ProfileRow, getRecentAuditLog } from '../lib/workflow';
import { getManuscriptStatusLabel } from '../lib/manuscriptStatusLabel';

type Tab = 'workflow' | 'profile' | 'access' | 'display' | 'export';

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'workflow', label: 'Workflow rules', icon: <SlidersHorizontal className="w-4 h-4" /> },
  { key: 'profile', label: 'Journal profile', icon: <BookOpen className="w-4 h-4" /> },
  { key: 'access', label: 'Team & access', icon: <ShieldCheck className="w-4 h-4" /> },
  { key: 'display', label: 'Display', icon: <MonitorCog className="w-4 h-4" /> },
  { key: 'export', label: 'Data & export', icon: <Download className="w-4 h-4" /> },
];

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function NumberField({ label, hint, value, min, max, unit, onChange }: { label: string; hint: string; value: number; min: number; max: number; unit: string; onChange: (n: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${inputClass} max-w-[140px]`} />
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
    </Field>
  );
}

const profileText = (list: ProfileRow[]) => list.map((p) => [
  p.name, p.email, p.status, p.metadata?.editorial_role || '', p.metadata?.specialization || p.metadata?.organization || '', p.created_at || '',
]);

export default function SettingsScreen({ items, editors, reviewers, publishers, gdMembers }: {
  items: ManuscriptRow[]; editors: ProfileRow[]; reviewers: ProfileRow[]; publishers: ProfileRow[]; gdMembers: ProfileRow[];
}) {
  const [tab, setTab] = useState<Tab>('workflow');
  const [draft, setDraft] = useState<JournalSettings>(getSettings());
  const [display, setDisplay] = useState<DisplayPrefs>(getDisplayPrefs());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [alertsReset, setAlertsReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((s) => { if (!cancelled) setDraft(s); })
      .catch((e) => { if (!cancelled) setLoadError(e.message || 'Unable to load saved settings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setWorkflow = (patch: Partial<JournalSettings['workflow']>) => setDraft((d) => ({ ...d, workflow: { ...d.workflow, ...patch } }));
  const setProfile = (patch: Partial<JournalSettings['profile']>) => setDraft((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  const setAccess = (patch: Partial<JournalSettings['access']>) => setDraft((d) => ({ ...d, access: { ...d.access, ...patch } }));

  const validate = (): string | null => {
    const { workflow, profile, access } = draft;
    if (!Number.isInteger(workflow.screeningSlaDays) || workflow.screeningSlaDays < 1 || workflow.screeningSlaDays > 60) return 'Desk screening SLA must be a whole number between 1 and 60 days.';
    if (!Number.isInteger(workflow.reviewDeadlineDays) || workflow.reviewDeadlineDays < 1 || workflow.reviewDeadlineDays > 120) return 'Default review deadline must be a whole number between 1 and 120 days.';
    if (!Number.isInteger(access.minPasswordLength) || access.minPasswordLength < 8 || access.minPasswordLength > 64) return 'Minimum password length must be a whole number between 8 and 64.';
    if (profile.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contactEmail.trim())) return 'Contact email is not a valid email address.';
    if (profile.website && !/^https?:\/\/\S+\.\S+$/i.test(profile.website.trim())) return 'Website must start with http:// or https://.';
    const issn = /^\d{4}-\d{3}[\dXx]$/;
    if (profile.issn && !issn.test(profile.issn.trim())) return 'ISSN must look like 1234-5678.';
    if (profile.eIssn && !issn.test(profile.eIssn.trim())) return 'eISSN must look like 1234-5678.';
    if (profile.doiPrefix && !/^10\.\d{4,9}$/.test(profile.doiPrefix.trim())) return 'DOI prefix must look like 10.1234.';
    return null;
  };

  const save = async () => {
    setSaveError(null);
    const problem = validate();
    if (problem) { setSaveError(problem); return; }
    setSaving(true);
    try {
      const trimmedProfile = Object.fromEntries(Object.entries(draft.profile).map(([k, v]) => [k, String(v).trim()])) as JournalSettings['profile'];
      await saveSettings({ ...draft, profile: trimmedProfile });
      setDisplayPrefs(display);
      setSavedAt(Date.now());
    } catch (e: any) {
      const msg = String(e.message || '');
      setSaveError(/journal_settings|schema cache|does not exist/i.test(msg)
        ? 'The settings table does not exist yet. Run the 0114 SQL in Supabase (SQL Editor), then save again.'
        : msg || 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportManuscripts = () => downloadCsv(`manuscripts-${stamp()}.csv`,
    ['ID', 'Title', 'Author', 'Author email', 'Status', 'Type', 'Language', 'Submitted', 'Published', 'DOI', 'Volume', 'Issue'],
    items.map((m) => [m.id, m.title, m.author_name, m.author_email, getManuscriptStatusLabel(m), m.manuscript_type || '', m.language, m.submitted_at || '', m.published_at || '', m.doi || '', m.volume || '', m.issue || '']));
  const exportPeople = (name: string, list: ProfileRow[], thirdHeader: string) => downloadCsv(`${name}-${stamp()}.csv`,
    ['Name', 'Email', 'Status', 'Editorial board role', thirdHeader, 'Joined'], profileText(list));
  const exportAudit = async () => {
    setExporting('audit');
    try {
      const rows = await getRecentAuditLog(5000);
      downloadCsv(`audit-trail-${stamp()}.csv`, ['When', 'Action', 'Manuscript', 'From status', 'To status', 'Actor'],
        rows.map((r) => [r.created_at, r.action, r.manuscript_id || (r.metadata as any)?.manuscript_id || '', r.before_status || '', r.after_status || '', r.actor_id || '']));
    } catch (e: any) {
      setSaveError(e.message || 'Unable to export the audit trail.');
    } finally {
      setExporting(null);
    }
  };

  const exports: { key: string; title: string; text: string; count?: number; run: () => void | Promise<void> }[] = [
    { key: 'manuscripts', title: 'Manuscripts', text: 'Every submitted manuscript with its status, dates and DOI.', count: items.length, run: exportManuscripts },
    { key: 'editors', title: 'Editorial board', text: 'Editors with their board role and discipline.', count: editors.length, run: () => exportPeople('editorial-board', editors, 'Discipline') },
    { key: 'reviewers', title: 'Reviewers', text: 'Reviewers with their specialty area.', count: reviewers.length, run: () => exportPeople('reviewers', reviewers, 'Specialty') },
    { key: 'publishers', title: 'Publishers', text: 'Publishers with their organization.', count: publishers.length, run: () => exportPeople('publishers', publishers, 'Organization') },
    { key: 'gd', title: 'GD Members', text: 'Production team members.', count: gdMembers.length, run: () => exportPeople('gd-members', gdMembers, '') },
    { key: 'audit', title: 'Audit trail', text: 'The most recent 5,000 workflow events.', run: exportAudit },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">Settings</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how the journal workflow runs, and how this dashboard looks for you.</p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Saved settings could not be loaded, so defaults are shown{/journal_settings|schema cache|does not exist/i.test(loadError) ? ' — the settings table has not been created yet (run the 0114 SQL in Supabase)' : `: ${loadError}`}.
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-3xl px-4 py-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${tab === t.key ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading settings...</div>
        ) : (
          <>
            {tab === 'workflow' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Workflow rules</h2>
                  <p className="text-sm text-slate-500 mt-1">Applies to the whole journal, for every Coordinator.</p>
                </div>
                <NumberField label="Desk screening SLA" unit="days" min={1} max={60} value={draft.workflow.screeningSlaDays} onChange={(n) => setWorkflow({ screeningSlaDays: n })}
                  hint="A submission still waiting in the unassigned queue after this many days shows as a warning on the dashboard." />
                <NumberField label="Default review deadline" unit="days" min={1} max={120} value={draft.workflow.reviewDeadlineDays} onChange={(n) => setWorkflow({ reviewDeadlineDays: n })}
                  hint="When you set a review timeline for reviewers, the end date is pre-filled this many days after the start date. You can still change it." />
              </div>
            )}

            {tab === 'profile' && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Journal profile</h2>
                  <p className="text-sm text-slate-500 mt-1">The journal name appears in the browser tab. The rest is the journal's reference record.</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Journal name"><input className={inputClass} value={draft.profile.name} onChange={(e) => setProfile({ name: e.target.value })} placeholder="Tulitics Journal of Research" /></Field>
                  <Field label="Short name"><input className={inputClass} value={draft.profile.shortName} onChange={(e) => setProfile({ shortName: e.target.value })} placeholder="TJR" /></Field>
                  <Field label="ISSN (print)"><input className={inputClass} value={draft.profile.issn} onChange={(e) => setProfile({ issn: e.target.value })} placeholder="1234-5678" /></Field>
                  <Field label="eISSN (online)"><input className={inputClass} value={draft.profile.eIssn} onChange={(e) => setProfile({ eIssn: e.target.value })} placeholder="8765-4321" /></Field>
                  <Field label="Publisher name"><input className={inputClass} value={draft.profile.publisher} onChange={(e) => setProfile({ publisher: e.target.value })} placeholder="Springer Nature" /></Field>
                  <Field label="DOI prefix"><input className={inputClass} value={draft.profile.doiPrefix} onChange={(e) => setProfile({ doiPrefix: e.target.value })} placeholder="10.1234" /></Field>
                  <Field label="Contact email"><input className={inputClass} value={draft.profile.contactEmail} onChange={(e) => setProfile({ contactEmail: e.target.value })} placeholder="editorial@journal.org" /></Field>
                  <Field label="Website"><input className={inputClass} value={draft.profile.website} onChange={(e) => setProfile({ website: e.target.value })} placeholder="https://journal.org" /></Field>
                  <Field label="Default language">
                    <select className={inputClass} value={draft.profile.language} onChange={(e) => setProfile({ language: e.target.value })}>
                      {['English', 'French', 'Spanish', 'German', 'Portuguese', 'Arabic', 'Chinese', 'Hindi'].map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {tab === 'access' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Team & access</h2>
                  <p className="text-sm text-slate-500 mt-1">Rules for accounts you create for editors, reviewers, publishers and GD members.</p>
                </div>
                <NumberField label="Minimum password length" unit="characters" min={8} max={64} value={draft.access.minPasswordLength} onChange={(n) => setAccess({ minPasswordLength: n })}
                  hint="Temporary passwords you type or generate when creating an account must be at least this long. The floor is 8." />
              </div>
            )}

            {tab === 'display' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Display</h2>
                  <p className="text-sm text-slate-500 mt-1">Personal to this browser — other Coordinators keep their own.</p>
                </div>
                <Field label="Date format" hint={`Preview: ${formatDisplayDate(new Date().toISOString(), display)}`}>
                  <select className={inputClass} value={display.dateFormat} onChange={(e) => setDisplay({ ...display, dateFormat: e.target.value as DisplayPrefs['dateFormat'] })}>
                    {DATE_FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.example})</option>)}
                  </select>
                </Field>
                <Field label="Time zone" hint="Used for the dashboard clock and for dates in the manuscript queue.">
                  <select className={inputClass} value={display.timeZone} onChange={(e) => setDisplay({ ...display, timeZone: e.target.value })}>
                    {TIME_ZONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Rows per page" hint="How many manuscripts the queue shows on each page.">
                  <select className={`${inputClass} max-w-[140px]`} value={display.rowsPerPage} onChange={(e) => setDisplay({ ...display, rowsPerPage: Number(e.target.value) })}>
                    {ROWS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Dismissed dashboard alerts</p>
                    <p className="text-xs text-slate-500 mt-0.5">Bring back SLA warnings you swiped away.</p>
                  </div>
                  <button type="button" onClick={() => { try { localStorage.removeItem(SLA_DISMISSED_KEY); } catch { /* ignore */ } setAlertsReset(true); }}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    {alertsReset ? 'Restored' : 'Show them again'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'export' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Data & export</h2>
                  <p className="text-sm text-slate-500 mt-1">Download a CSV copy that opens in Excel or Google Sheets.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {exports.map((x) => (
                    <div key={x.key} className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{x.title}{typeof x.count === 'number' && <span className="ml-2 text-xs font-semibold text-slate-400">{x.count}</span>}</p>
                        <p className="text-xs text-slate-500 mt-1">{x.text}</p>
                      </div>
                      <button type="button" onClick={() => x.run()} disabled={exporting === x.key || x.count === 0}
                        className="mt-auto inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {exporting === x.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download CSV
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab !== 'export' && (
              <div className="mt-8 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#007043] disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save settings
                </button>
                <button type="button" onClick={() => { setDraft(DEFAULT_SETTINGS); setDisplay(DEFAULT_DISPLAY_PREFS); setSaveError(null); }} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Reset to defaults
                </button>
                {savedAt && !saveError && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
              </div>
            )}
            {saveError && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{saveError}</div>}
          </>
        )}
      </div>
    </div>
  );
}
