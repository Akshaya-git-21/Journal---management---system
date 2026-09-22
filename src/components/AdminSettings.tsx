import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { DEFAULT_SETTINGS, JournalSettings, getSettings, loadSettings, saveSettings } from '../lib/settings';

type Tab = 'general' | 'security';
const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'general', label: 'General', icon: <BookOpen className="w-4 h-4" /> },
  { key: 'security', label: 'Password & Security', icon: <ShieldCheck className="w-4 h-4" /> },
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

/**
 * Admin-only settings -- a small subset of the same journal_settings row
 * Coordinators edit in their own Settings screen (src/components/SettingsScreen.tsx).
 * Only the fields with a real, already-defined use elsewhere in the app are
 * exposed here (journal profile, minimum password length); workflow SLAs stay
 * Coordinator-only since changing them changes manuscript workflow behavior,
 * and there's no email/notification or extra role-config system to expose.
 */
export default function AdminSettings() {
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<JournalSettings>(getSettings());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((s) => { if (!cancelled) setDraft(s); })
      .catch((e) => { if (!cancelled) setLoadError(e.message || 'Unable to load saved settings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setProfile = (patch: Partial<JournalSettings['profile']>) => setDraft((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  const setAccess = (patch: Partial<JournalSettings['access']>) => setDraft((d) => ({ ...d, access: { ...d.access, ...patch } }));

  const validate = (): string | null => {
    const { profile, access } = draft;
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
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 4000);
    } catch (e: any) {
      const msg = String(e.message || '');
      setSaveError(/journal_settings|schema cache|does not exist/i.test(msg)
        ? 'The settings table does not exist yet. Run the 0114 SQL in Supabase (SQL Editor), then save again.'
        : msg || 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Administration</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Journal-wide configuration. This is the same settings record Coordinators see in their own Settings screen.</p>
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
            {tab === 'general' && (
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

            {tab === 'security' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Password & security</h2>
                  <p className="text-sm text-slate-500 mt-1">Rules for accounts created for editors, reviewers, publishers, GD members and other Admins.</p>
                </div>
                <Field label="Minimum password length" hint="Temporary passwords typed or generated when creating an account must be at least this long. The floor is 8.">
                  <div className="flex items-center gap-2">
                    <input type="number" min={8} max={64} value={draft.access.minPasswordLength} onChange={(e) => setAccess({ minPasswordLength: Number(e.target.value) })} className={`${inputClass} max-w-[140px]`} />
                    <span className="text-sm text-slate-500">characters</span>
                  </div>
                </Field>
              </div>
            )}

            {saveError && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{saveError}</div>}

            <div className="mt-8 flex items-center gap-4 border-t border-slate-100 pt-6">
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-6 py-3 text-sm font-bold text-white hover:bg-[#007043] disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
              </button>
              {savedAt !== null && (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Saved</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
