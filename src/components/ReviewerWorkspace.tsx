import { useEffect, useState } from 'react';
import { Role, ManuscriptStatus, ReviewerRecommendation } from '../types';
import {
  ManuscriptRow, ReviewerAssignmentRow,
  listManuscripts, getReviewerAssignments, subscribeToManuscripts,
  respondToReviewInvite, submitReview
} from '../lib/workflow';
import { supabase } from '../lib/supabase';
import { Loader2, Check, X as XIcon, ChevronDown } from 'lucide-react';

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

interface Row { manuscript: ManuscriptRow; assignment: ReviewerAssignmentRow; }

export default function ReviewerWorkspace({ currentUser }: ReviewerWorkspaceProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTION_REQUIRED' | 'ALL' | 'COMPLETED' | 'DECLINED' | 'PUBLISHED' | 'CLOSED'>('ACTION_REQUIRED');

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

  const counts = {
    actionRequired: rows.filter((r) => r.assignment.status === 'INVITED' || r.assignment.status === 'ACCEPTED').length,
    total: rows.length,
    completed: rows.filter((r) => r.assignment.status === 'SUBMITTED').length,
    declined: rows.filter((r) => r.assignment.status === 'DECLINED').length,
    published: rows.filter((r) => r.manuscript.status === 'PUBLISHED').length,
    closed: rows.filter((r) => r.manuscript.status === 'REJECTED').length,
  };

  const filteredRows = rows.filter((row) => {
    switch (activeTab) {
      case 'ACTION_REQUIRED':
        return row.assignment.status === 'INVITED' || row.assignment.status === 'ACCEPTED';
      case 'COMPLETED':
        return row.assignment.status === 'SUBMITTED';
      case 'DECLINED':
        return row.assignment.status === 'DECLINED';
      case 'PUBLISHED':
        return row.manuscript.status === 'PUBLISHED';
      case 'CLOSED':
        return row.manuscript.status === 'REJECTED';
      case 'ALL':
      default:
        return true;
    }
  });

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  const selected = rows.find((r) => r.manuscript.id === selectedManuscriptId) || null;

  const menuItems = [
    { id: 'ACTION_REQUIRED' as const, label: 'Action Required', count: counts.actionRequired, icon: '⚠️' },
    { id: 'ALL' as const, label: 'All Assignments', count: counts.total, icon: '📋' },
    { id: 'COMPLETED' as const, label: 'Completed', count: counts.completed, icon: '✓' },
    { id: 'DECLINED' as const, label: 'Declined Reports', count: counts.declined, icon: '✕' },
    { id: 'PUBLISHED' as const, label: 'Published Papers', count: counts.published, icon: '📄' },
    { id: 'CLOSED' as const, label: 'Closed Records', count: counts.closed, icon: '🔒' },
  ];

  return (
    <div className="w-full min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 bg-white md:border-r border-slate-200 p-6 md:min-h-screen md:overflow-y-auto">
        {/* Profile Card */}
        <div className="bg-gradient-to-b from-[#1a4038] to-[#0f2e2a] text-white rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/30 flex items-center justify-center border border-emerald-400/50">
              <span className="text-lg">👤</span>
            </div>
            <div className="flex-1">
              <h3 className="font-black text-sm leading-tight">{currentUser?.name || 'Reviewer'}</h3>
              <p className="text-emerald-200/80 text-xs font-bold uppercase tracking-wide">ASSIGNED VALIDATOR</p>
            </div>
          </div>
          <div className="space-y-3 border-t border-emerald-800/40 pt-3">
            <div>
              <p className="text-emerald-100/70 text-xs uppercase tracking-wider font-semibold mb-1">Active Dummy Reviewer Persona:</p>
              <div className="flex items-center gap-2 bg-emerald-900/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-100">
                <span>{currentUser?.name || 'Reviewer'}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-auto" />
              </div>
            </div>
            <div className="pt-2 border-t border-emerald-800/40">
              <p className="text-emerald-100/70 text-xs uppercase tracking-wider font-semibold mb-1">Reviews Filed:</p>
              <p className="text-2xl font-black text-emerald-300">{counts.completed} <span className="text-xs text-emerald-200/70 font-semibold">Complete</span></p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest font-bold text-slate-400 px-2 mb-3">MY ACTIVE ASSIGNMENTS</p>
          {menuItems.slice(0, 2).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all font-semibold text-xs ${
                activeTab === item.id
                  ? 'bg-[#008751] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === item.id ? 'bg-white/20' : 'bg-slate-100'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}

          <p className="text-xs uppercase tracking-widest font-bold text-slate-400 px-2 mb-3 mt-4">REVIEW STATUS</p>
          {menuItems.slice(2).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all font-semibold text-xs ${
                activeTab === item.id
                  ? 'bg-[#008751] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === item.id ? 'bg-white/20' : 'bg-slate-100'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}

          <p className="text-xs uppercase tracking-widest font-bold text-slate-400 px-2 mb-3 mt-4">ADDITIONAL MODULES</p>
          <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-all font-semibold text-xs">
            <span>👁️</span>
            <span>Active Review Invites</span>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-all font-semibold text-xs">
            <span>📜</span>
            <span>Historic Logs</span>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-all font-semibold text-xs">
            <span>⭐</span>
            <span>Scoring Rubric</span>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-all font-semibold text-xs">
            <span>📊</span>
            <span>Performance Score</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-black text-slate-900 mb-1">ACTION REQUIRED ASSIGNMENTS</h1>
          <p className="text-sm text-slate-500 font-semibold mb-6">Select items below to accept, decline, or compose consensus reviews.</p>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          ) : selected ? (
            <ManuscriptDetail row={selected} onBack={() => setSelectedManuscriptId(null)} onChanged={load} />
          ) : (
            <ManuscriptList rows={filteredRows} onOpen={setSelectedManuscriptId} />
          )}
        </div>
      </div>
    </div>
  );
}

function ManuscriptList({ rows, onOpen }: { rows: Row[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-400">No assignments in this category.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map(({ manuscript, assignment }) => (
        <div
          key={manuscript.id}
          onClick={() => onOpen(manuscript.id)}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#008751] hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-slate-400">{manuscript.id}</span>
                <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700">
                  {assignment.status === 'INVITED' ? 'INVITATION' : 'ACCEPTED FOR REVIEW'}
                </span>
              </div>
              <h3 className="font-black text-base text-slate-900 mb-2 leading-snug">{manuscript.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{manuscript.abstract?.substring(0, 150)}...</p>
              {assignment.status === 'ACCEPTED' && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-xs font-bold text-emerald-800">⚙️ Reviewer Evaluation Pending Submission</p>
                  <p className="text-xs text-emerald-700 mt-1">This manuscript is waiting for your manual scholarly critique. Please review the blinded PDF galley proof thoroughly and compile your assessment score indices, recommendation and reports.</p>
                </div>
              )}
            </div>
            <div className="text-right">
              <span className="text-[#008751] font-bold text-sm">Open →</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ManuscriptDetail({ row, onBack, onChanged }: { row: Row; onBack: () => void; onChanged: () => void }) {
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
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer underline">
        ← Back to assignments
      </button>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="font-mono text-xs text-slate-400">{manuscript.id}</p>
            <h2 className="text-lg font-black text-slate-900 mt-1">{manuscript.title}</h2>
          </div>
          <span className="px-2.5 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700">
            {manuscript.status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{manuscript.abstract}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {assignment.status === 'INVITED' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-black text-slate-900 mb-3">Accept or Decline Review Invitation</h3>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => respond(true)} className="flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 transition-all">
              <Check className="w-4 h-4" /> ACCEPT REVIEW INVITATION
            </button>
            <button disabled={busy} onClick={() => respond(false)} className="flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 transition-all">
              <XIcon className="w-4 h-4" /> DECLINE
            </button>
          </div>
        </div>
      )}

      {assignment.status === 'ACCEPTED' && (
        <ReviewForm manuscript={manuscript} assignmentId={assignment.id} onSubmitted={onChanged} />
      )}

      {assignment.status === 'SUBMITTED' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-xs text-emerald-800 space-y-2">
          <p className="font-black text-sm">✓ Review Submitted</p>
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

function ReviewForm({ manuscript, assignmentId, onSubmitted }: { manuscript: ManuscriptRow; assignmentId: string; onSubmitted: () => void }) {
  const [scores, setScores] = useState<ScoreState>({
    scientificMerit: 5, noveltyInnovation: 5, methodologyQuality: 5, literatureAdequacy: 5, ethicalCompliance: 5, dataReliability: 5, writingQuality: 5
  });
  const [recommendation, setRecommendation] = useState<ReviewerRecommendation>('MINOR_REVISION');
  const [commentsToAuthor, setCommentsToAuthor] = useState('');
  const [commentsToEditor, setCommentsToEditor] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [revisions, setRevisions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(true);

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

  if (!showModal) return null;

  const scoreFields: [keyof ScoreState, string][] = [
    ['scientificMerit', 'SCIENTIFIC MERIT'],
    ['noveltyInnovation', 'NOVELTY & INNOVATION'],
    ['methodologyQuality', 'METHODOLOGY QUALITY'],
    ['literatureAdequacy', 'VALIDITY OF RESULTS'],
    ['ethicalCompliance', 'ETHICAL STANDARDS'],
  ];

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#1a4038] to-[#0f2e2a] text-white p-5 flex items-center justify-between">
          <div>
            <h2 className="font-black text-base">REVIEWER EVALUATION WORKSPACE</h2>
            <p className="text-xs text-emerald-100 mt-1">
              <span className="font-bold">Manuscript:</span> {manuscript.title.substring(0, 60)}...
            </p>
            <p className="text-xs text-emerald-100 mt-0.5">
              <span className="font-bold">Status:</span> ACCEPTED FOR REVIEW | <span className="font-bold">Referee:</span> You
            </p>
          </div>
          <button onClick={() => setShowModal(false)} className="text-white font-black text-xl hover:opacity-75">✕ Close</button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3">{error}</div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-800">
            <p className="font-bold mb-1">⚠️ Your Expert Evaluation is Desired</p>
            <p>Please provide your direct expert assessment by scoring each criterion and drafting qualitative critiques. All scores must be entered manually; no automated suggestions are applied.</p>
          </div>

          {/* Evaluation Criteria */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-sm text-slate-900">EVALUATION CRITERIA</h3>
              <span className="text-xs font-bold text-blue-600">8 Metrics Required</span>
            </div>
            <div className="space-y-4">
              {scoreFields.map(([key, label], idx) => (
                <div key={key}>
                  <label className="block text-xs font-black text-slate-900 mb-2">{idx + 1}. {label}</label>
                  <p className="text-xs text-slate-600 mb-2">
                    {key === 'scientificMerit' && 'Original contribution study rigor, hypotheses soundness, and scientific logic.'}
                    {key === 'noveltyInnovation' && 'Breakthrough contributions, conceptual uniqueness, and modern relevance.'}
                    {key === 'methodologyQuality' && 'Experimental setup, database design parameters, and verification rigor.'}
                    {key === 'literatureAdequacy' && 'Mathematical reproducibility, statistical proof margins, and validation accuracy.'}
                    {key === 'ethicalCompliance' && 'Dual-blind seal protection, potential conflicts check, and strict moral bounds.'}
                  </p>
                  <div className="flex gap-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setScore(key, i + 1)}
                        className={`w-8 h-8 rounded font-bold text-xs transition-all ${
                          scores[key] === i + 1
                            ? 'bg-[#008751] text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button className="text-xs text-slate-500 hover:text-slate-700 font-bold">N/A</button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">SCORE SELECTION: {scores[key]} / 10</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation */}
          <div>
            <h3 className="font-black text-sm text-slate-900 mb-4">REVIEWER RECOMMENDATION</h3>
            <p className="text-xs text-slate-600 mb-3">Please choose your definitive recommendation.</p>
            <div className="space-y-2">
              {[
                { value: 'ACCEPT', label: 'Accept Manuscript', desc: 'Suitable for immediate publication as is' },
                { value: 'MINOR_REVISION', label: 'Minor Revisions', desc: 'Requires petty refinements or polishing' },
                { value: 'MAJOR_REVISION', label: 'Major Revisions', desc: 'Requires substantial conceptual refinements' },
                { value: 'REJECT', label: 'Reject Manuscript', desc: 'Not suitable for presentation or publication' },
                { value: 'ADDITIONAL_REVIEW', label: 'Additional Review Required', desc: 'Requires further rounds of expert assessment' },
              ].map((option) => (
                <label key={option.value} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg hover:border-[#008751] hover:bg-slate-50 cursor-pointer transition-all">
                  <input
                    type="radio"
                    name="recommendation"
                    value={option.value}
                    checked={recommendation === option.value}
                    onChange={(e) => setRecommendation(e.target.value as ReviewerRecommendation)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-sm text-slate-900">{option.label}</p>
                    <p className="text-xs text-slate-600">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Qualitative Appraisals */}
          <div>
            <h3 className="font-black text-sm text-slate-900 mb-3">QUALITATIVE APPRAISALS</h3>
            <p className="text-xs text-slate-600 mb-3">Provide detailed, comprehensive reports inside these specific comments gates.</p>

            <label className="block mb-4">
              <p className="text-xs font-bold text-slate-900 mb-2">1. Comments to Authors <span className="text-red-600">*</span></p>
              <p className="text-[11px] text-slate-500 mb-1">Visible to authors</p>
              <textarea
                value={commentsToAuthor}
                onChange={(e) => setCommentsToAuthor(e.target.value)}
                rows={4}
                placeholder="Provide feedback visible to the authors..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans"
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label>
                <p className="text-xs font-bold text-slate-900 mb-2">Strengths of Manuscript <span className="text-red-600">*</span></p>
                <textarea
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  rows={3}
                  placeholder="List key strengths..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans"
                />
              </label>
              <label>
                <p className="text-xs font-bold text-slate-900 mb-2">Weaknesses of Manuscript <span className="text-red-600">*</span></p>
                <textarea
                  value={weaknesses}
                  onChange={(e) => setWeaknesses(e.target.value)}
                  rows={3}
                  placeholder="List key weaknesses..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans"
                />
              </label>
              <label>
                <p className="text-xs font-bold text-slate-900 mb-2">Mandatory Revisions <span className="text-red-600">*</span></p>
                <textarea
                  value={revisions}
                  onChange={(e) => setRevisions(e.target.value)}
                  rows={3}
                  placeholder="List mandatory changes..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans"
                />
              </label>
            </div>

            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-xs font-bold text-emerald-900 mb-1">📋 Confidential Editor Note</p>
              <p className="text-xs text-emerald-800">Private feedback regarding manuscript novelty or scientific validity. Locked strictly to editors.</p>
              <textarea
                value={commentsToEditor}
                onChange={(e) => setCommentsToEditor(e.target.value)}
                rows={3}
                placeholder="Private notes for editors only..."
                className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-xs font-sans mt-2 bg-white"
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 italic">All edits draft-saved inside local memory.</p>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 p-4 flex items-center justify-end gap-3 bg-slate-50">
          <button
            onClick={() => setShowModal(false)}
            className="px-4 py-2.5 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => alert('Draft saved to local memory')}
            className="px-4 py-2.5 border border-blue-300 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-50 transition-all"
          >
            Save Draft
          </button>
          <button
            disabled={busy}
            onClick={submit}
            className="px-4 py-2.5 bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} SUBMIT EVALUATION
          </button>
        </div>
      </div>
    </div>
  );
}
