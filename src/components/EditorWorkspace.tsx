import { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow,
  listManuscripts, getEditorAssignments, getReviewerAssignments, subscribeToManuscripts,
  respondToEditorAssignment, submitEditorAssessment, submitEditorRecommendation
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, Check, X as XIcon, Plus, Trash2 } from 'lucide-react';

interface EditorWorkspaceProps {
  manuscripts?: any[];
  onUpdateManuscript?: (m: any) => void;
  onDeleteManuscript?: (id: string) => void;
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

interface Row { manuscript: ManuscriptRow; assignment: EditorAssignmentRow; }

export default function EditorWorkspace({ currentUser }: EditorWorkspaceProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState<string | null>(null);

  const load = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const manuscripts = await listManuscripts();
      const withAssignments: Row[] = [];
      for (const m of manuscripts) {
        const assignments = await getEditorAssignments(m.id);
        const mine = assignments.find((a) => a.editor_id === data.user?.id);
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
        <h1 className="text-lg font-black text-slate-900">Editor Workspace</h1>
        <p className="text-xs text-slate-500 font-semibold">{currentUser?.name} &middot; {currentUser?.email}</p>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
        ) : selected ? (
          <AssignmentDetail row={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} />
        ) : (
          <AssignmentList rows={rows} onOpen={setSelectedManuscriptId} />
        )}
      </main>
    </div>
  );
}

