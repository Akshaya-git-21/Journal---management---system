import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDisplayDate } from '../lib/displayPrefs';
import { adminReviewSignup } from '../lib/adminUsers';

interface Pending {
  id: string;
  name: string;
  email: string;
  requested_role: string | null;
  created_at: string | null;
  metadata: Record<string, any> | null;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin', COORDINATOR: 'Coordinator', EDITOR: 'Editor', REVIEWER: 'Reviewer', AUTHOR: 'Author', PUBLISHER: 'Publisher', GD_MEMBER: 'GD Member',
};

/** New account requests waiting for approval (moved here from the Coordinator). */
export default function AdminPendingApprovals() {
  const [items, setItems] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, requested_role, created_at, metadata')
      .eq('status', 'PENDING_APPROVAL')
      .order('created_at', { ascending: true });
    if (error) setLoadError(error.message);
    else { setItems((data ?? []) as Pending[]); setLoadError(null); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase.channel('admin-pending-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { load(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const decide = async (p: Pending, decision: 'APPROVE' | 'REJECT') => {
    setBusyId(p.id);
    setNotice(null);
    try {
      await adminReviewSignup(p.id, decision);
      const role = ROLE_LABEL[p.requested_role || 'AUTHOR'] || 'user';
      setNotice({ kind: 'ok', text: decision === 'APPROVE' ? `${p.name || p.email} was approved as ${role}.` : `${p.name || p.email}'s request was rejected.` });
      await load();
    } catch (e: any) {
      setNotice({ kind: 'error', text: e.message || 'Unable to update the request.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Administration</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Pending Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">Review and approve or reject new elevated-role account requests.</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">{items.length} pending</span>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-xs font-semibold underline">Dismiss</button>
        </div>
      )}
      {loadError && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Could not load requests: {loadError}. If this is a new setup, run the 0116 SQL in Supabase.</div>}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">There are no pending approvals at the moment.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          {items.map((p) => (
            <div key={p.id} className="border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1 text-xs text-slate-700">
                <p className="font-bold text-slate-900">{p.name || p.email}</p>
                <p>{p.email}</p>
                <p className="text-slate-500">Requested role: <span className="font-semibold text-slate-700">{ROLE_LABEL[p.requested_role || 'AUTHOR'] || p.requested_role}</span>{p.created_at ? <span> · requested {formatDisplayDate(p.created_at)}</span> : null}</p>
                {p.metadata?.affiliation && <p className="text-slate-500">Affiliation: <span className="font-semibold text-slate-700">{p.metadata.affiliation}</span></p>}
                {p.metadata?.expertise && <p className="text-slate-500">Expertise: <span className="font-semibold text-slate-700">{p.metadata.expertise}</span></p>}
              </div>
              <div className="flex gap-2">
                <button disabled={busyId === p.id} onClick={() => decide(p, 'APPROVE')} className="bg-[#008751] hover:bg-[#007043] text-white text-[11px] font-bold px-3 py-2 rounded-lg disabled:opacity-50">Approve</button>
                <button disabled={busyId === p.id} onClick={() => decide(p, 'REJECT')} className="border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-bold px-3 py-2 rounded-lg disabled:opacity-50">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
