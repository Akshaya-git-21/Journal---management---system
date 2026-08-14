import { useState, useEffect } from 'react';
import { ManuscriptRow } from '../../../lib/workflow';
import { supabase } from '../../../lib/supabase';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  manuscript: ManuscriptRow;
}

export function NotesTab({ manuscript }: Props) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Load existing notes
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const { data, error: err } = await supabase
          .from('manuscripts')
          .select('editors_notes')
          .eq('id', manuscript.id)
          .maybeSingle();

        if (err) throw err;
        if (data?.editors_notes) {
          setNotes(data.editors_notes);
        }
      } catch (e: any) {
        console.error('Failed to load notes:', e);
      }
    };

    loadNotes();
  }, [manuscript.id]);

  const handleSaveNotes = async () => {
    setLoading(true);
    setError('');
    setSaved(false);

    try {
      const { error: err } = await supabase
        .from('manuscripts')
        .update({ editors_notes: notes })
        .eq('id', manuscript.id);

      if (err) throw err;

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      console.error('Error saving notes:', e);
      setError(e.message || 'Failed to save notes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-4">Coordinator Notes</h3>
      <div className="space-y-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add internal notes for this manuscript..."
          className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          rows={8}
        />
        {error && (
          <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">{error}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveNotes}
            disabled={loading}
            className="px-4 py-2 bg-emerald-600 text-white font-bold text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Notes'
            )}
          </button>
          {saved && (
            <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