function AssignmentList({ rows, onOpen }: { rows: Row[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="text-center py-24 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-400">No manuscript assignments yet.</div>;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Manuscript Status</th>
            <th className="px-4 py-3">Assignment</th>
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

function AssignmentDetail({ row, onBack, onChanged }: { row: Row; onBack: () => void; onChanged: () => void }) {
  const { manuscript, assignment } = row;
  const [reviewerAssignments, setReviewerAssignments] = useState<ReviewerAssignmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getReviewerAssignments(manuscript.id).then(setReviewerAssignments);
  }, [manuscript.id]);

  const respond = async (accept: boolean) => {
    setBusy(true); setError('');
    try { await respondToEditorAssignment(assignment.id, accept); onChanged(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const allReviewsIn = reviewerAssignments.length > 0 && reviewerAssignments.every((r) => r.status === 'SUBMITTED' || r.status === 'DECLINED');

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to assignments
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-slate-400">{manuscript.id}</p>
            <h2 className="text-lg font-black text-slate-900 mt-1">{manuscript.title}</h2>
          </div>
          <StatusBadge status={manuscript.status} />
        </div>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{manuscript.abstract}</p>
        {manuscript.cover_letter && (
          <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
            <p className="font-bold text-slate-500 mb-1">Cover Letter</p>
            {manuscript.cover_letter}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {assignment.status === 'INVITED' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-3">You've been assigned this manuscript</h3>
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

      {assignment.status === 'ACCEPTED' && assignment.assessment_status === 'NOT_STARTED' && (
        <EvaluationForm assignmentId={assignment.id} onSubmitted={onChanged} />
      )}

      {assignment.assessment_status === 'SUBMITTED' && manuscript.status === 'EDITOR_REVIEW' && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 text-xs text-sky-700">
          Assessment submitted. Waiting for the Coordinator to assign reviewers.
        </div>
      )}

      {reviewerAssignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-3">Reviewer Feedback</h3>
          <div className="space-y-3">
            {reviewerAssignments.map((r) => (
              <div key={r.id} className="border border-slate-100 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700">Reviewer</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${r.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.status}</span>
                </div>
                {r.status === 'SUBMITTED' && (
                  <div className="space-y-1 text-slate-600 mt-1">
                    <p><strong>Recommendation:</strong> {r.recommendation?.replace(/_/g, ' ')}</p>
                    <p><strong>To Editor:</strong> {r.comments_to_editor}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {manuscript.status === 'AWAITING_DECISION' && !assignment.recommendation && allReviewsIn && (
        <RecommendationForm
          busy={busy}
          onSubmit={async (rec) => {
            setBusy(true); setError('');
            try { await submitEditorRecommendation(manuscript.id, rec); onChanged(); }
            catch (e: any) { setError(e.message); }
            finally { setBusy(false); }
          }}
        />
      )}

      {assignment.recommendation && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-xs text-emerald-800">
          Your recommendation: <strong>{assignment.recommendation.replace(/_/g, ' ')}</strong> &mdash; awaiting Coordinator's final decision.
        </div>
      )}
    </div>
  );
}

interface ScoreState {
  scientificMerit: number; noveltyInnovation: number; methodologyQuality: number;
  literatureAdequacy: number; ethicalCompliance: number; dataReliability: number; writingQuality: number;
}

function EvaluationForm({ assignmentId, onSubmitted }: { assignmentId: string; onSubmitted: () => void }) {
  const [scores, setScores] = useState<ScoreState>({
    scientificMerit: 7, noveltyInnovation: 7, methodologyQuality: 7, literatureAdequacy: 7, ethicalCompliance: 7, dataReliability: 7, writingQuality: 7
  });
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [mandatoryRevisions, setMandatoryRevisions] = useState('');
  const [commentsToCoordinator, setCommentsToCoordinator] = useState('');
  const [suggested, setSuggested] = useState<{ name: string; email: string; note: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setScore = (key: keyof ScoreState, value: number) => setScores((s) => ({ ...s, [key]: value }));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await submitEditorAssessment(assignmentId, {
        ...scores, strengths, weaknesses, mandatoryRevisions, commentsToCoordinator,
        suggestedReviewers: suggested.filter((s) => s.name.trim())
      });
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
      <h3 className="text-sm font-black text-slate-900">Editor Evaluation</h3>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2">{error}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {scoreFields.map(([key, label]) => (
          <div key={key}>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</label>
            <input type="number" min={1} max={10} value={scores[key]} onChange={(e) => setScore(key, Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        ))}
      </div>
      <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} placeholder="Strengths" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <textarea value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} rows={2} placeholder="Weaknesses" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <textarea value={mandatoryRevisions} onChange={(e) => setMandatoryRevisions(e.target.value)} rows={2} placeholder="Mandatory revisions (if any)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
      <textarea value={commentsToCoordinator} onChange={(e) => setCommentsToCoordinator(e.target.value)} rows={2} placeholder="Comments to Coordinator" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-slate-600">Suggested Reviewers</label>
          <button onClick={() => setSuggested([...suggested, { name: '', email: '', note: '' }])} className="text-[11px] font-bold text-[#008751] cursor-pointer flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
        </div>
        <div className="space-y-2">
          {suggested.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <input value={s.name} onChange={(e) => setSuggested(suggested.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <input value={s.email} onChange={(e) => setSuggested(suggested.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} placeholder="Email" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <div className="flex gap-1">
                <input value={s.note} onChange={(e) => setSuggested(suggested.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} placeholder="Note" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1" />
                <button onClick={() => setSuggested(suggested.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button disabled={busy} onClick={submit} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-5 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit Assessment to Coordinator
      </button>
    </div>
  );
}

function RecommendationForm({ busy, onSubmit }: { busy: boolean; onSubmit: (rec: ReviewerRecommendation) => void }) {
  const [rec, setRec] = useState<ReviewerRecommendation>('MINOR_REVISION');
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-black text-slate-900 mb-3">Submit Your Recommendation</h3>
      <select value={rec} onChange={(e) => setRec(e.target.value as ReviewerRecommendation)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs mb-3">
        <option value="ACCEPT">Accept</option>
        <option value="MINOR_REVISION">Minor Revision</option>
        <option value="MAJOR_REVISION">Major Revision</option>
        <option value="REJECT">Reject</option>
      </select>
      <button disabled={busy} onClick={() => onSubmit(rec)} className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Recommendation'}
      </button>
    </div>
  );
}
