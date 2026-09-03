import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, Circle, Check, Minus, Upload, Download, Eye, MessageCircle, Send, AlertTriangle, UserCog } from 'lucide-react';
import {
  ManuscriptRow, ProfileRow, ContributorRow,
  getManuscript, getContributors, getProfilesByIds, getDiscussions, DiscussionRow,
  listActiveProfilesByRole
} from '../../lib/workflow';
import {
  ProductionRow, ProductionChecklistItemRow, ProofRow, CorrectionRow, ChecklistItemStatus,
  getProduction, getChecklist, getProofs, getCorrections,
  startProduction, updateChecklistItem, advanceProductionStage,
  uploadProof, generateProof, sendProofToAuthor,
  acceptCorrections, requestClarification, assignGDMember,
  coordinatorReturnProofToGDMember, sendCorrectionsToEditor, sendForCorrections,
  coordinatorReturnForFurtherCorrections, coordinatorConfirmProofreadingCompleted
} from '../../lib/production';
import { getManuscriptStatusLabel } from '../../lib/manuscriptStatusLabel';

const STEPS = ['Accepted', 'Copyediting', 'Formatting', 'Typesetting', 'Proof Generated', 'Author Proofreading', 'Final Approval', 'Publication'];

function stepIndex(status: string | undefined) {
  switch (status) {
    case undefined: case 'NOT_STARTED': case 'IN_PRODUCTION': return 0;
    case 'COPYEDITING': return 1;
    case 'FORMATTING': return 2;
    case 'TYPESETTING': return 3;
    case 'PROOF_GENERATED': case 'PROOF_SUBMITTED_TO_COORDINATOR': return 4;
    case 'PROOF_SENT_TO_AUTHOR': case 'AUTHOR_PROOF_REVIEW': case 'CORRECTIONS_SUBMITTED':
    case 'CLARIFICATION_REQUESTED': case 'PRODUCTION_REVIEW': case 'PROOF_UPDATED':
    case 'CORRECTIONS_IN_PROGRESS': case 'FINAL_PROOF_READY': return 5;
    case 'AUTHOR_APPROVED': return 6;
    case 'READY_FOR_PUBLICATION': case 'PUBLISHED': return 7;
    default: return 0;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const CHECKLIST_STATUS_CYCLE: Record<ChecklistItemStatus, ChecklistItemStatus> = {
  PENDING: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: 'PENDING',
};

/** Checkbox-style tick mark (not a circular icon) -- matches the ☐/☑
 * checklist wireframe from Task 6. COMPLETED = filled square with a tick,
 * IN_PROGRESS = amber square with a dash, PENDING = empty square. */
function ChecklistIcon({ status }: { status: ChecklistItemStatus }) {
  if (status === 'COMPLETED') {
    return (
      <span className="flex items-center justify-center w-4 h-4 rounded-[4px] bg-emerald-600 shrink-0">
        <Check className="w-3 h-3 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'IN_PROGRESS') {
    return (
      <span className="flex items-center justify-center w-4 h-4 rounded-[4px] border-2 border-amber-500 bg-amber-50 shrink-0">
        <Minus className="w-3 h-3 text-amber-600" strokeWidth={3} />
      </span>
    );
  }
  return <span className="w-4 h-4 rounded-[4px] border-2 border-slate-300 shrink-0" />;
}

export default function ProductionWorkspace({ manuscriptId, onBack, onChanged }: { manuscriptId: string; onBack: () => void; onChanged: () => void }) {
  const [manuscript, setManuscript] = useState<ManuscriptRow | null>(null);
  const [contributors, setContributors] = useState<ContributorRow[]>([]);
  const [production, setProduction] = useState<ProductionRow | null>(null);
  const [checklist, setChecklist] = useState<ProductionChecklistItemRow[]>([]);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionRow[]>([]);
  const [editorProfile, setEditorProfile] = useState<ProfileRow | null>(null);
  const [gdMembers, setGdMembers] = useState<ProfileRow[]>([]);
  const [assignedGDMember, setAssignedGDMember] = useState<ProfileRow | null>(null);
  const [selectedGDMemberId, setSelectedGDMemberId] = useState('');
  const [assigningGDMember, setAssigningGDMember] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clarificationDraft, setClarificationDraft] = useState<Record<string, string>>({});
  const [returnNote, setReturnNote] = useState('');
  const [showReturnForm, setShowReturnForm] = useState(false);

  const load = async () => {
    try {
      const [m, contrib, prod, cl, pf, corr, disc, gdMemberProfiles] = await Promise.all([
        getManuscript(manuscriptId),
        getContributors(manuscriptId),
        getProduction(manuscriptId),
        getChecklist(manuscriptId),
        getProofs(manuscriptId),
        getCorrections(manuscriptId),
        getDiscussions(manuscriptId),
        listActiveProfilesByRole('GD_MEMBER'),
      ]);
      setManuscript(m);
      setContributors(contrib);
      setProduction(prod);
      setChecklist(cl);
      setProofs(pf);
      setCorrections(corr);
      setDiscussions(disc.filter((d) => d.channel === 'PRODUCTION'));
      setGdMembers(gdMemberProfiles);
      const profileIds = [m?.assigned_editor_id, prod?.assigned_to].filter((v): v is string => !!v);
      if (profileIds.length > 0) {
        const map = await getProfilesByIds(profileIds);
        setEditorProfile(m?.assigned_editor_id ? map[m.assigned_editor_id] || null : null);
        setAssignedGDMember(prod?.assigned_to ? map[prod.assigned_to] || null : null);
      } else {
        setEditorProfile(null);
        setAssignedGDMember(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [manuscriptId]);

  const handleAssignGDMember = async () => {
    if (!selectedGDMemberId) return;
    setAssigningGDMember(true);
    setAssignError('');
    try {
      await assignGDMember(manuscriptId, selectedGDMemberId);
      setSelectedGDMemberId('');
      await load();
      onChanged();
    } catch (e: any) {
      setAssignError(e.message || 'Failed to assign GD Member.');
    } finally {
      setAssigningGDMember(false);
    }
  };

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading production workspace...</div>;
  if (!manuscript) return <div className="text-center py-24 text-slate-400">Manuscript not found.</div>;

  const correspondingAuthor = contributors.find((c) => c.contributor_role?.toLowerCase().includes('corresponding')) || contributors[0];
  const status = production?.production_status;
  const idx = stepIndex(status);
  const copyeditingChecklist = checklist.filter((c) => c.stage === 'COPYEDITING');
  const allChecklistDone = copyeditingChecklist.length > 0 && copyeditingChecklist.every((c) => c.status === 'COMPLETED');
  const latestProof = proofs[0];
  const openCorrections = corrections.filter((c) => c.status === 'SUBMITTED');

  const handleProofFile = async (file: File) => {
    await run(async () => {
      const { storagePath, publicUrl } = await uploadProof(manuscriptId, file);
      await generateProof(manuscriptId, storagePath, publicUrl, file.name);
    });
  };

  const handleReturnToGDMember = async () => {
    await run(() => coordinatorReturnProofToGDMember(manuscriptId, returnNote));
    setReturnNote('');
    setShowReturnForm(false);
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border border-slate-200 rounded-3xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Production</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">{manuscript.title}</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Manuscript ID</p><p className="font-mono text-slate-700">{manuscript.id}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Author</p><p className="text-slate-700">{manuscript.author_name}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Corresponding Author</p><p className="text-slate-700">{correspondingAuthor?.name || manuscript.author_name}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Editor</p><p className="text-slate-700">{editorProfile?.name || '--'}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Accepted Date</p><p className="text-slate-700">{formatDate(production?.accepted_at || manuscript.updated_at)}</p></div>
        </div>
      </div>

      {/* Task 4: Coordinator-only GD Member assignment -- the sole gate for
          GD Member visibility (see assign_gd_member() / RLS in
          0051_assign_gd_member.sql: a GD Member sees only manuscripts where
          manuscript_production.assigned_to = their own id). */}
      {production && production.production_status !== 'NOT_STARTED' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserCog className="w-4 h-4 text-[#008751]" />
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Production Member</h2>
          </div>
          {assignedGDMember ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Assigned GD Member</p>
                <p className="text-lg font-black text-slate-900">{assignedGDMember.name}</p>
                <p className="text-xs text-slate-500">Status: {getManuscriptStatusLabel(manuscript, undefined, production.production_status)}</p>
                {/* Read-only -- set by the Publisher (set_publisher_task_status(),
                    0057_publisher_task_status.sql), not editable here. Distinct
                    from the GD Member's item-by-item checklist above. */}
                <p className="text-xs text-slate-500 mt-1">
                  Publisher Task Status: <span className={`font-bold ${
                    production.publisher_task_status === 'COMPLETE' ? 'text-emerald-600' :
                    production.publisher_task_status === 'IN_PROGRESS' ? 'text-amber-600' : 'text-slate-400'
                  }`}>
                    {production.publisher_task_status === 'COMPLETE' ? 'Complete' : production.publisher_task_status === 'IN_PROGRESS' ? 'In Progress' : 'Not Started'}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedGDMemberId}
                  onChange={(e) => setSelectedGDMemberId(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#008751]"
                >
                  <option value="">Reassign to...</option>
                  {gdMembers.filter((g) => g.id !== assignedGDMember.id).map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button
                  disabled={!selectedGDMemberId || assigningGDMember}
                  onClick={handleAssignGDMember}
                  className="rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {assigningGDMember ? 'Reassigning...' : 'Reassign'}
                </button>
              </div>
            </div>
          ) : gdMembers.length === 0 ? (
            <p className="text-sm text-slate-400">No active GD Member accounts yet -- create one from the GD Members roster to assign this manuscript.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={selectedGDMemberId}
                onChange={(e) => setSelectedGDMemberId(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#008751]"
              >
                <option value="">Select GD Member</option>
                {gdMembers.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                disabled={!selectedGDMemberId || assigningGDMember}
                onClick={handleAssignGDMember}
                className="rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {assigningGDMember ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          )}
          {assignError && <p className="mt-2 text-xs font-semibold text-red-600">{assignError}</p>}
        </div>
      )}

      {/* Stepper */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                i < idx ? 'bg-emerald-100 text-emerald-700' : i === idx ? 'bg-[#008751] text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {i < idx ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                {step}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-6 ${i < idx ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}

      {!production || production.production_status === 'NOT_STARTED' ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center">
          <p className="text-sm text-slate-500 mb-4">Production has not started for this manuscript yet.</p>
          <button disabled={busy} onClick={() => run(() => startProduction(manuscriptId))} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-50">
            Start Production
          </button>
        </div>
      ) : (
        <>
          {/* Copyediting checklist */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Production Checklist — Copyediting</h2>
              {status === 'COPYEDITING' && (
                <button disabled={!allChecklistDone || busy} onClick={() => run(() => advanceProductionStage(manuscriptId, 'FORMATTING'))} className="rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed">
                  Move to Formatting
                </button>
              )}
              {status === 'FORMATTING' && (
                <button disabled={busy} onClick={() => run(() => advanceProductionStage(manuscriptId, 'TYPESETTING'))} className="rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40">
                  Move to Typesetting
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checklist.filter((item) => item.stage === 'COPYEDITING').map((item) => (
                <button
                  key={item.id}
                  disabled={busy || idx > 1}
                  onClick={() => run(() => updateChecklistItem(manuscriptId, item.item_key, CHECKLIST_STATUS_CYCLE[item.status]))}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="text-slate-700">{item.item_label}</span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><ChecklistIcon status={item.status} /> {item.status.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Proof Submitted -- Coordinator's review gate (Task 10). Shown
              only while a GD-Member-submitted proof is awaiting decision;
              consolidates View/Download PDF, checklist + GD notes summary,
              and the two outcomes (Return to GD Member / Send Proof to
              Author) in one place instead of scattering them across the
              generic sections below (which still show the same data for
              reference/history). */}
          {status === 'PROOF_SUBMITTED_TO_COORDINATOR' && latestProof && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Proof Submitted</p>
                  <p className="mt-1 text-sm text-amber-800">
                    {assignedGDMember?.name || 'The assigned GD Member'} submitted Proof v{latestProof.version} for your review.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {latestProof.public_url && (
                    <>
                      <a href={latestProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"><Eye className="w-3.5 h-3.5" /> View PDF</a>
                      <a href={latestProof.public_url} download className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"><Download className="w-3.5 h-3.5" /> Download PDF</a>
                    </>
                  )}
                </div>
              </div>

              {latestProof.gd_notes && (
                <div className="rounded-2xl bg-white border border-amber-100 p-4 text-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-1">GD Notes</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{latestProof.gd_notes}</p>
                </div>
              )}

              {checklist.some((c) => c.stage === 'PROOF') && (
                <p className="text-xs text-amber-800">
                  Proof Checklist: {checklist.filter((c) => c.stage === 'PROOF' && c.status === 'COMPLETED').length} / {checklist.filter((c) => c.stage === 'PROOF').length} checked (see full checklist below)
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-100">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => sendProofToAuthor(manuscriptId))}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" /> Send Proof to Author
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowReturnForm((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                >
                  Return to GD Member
                </button>
              </div>

              {showReturnForm && (
                <div className="flex flex-col gap-2 pt-2">
                  <textarea
                    value={returnNote}
                    onChange={(e) => setReturnNote(e.target.value)}
                    placeholder="Note for the GD Member on what needs fixing (optional)..."
                    rows={2}
                    className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleReturnToGDMember}
                      className="rounded-full bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-40"
                    >
                      {busy ? 'Returning...' : 'Confirm Return'}
                    </button>
                    <button type="button" onClick={() => setShowReturnForm(false)} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proof Checklist -- read-only here: this is the GD Member's own
              checklist (Task 9, gd_member_set_checklist_item()), the
              Coordinator can see progress but doesn't drive it. */}
          {checklist.some((item) => item.stage === 'PROOF') && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Proof Checklist (GD Member)</h2>
                <span className="text-xs font-bold text-slate-400">
                  {checklist.filter((c) => c.stage === 'PROOF' && c.status === 'COMPLETED').length} / {checklist.filter((c) => c.stage === 'PROOF').length} checked
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {checklist.filter((item) => item.stage === 'PROOF').map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                    <span className="text-slate-700">{item.item_label}</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><ChecklistIcon status={item.status} /> {item.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correction Checklist -- read-only here, same as the Proof
              Checklist above but for Task 15's corrections stage. */}
          {checklist.some((item) => item.stage === 'CORRECTION') && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Correction Checklist (GD Member)</h2>
                <span className="text-xs font-bold text-slate-400">
                  {checklist.filter((c) => c.stage === 'CORRECTION' && c.status === 'COMPLETED').length} / {checklist.filter((c) => c.stage === 'CORRECTION').length} checked
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {checklist.filter((item) => item.stage === 'CORRECTION').map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                    <span className="text-slate-700">{item.item_label}</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><ChecklistIcon status={item.status} /> {item.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task 16: Coordinator reviews the GD Member's corrected proof --
             either send it on to reach the same round of proof review, or
             kick it straight back to the GD Member without troubling the
             author. */}
          {status === 'FINAL_PROOF_READY' && (
            <div className="rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-6 space-y-3">
              <p className="text-sm text-emerald-800 font-semibold">The GD Member has submitted the corrected proof. Final proof is ready for review.</p>
              {latestProof?.public_url && (
                <div className="flex items-center gap-2">
                  <a href={latestProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><Eye className="w-3.5 h-3.5" /> View Proof v{latestProof.version}</a>
                  <a href={latestProof.public_url} download className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><Download className="w-3.5 h-3.5" /> Download</a>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  disabled={busy}
                  onClick={() => run(() => sendProofToAuthor(manuscriptId))}
                  className="inline-flex items-center gap-1 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" /> Send Final Proof to Author
                </button>
                <button
                  disabled={busy}
                  onClick={() => run(() => coordinatorReturnForFurtherCorrections(manuscriptId))}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-40"
                >
                  Return for Further Corrections
                </button>
              </div>
            </div>
          )}

          {/* Proofs */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Proof Versions</h2>
              <div className="flex items-center gap-2">
                {(status === 'TYPESETTING' || status === 'CORRECTIONS_SUBMITTED' || status === 'PRODUCTION_REVIEW') && (
                  <label className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Generate / Upload Proof
                    <input type="file" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleProofFile(f); e.target.value = ''; }} />
                  </label>
                )}
                {(status === 'PROOF_GENERATED' || status === 'PROOF_SUBMITTED_TO_COORDINATOR' || status === 'PROOF_UPDATED') && (
                  <button disabled={busy} onClick={() => run(() => sendProofToAuthor(manuscriptId))} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40">
                    <Send className="w-3.5 h-3.5" /> Send Proof to Author
                  </button>
                )}
              </div>
            </div>
            {proofs.length === 0 ? (
              <p className="text-sm text-slate-400">No proofs generated yet. Accepted Manuscript → Production Version → Proof v1.</p>
            ) : (
              <div className="space-y-2">
                {proofs.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800">Proof v{p.version}</p>
                        <p className="text-xs text-slate-400">{p.file_name} • Uploaded {formatDate(p.uploaded_at)}{p.sent_to_author_at ? ` • Sent ${formatDate(p.sent_to_author_at)}` : ''}{p.approved_at ? ` • Approved ${formatDate(p.approved_at)}` : ''}</p>
                      </div>
                      {p.public_url && (
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={p.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
                          <a href={p.public_url} download className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Download</a>
                        </div>
                      )}
                    </div>
                    {p.gd_notes && (
                      <p className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 whitespace-pre-wrap">
                        <span className="font-bold text-slate-400 uppercase tracking-wide">GD Member notes: </span>{p.gd_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Corrections */}
          {corrections.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-4">Author Proof Corrections</h2>
              <div className="space-y-4">
                {corrections.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-slate-200 p-4 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-800">Proof v{c.proof_version} — submitted {formatDate(c.submitted_at)}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${c.status === 'REVIEWED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.status}</span>
                    </div>
                    <p className="text-slate-600 whitespace-pre-wrap">{c.comments}</p>
                    {c.attachment_public_url && (
                      <a href={c.attachment_public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#008751] hover:underline">
                        <Download className="w-3.5 h-3.5" /> {c.attachment_file_name || 'Proof Corrections attachment'}
                      </a>
                    )}
                    {c.status === 'SUBMITTED' && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <button disabled={busy} onClick={() => run(() => acceptCorrections(manuscriptId, c.id))} className="rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40">
                            Accept Minor Corrections
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={clarificationDraft[c.id] || ''}
                            onChange={(e) => setClarificationDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            placeholder="Ask the author to clarify a correction..."
                            className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-xs outline-none focus:border-[#008751]"
                          />
                          <button
                            disabled={busy || !clarificationDraft[c.id]?.trim()}
                            onClick={() => run(async () => { await requestClarification(manuscriptId, clarificationDraft[c.id]); setClarificationDraft((prev) => ({ ...prev, [c.id]: '' })); })}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> Request Clarification
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Task 12: forward this correction round (comments + annotated PDF)
                       plus the current proof PDF to the assigned Editor for verification. */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        disabled={busy}
                        onClick={() => run(() => sendCorrectionsToEditor(manuscriptId, c.id))}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Send className="w-3.5 h-3.5" /> Send to Editor for Verification
                      </button>
                      {production?.sent_to_editor_at && production.sent_to_editor_correction_id === c.id && (
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Sent to Editor {formatDate(production.sent_to_editor_at)}
                        </span>
                      )}
                    </div>
                    {/* Task 13: the assigned Editor's feedback on this correction round. */}
                    {c.editor_feedback_at && (
                      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-bold">Editor Feedback</p>
                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${c.editor_verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {c.editor_verified ? 'Verified' : 'Not Verified'}
                          </span>
                        </div>
                        <p className="text-slate-600 whitespace-pre-wrap">{c.editor_comments || 'No editorial comments.'}</p>
                        <p className="text-[11px] text-slate-400">Submitted {formatDate(c.editor_feedback_at)}</p>
                      </div>
                    )}
                    {/* Task 14: once the Editor has weighed in, consolidate Author +
                       Editor comments and the current proof into one package and hand
                       it back to the GD Member -- they shouldn't have to hunt across
                       the Coordinator's own separate cards to find all of it. */}
                    {c.editor_feedback_at && (
                      <div className="rounded-2xl border-2 border-slate-900 p-4 space-y-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-bold">Corrections Package for GD Member</p>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Author Comments</p>
                          <p className="text-slate-700">{c.comments}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Editor Comments</p>
                          <p className="text-slate-700">{c.editor_comments || 'No editorial comments.'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Current Proof</p>
                          {latestProof?.public_url ? (
                            <a href={latestProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#008751] hover:underline">
                              <Eye className="w-3.5 h-3.5" /> Proof v{latestProof.version} — {latestProof.file_name}
                            </a>
                          ) : (
                            <p className="text-slate-400">No proof available.</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            disabled={busy}
                            onClick={() => run(() => sendForCorrections(manuscriptId, c.id))}
                            className="inline-flex items-center gap-1 rounded-full bg-[#008751] px-4 py-2 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40"
                          >
                            <Send className="w-3.5 h-3.5" /> Send for Corrections
                          </button>
                          {status === 'CORRECTIONS_IN_PROGRESS' && (
                            <span className="text-[10px] font-bold uppercase text-slate-400">Sent to GD Member</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {discussions.length > 0 && (
                <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 font-bold">Clarification history</p>
                  {discussions.map((d) => (
                    <p key={d.id} className="text-xs text-slate-600"><span className="font-semibold">{formatDate(d.created_at)}:</span> {d.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Task 18: the handoff from proofreading to publishing -- the
             Coordinator no longer publishes directly (that's now the
             assigned GD Member's job, Tasks 19-21); this just confirms
             proofreading is done and hands the manuscript to them. */}
          {status === 'AUTHOR_APPROVED' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Proofreading Complete</h2>
              <p className="text-sm text-slate-500">The author has accepted the final proof (Proof v{production.current_proof_version}).</p>
              <button
                disabled={busy}
                onClick={() => run(() => coordinatorConfirmProofreadingCompleted(manuscriptId))}
                className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40"
              >
                <Check className="w-4 h-4" /> Confirm Proofreading Completed
              </button>
            </div>
          )}

          {status === 'READY_FOR_PUBLICATION' && (
            <div className="rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-6 text-sm text-emerald-800 font-semibold">
              Ready for Publication. The assigned GD Member will enter publication metadata and publish this manuscript.
            </div>
          )}

          {status === 'PUBLISHED' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center text-emerald-700 font-bold">
              This manuscript has been published.
            </div>
          )}
        </>
      )}
    </div>
  );
}
