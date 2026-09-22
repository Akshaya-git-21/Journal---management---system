import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSettings } from '../lib/settings';
import { logAuthEvent } from '../lib/activityEvents';

/**
 * Full-screen "choose your own password" step for accounts whose password was
 * set or reset by an Admin (profile.metadata.must_change_password). It renders
 * nothing for everyone else, so existing sign-in flows are unchanged. The user
 * cannot use the app until they set a new password (or sign out).
 */
export default function PasswordChangeGate({ userKey, onSignOut }: { userKey?: string; onSignOut?: () => void }) {
  const [needed, setNeeded] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const id = data.user?.id;
        if (!id) { if (active) setNeeded(false); return; }
        const { data: profile } = await supabase.from('profiles').select('metadata').eq('id', id).maybeSingle();
        if (active) setNeeded(profile?.metadata?.must_change_password === true);
      } catch {
        if (active) setNeeded(false);
      }
    })();
    return () => { active = false; };
  }, [userKey]);

  if (!needed) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const min = Math.max(8, getSettings().access.minPasswordLength);
    if (password.length < min) { setError(`Password must be at least ${min} characters.`); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id;
      if (id) {
        const { data: profile } = await supabase.from('profiles').select('metadata').eq('id', id).maybeSingle();
        const { must_change_password: _flag, ...rest } = (profile?.metadata ?? {}) as Record<string, unknown>;
        const { error: flagError } = await supabase.from('profiles').update({ metadata: rest }).eq('id', id);
        if (flagError) throw new Error(flagError.message);
      }
      void logAuthEvent('password_changed', { method: 'first_sign_in' });
      setNeeded(false);
    } catch (err: any) {
      setError(err.message || 'Unable to change the password.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
        <div className="bg-slate-950 px-8 py-6">
          <div className="flex items-center gap-2 uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold"><KeyRound className="w-4 h-4" /> First sign-in</div>
          <h2 className="mt-3 text-2xl font-black text-white">Choose your own password</h2>
        </div>
        <div className="space-y-4 px-8 py-8 bg-slate-50">
          <p className="text-sm text-slate-600">Your password was set by an administrator. Choose a new one to continue.</p>
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold mb-1.5">New password</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={saving} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold mb-1.5">Confirm new password</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={saving} className={inputClass} />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-1">
            {onSignOut && <button type="button" onClick={onSignOut} disabled={saving} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Sign out</button>}
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043] disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save new password
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
