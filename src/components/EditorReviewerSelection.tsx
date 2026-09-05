import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle, Users } from 'lucide-react';
import { ProfileRow, SuggestedReviewerRow, editorSelectReviewers } from '../lib/workflow';
import { supabase } from '../lib/supabase';

interface Props {
  manuscriptId: string;
  suggestedReviewers: SuggestedReviewerRow[];
  onSubmitSuccess: () => void;
}

export function EditorReviewerSelection({ manuscriptId, suggestedReviewers, onSubmitSuccess }: Props) {
  const [reviewers, setReviewers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('role', 'REVIEWER')
      .eq('status', 'ACTIVE')
      .order('name')
      .then(({ data, error: err }) => {
        if (err) setError('Failed to load the Reviewer Board.');
        setReviewers(data || []);
        setLoading(false);
      });
  }, []);

  const editorSelections = suggestedReviewers.filter(s => s.suggested_by === 'EDITOR');
  const alreadySelected = editorSelections.length > 0;

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  };

  const handleSubmit = async () => {
    if (selected.length !== 2) {
      setError('Please select exactly 2 reviewers.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await editorSelectReviewers(manuscriptId, [selected[0], selected[1]]);
      setSuccess('Reviewers selected. The Coordinator will send their invitations next.');
      onSubmitSuccess();
    } catch (e: any) {
      setError(e.message || 'Failed to select reviewers');
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadySelected) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-slate-700" />
        <h3 className="text-sm font-black text-slate-900">Select 2 Reviewers</h3>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="text-xs font-semibold">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-xs font-semibold">{success}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-slate-600 mr-2" />
          <p className="text-sm text-slate-600">Loading Reviewer Board...</p>
        </div>
      ) : reviewers.length === 0 ? (
        <p className="text-sm text-slate-600">No active reviewers in the Reviewer Board yet.</p>
      ) : (
        <div className="space-y-2">
          {reviewers.map(r => {
            const isSelected = selected.includes(r.id);
            return (
              <button
                type="button"
                key={r.id}
                onClick={() => toggle(r.id)}
                disabled={submitting}
                className={`w-full flex items-center justify-between p-3 border rounded-lg text-left transition ${
                  isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-600">{r.email}</p>
                </div>
                {isSelected && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-200 pt-3">
        Please select two suitable reviewers from the approved reviewer pool. Reviewer invitations will be sent by the
        Coordinator. If an invited reviewer declines or becomes unavailable, you may be asked to nominate a replacement.
        If no replacement is selected within the specified timeframe, the Coordinator may assign an appropriate reviewer
        from the approved reviewer pool.
      </p>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={selected.length !== 2 || submitting}
        className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        Confirm {selected.length}/2 Selected
      </button>
    </div>
  );
}
