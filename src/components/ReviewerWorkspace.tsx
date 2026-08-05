import { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, ReviewerAssignmentRow,
  listManuscripts, getReviewerAssignments, subscribeToManuscripts,
  respondToReviewInvite, submitReview
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, Check, X as XIcon } from 'lucide-react';

interface ReviewerWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (m: any) => void;
  currentUser?: { name: string; email: string; role: Role } | null;
}

const STATUS_STYLES: Record<ManuscriptStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
  EDITOR_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-purple-50 text-purple-700 border-purple-200',
  REVISION_REQUESTED: 'bg-orange-50 text-orange-700 border-orange-200',
  AWAITING_DECISION: 'bg-sky-50 text-sky-700 border-sky-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
};

function StatusBadge({ status }: { status: ManuscriptStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

interface Row { manuscript: ManuscriptRow; assignment: ReviewerAssignmentRow; }

export default function ReviewerWorkspace({ currentUser }: ReviewerWorkspaceProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState<string | null>(null);

  const load = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const manuscripts = await listManuscripts();
      const withAssignments: Row[] = [];
      for (const m of manuscripts) {
        const assignments = await getReviewerAssignments(m.id);
        const mine = assignments.find((a) => a.reviewer_id === data.user?.id);
        if (mine) withAssignments.push({ manuscript: m, assignment: mine });
      }
      setRows(withAssignments);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  const selected = rows.find((r) => r.manuscript.id === selectedManuscriptId) || null;

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
        <h1 className="text-lg font-black text-slate-900">Reviewer Workspace</h1>
        <p className="text-xs text-slate-500 font-semibold">{currentUser?.name} &middot; {currentUser?.email}</p>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
        ) : selected ? (
          <InvitationDetail row={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} />
        ) : (
          <InvitationList rows={rows} onOpen={setSelectedManuscriptId} />
        )}
      </main>
    </div>
  );
}

function InvitationList({ rows, onOpen }: { rows: Row[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="text-center py-24 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-400">No review invitations yet.</div>;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Manuscript Status</th>
            <th className="px-4 py-3">Your Review</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ manuscript, assignment }) => (
            <tr key={manuscript.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(manuscript.id)}>
              <td className="px-4 py-3 font-bold text-slate-800">{manuscript.title}</td>
              <td className="px-4 py-3"><StatusBadge status={manuscript.status} /></td>
              <td className="px-4 py-3 text-xs font-bold text-slate-600">{assignment.status}</td>
              <td className="px-4 py-3 text-right text-[#008751] font-bold text-xs">Open &rarr;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvitationDetail({ row, onBack, onChanged }: { row: Row; onBack: () => void; onChanged: () => void }) {
  const { manuscript, assignment } = row;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const respond = async (accept: boolean) => {
    setBusy(true); setError('');
    try { await respondToReviewInvite(assignment.id, accept); onChanged(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to invitations
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-slate-400">{manuscript.id}</p>
            <h2 className="text-lg font-black text-slate-900 mt-1">
              {manuscript.is_double_blind ? 'Manuscript (Double-Blind)' : manuscript.title}
            </h2>
          </div>
          <StatusBadge status={manuscript.status} />
        </div>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{manuscript.abstract}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {assignment.status === 'INVITED' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-3">You've been invited to review this manuscript</h3>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => respond(true)} className="flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
              <Check className="w-4 h-4" /> Accept
            </button>
            <button disabled={busy} onClick={() => respond(false)} className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
              <XIcon className="w-4 h-4" /> Decline
            </button>
          </div>
        </div>
      )}

      {assignment.status === 'ACCEPTED' && (
        <ReviewForm assignmentId={assignment.id} onSubmitted={onChanged} />
      )}

      {assignment.status === 'SUBMITTED' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-xs text-emerald-800 space-y-1">
          <p className="font-black">Review submitted</p>
          <p><strong>Recommendation:</strong> {assignment.recommendation?.replace(/_/g, ' ')}</p>
          <p><strong>Comments to Author:</strong> {assignment.comments_to_author}</p>
          <p><strong>Comments to Editor:</strong> {assignment.comments_to_editor}</p>
        </div>
      )}
    </div>
  );
}

interface ScoreState {
  scientificMerit: number; noveltyInnovation: number; methodologyQuality: number;
  literatureAdequacy: number; ethicalCompliance: number; dataReliability: number; writingQuality: number;
}

function ReviewForm({ assignmentId, onSubmitted }: { assignmentId: string; onSubmitted: () => void }) {
  const [scores, setScores] = useState<ScoreState>({
    scientificMerit: 7, noveltyInnovation: 7, methodologyQuality: 7, literatureAdequacy: 7, ethicalCompliance: 7, dataReliability: 7, writingQuality: 7
  });
  const [recommendation, setRecommendation] = useState<ReviewerRecommendation>('MINOR_REVISION');
  const [commentsToAuthor, setCommentsToAuthor] = useState('');
  const [commentsToEditor, setCommentsToEditor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setScore = (key: keyof ScoreState, value: number) => setScores((s) => ({ ...s, [key]: value }));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await submitReview(assignmentId, { ...scores, recommendation, commentsToAuthor, commentsToEditor });
      onSubmitted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const scoreFields: [keyof ScoreState, string][] = [
    ['scientificMerit', 'Scientific Merit'], ['noveltyInnovation', 'Novelty / Innovation'], ['methodologyQuality', 'Methodology'],
    ['literatureAdequacy', 'Literature Adequacy'], ['ethicalCompliance', 'Ethical Compliance'], ['dataReliability', 'Data Reliability'], ['writingQuality', 'Writing Quality']
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
      <h3 className="text-sm font-black text-slate-900">Submit Your Review</h3>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2">{error}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {scoreFields.map(([key, label]) => (
          <div key={key}>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</label>
            <input type="number" min={1} max={10} value={scores[key]} onChange={(e) => setScore(key, Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">Recommendation</label>
        <select value={recommendation} onChange={(e) => setRecommendation(e.target.value as ReviewerRecommendation)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs">
          <option value="ACCEPT">Accept</option>
          <option value="MINOR_REVISION">Minor Revision</option>
          <option value="MAJOR_REVISION">Major Revision</option>
          <option value="REJECT">Reject</option>
          <option value="ADDITIONAL_REVIEW">Additional Review Needed</option>
        </select>
      </div>
      <textarea value={commentsToAuthor} onChange={(e) => setCommentsToAuthor(e.target.value)} rows={3} placeholder="Comments to Author" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <textarea value={commentsToEditor} onChange={(e) => setCommentsToEditor(e.target.value)} rows={3} placeholder="Confidential comments to Editor" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <button disabled={busy} onClick={submit} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-5 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit Review
      </button>
    </div>
  );
}
