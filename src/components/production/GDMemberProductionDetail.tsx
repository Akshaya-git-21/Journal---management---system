import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, Circle, Check, Minus, Download, Eye, AlertTriangle, CheckSquare, Upload, Send } from 'lucide-react';
import { ManuscriptRow, ProfileRow, getManuscript, getProfilesByIds } from '../../lib/workflow';
import {
  ProductionRow, ProductionChecklistItemRow, ChecklistItemStatus, ProofRow, CorrectionRow,
  getProduction, getChecklist, getProofs, getCorrections,
  setChecklistItemStatus, gdMemberCompleteChecklist,
  uploadProof, gdMemberUploadProof, gdMemberSetProofNotes, gdMemberSubmitProof
} from '../../lib/production';
import { getManuscriptStatusLabel, STANDARD_STATUS_COLORS } from '../../lib/manuscriptStatusLabel';

const CHECKLIST_STATUS_CYCLE: Record<ChecklistItemStatus, ChecklistItemStatus> = {
  PENDING: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: 'PENDING',
};

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
    case 'CORRECTIONS_IN_PROGRESS': return 5;
    case 'AUTHOR_APPROVED': return 6;
    case 'READY_FOR_PUBLICATION': case 'PUBLISHED': return 7;
    default: return 0;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Checkbox-style tick mark (not a circular icon) -- matches the ☐/☑
 * checklist wireframe from Task 6. COMPLETED = filled square with a tick,
 * IN_PROGRESS = amber square with a dash, PENDING = empty square. */
function ChecklistIcon({ status }: { status: ProductionChecklistItemRow['status'] }) {
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

/** Mostly-read-only mirror of ProductionWorkspace.tsx for the GD Member role
 * -- most action buttons (start production, advance stage, upload proof,
 * accept corrections, publish, ...) are still Coordinator-only server-side
 * (see lib/production.ts). The one exception is the Production Checklist
 * (Task 6): the assigned GD Member can check/uncheck items and mark the
 * checklist complete via gd_member_set_checklist_item() /
 * gd_member_complete_checklist() in 0055_gd_member_production_checklist.sql
 * -- both re-verify the caller is this manuscript's assigned GD Member
 * server-side, so this UI enabling them is convenience, not the real gate. */
export default function GDMemberProductionDetail({ manuscriptId, onBack }: { manuscriptId: string; onBack: () => void }) {
  const [manuscript, setManuscript] = useState<ManuscriptRow | null>(null);
  const [production, setProduction] = useState<ProductionRow | null>(null);
  const [checklist, setChecklist] = useState<ProductionChecklistItemRow[]>([]);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [editorProfile, setEditorProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingItemKey, setTogglingItemKey] = useState<string | null>(null);
  const [completingChecklist, setCompletingChecklist] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [submittingProof, setSubmittingProof] = useState(false);

  const load = async () => {
    try {
      const [m, prod, cl, pf, corr] = await Promise.all([
        getManuscript(manuscriptId),
        getProduction(manuscriptId),
        getChecklist(manuscriptId),
        getProofs(manuscriptId),
        getCorrections(manuscriptId),
      ]);
      setManuscript(m);
      setProduction(prod);
      setChecklist(cl);
      setProofs(pf);
      setCorrections(corr);
      if (!notesDirty) setNotesDraft(pf[0]?.gd_notes || '');
      if (m?.assigned_editor_id) {
        const map = await getProfilesByIds([m.assigned_editor_id]);
        setEditorProfile(map[m.assigned_editor_id] || null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [manuscriptId]);

  const handleUploadProof = async (file: File) => {
    setUploadingProof(true);
    setProofError('');
    try {
      const { storagePath, publicUrl } = await uploadProof(manuscriptId, file);
      await gdMemberUploadProof(manuscriptId, storagePath, publicUrl, file.name);
      setNotesDirty(false);
      await load();
    } catch (e: any) {
      setProofError(e.message || 'Failed to upload the proof PDF.');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    setProofError('');
    try {
      await gdMemberSetProofNotes(manuscriptId, notesDraft);
      setNotesDirty(false);
      await load();
    } catch (e: any) {
      setProofError(e.message || 'Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSubmitProof = async () => {
    setSubmittingProof(true);
    setProofError('');
    try {
      await gdMemberSubmitProof(manuscriptId);
      await load();
    } catch (e: any) {
      setProofError(e.message || 'Failed to submit the proof to the Coordinator.');
    } finally {
      setSubmittingProof(false);
    }
  };

  const handleToggleItem = async (item: ProductionChecklistItemRow) => {
    setTogglingItemKey(item.item_key);
    setCompleteError('');
    try {
      await setChecklistItemStatus(manuscriptId, item.item_key, CHECKLIST_STATUS_CYCLE[item.status]);
      await load();
    } catch (e: any) {
      setCompleteError(e.message || 'Failed to update checklist item.');
    } finally {
      setTogglingItemKey(null);
    }
  };

  const handleCompleteChecklist = async () => {
    setCompletingChecklist(true);
    setCompleteError('');
    try {
      await gdMemberCompleteChecklist(manuscriptId);
      await load();
    } catch (e: any) {
      setCompleteError(e.message || 'Failed to mark the checklist complete.');
    } finally {
      setCompletingChecklist(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading production details...</div>;
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>;
  if (!manuscript) return <div className="text-center py-24 text-slate-400">Manuscript not found.</div>;

  const status = production?.production_status;
  const idx = stepIndex(status);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border border-slate-200 rounded-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Production</p>
            <h1 className="mt-2 text-2xl font-black text-slate-900">{manuscript.title}</h1>
          </div>
          {(() => {
            const statusLabel = getManuscriptStatusLabel(manuscript, undefined, status ?? null);
            const statusStyle = STANDARD_STATUS_COLORS[statusLabel as keyof typeof STANDARD_STATUS_COLORS] || STANDARD_STATUS_COLORS.DRAFT;
            return (
              <span className={`shrink-0 px-3 py-1 rounded-full font-bold text-sm uppercase tracking-wide border ${statusStyle}`}>
                {statusLabel}
              </span>
            );
          })()}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Manuscript ID</p><p className="font-mono text-slate-700">{manuscript.id}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Author</p><p className="text-slate-700">{manuscript.author_name}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Editor</p><p className="text-slate-700">{editorProfile?.name || '--'}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Accepted Date</p><p className="text-slate-700">{formatDate(production?.accepted_at || manuscript.updated_at)}</p></div>
        </div>
      </div>

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

      {!production || production.production_status === 'NOT_STARTED' ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center text-sm text-slate-500">
          Production has not started for this manuscript yet.
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Production Checklist</h2>
              {checklist.filter((c) => c.stage === 'COPYEDITING').length > 0 && (
                <span className="text-xs font-bold text-slate-400">
                  {checklist.filter((c) => c.stage === 'COPYEDITING' && c.status === 'COMPLETED').length} / {checklist.filter((c) => c.stage === 'COPYEDITING').length} checked
                </span>
              )}
            </div>
            {checklist.filter((c) => c.stage === 'COPYEDITING').length === 0 ? (
              <p className="text-sm text-slate-400">No checklist items yet.</p>
            ) : (
              <>
                {(() => {
                  const copyeditingItems = checklist.filter((c) => c.stage === 'COPYEDITING');
                  // Editable only while the manuscript is still in the
                  // copyediting stage (matches gd_member_complete_checklist()'s
                  // own gate) -- once advanced, the checklist is a read-only
                  // record, same client-side pattern as the Coordinator's own
                  // ProductionWorkspace.tsx (idx > 1 disables its checklist too).
                  const canEdit = production?.production_status === 'IN_PRODUCTION' || production?.production_status === 'COPYEDITING';
                  const allChecked = copyeditingItems.every((c) => c.status === 'COMPLETED');
                  return (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {copyeditingItems.map((item) => {
                          const busy = togglingItemKey === item.item_key;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={!canEdit || busy}
                              onClick={() => handleToggleItem(item)}
                              title="Click to cycle: Pending -> In Progress -> Completed"
                              className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-left hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <span className="text-slate-700">{item.item_label}</span>
                              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChecklistIcon status={item.status} />}
                                {item.status.replace('_', ' ')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {canEdit && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <button
                            type="button"
                            disabled={!allChecked || completingChecklist}
                            onClick={handleCompleteChecklist}
                            className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {completingChecklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                            {completingChecklist ? 'Marking Complete...' : 'Mark Checklist Complete'}
                          </button>
                          {!allChecked && (
                            <p className="mt-2 text-xs text-slate-400">All checklist items must be checked before this manuscript can be marked complete.</p>
                          )}
                          {completeError && <p className="mt-2 text-xs font-semibold text-red-600">{completeError}</p>}
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {/* Proof Preparation (Task 9) -- upload/replace the proof PDF,
              add notes, complete the Proof Checklist, then submit. Only
              shown once the manuscript has reached TYPESETTING; locked once
              submitted (status moves past PROOF_GENERATED). */}
          {(status === 'TYPESETTING' || status === 'PROOF_GENERATED' || status === 'PROOF_SUBMITTED_TO_COORDINATOR') && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Proof Preparation</h2>
                {status === 'PROOF_SUBMITTED_TO_COORDINATOR' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Submitted to Coordinator
                  </span>
                )}
              </div>

              {(() => {
                const draftEditable = status === 'TYPESETTING' || status === 'PROOF_GENERATED';
                const currentProof = proofs[0] || null;
                const proofChecklist = checklist.filter((c) => c.stage === 'PROOF');
                const allProofChecked = proofChecklist.length > 0 && proofChecklist.every((c) => c.status === 'COMPLETED');
                const canSubmit = draftEditable && status === 'PROOF_GENERATED' && !!currentProof && allProofChecked;

                return (
                  <>
                    {/* Upload / Replace proof PDF */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Proof PDF</p>
                      {currentProof ? (
                        <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                          <div>
                            <p className="font-bold text-slate-800">Proof v{currentProof.version}</p>
                            <p className="text-xs text-slate-400">{currentProof.file_name} • Uploaded {formatDate(currentProof.uploaded_at)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {currentProof.public_url && (
                              <a href={currentProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
                            )}
                            {draftEditable && (
                              <label className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white cursor-pointer ${uploadingProof ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800'}`}>
                                {uploadingProof ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                {uploadingProof ? 'Uploading...' : 'Replace'}
                                <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploadingProof} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProof(f); e.target.value = ''; }} />
                              </label>
                            )}
                          </div>
                        </div>
                      ) : draftEditable ? (
                        <label className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white cursor-pointer ${uploadingProof ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#008751] hover:bg-[#007043]'}`}>
                          {uploadingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          {uploadingProof ? 'Uploading...' : 'Upload Proof PDF'}
                          <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploadingProof} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProof(f); e.target.value = ''; }} />
                        </label>
                      ) : (
                        <p className="text-sm text-slate-400">No proof was uploaded.</p>
                      )}
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Notes</p>
                      <textarea
                        value={notesDraft}
                        onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
                        disabled={!draftEditable || !currentProof}
                        placeholder="Notes for the Coordinator about this proof..."
                        rows={3}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#008751] disabled:bg-slate-50 disabled:text-slate-500"
                      />
                      {draftEditable && currentProof && (
                        <button
                          type="button"
                          disabled={savingNotes || !notesDirty}
                          onClick={handleSaveNotes}
                          className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          {savingNotes ? 'Saving...' : 'Save Draft'}
                        </button>
                      )}
                    </div>

                    {/* Proof Checklist */}
                    {proofChecklist.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Proof Checklist</p>
                          <span className="text-xs font-bold text-slate-400">
                            {proofChecklist.filter((c) => c.status === 'COMPLETED').length} / {proofChecklist.length} checked
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {proofChecklist.map((item) => {
                            const busy = togglingItemKey === item.item_key;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                disabled={!draftEditable || busy}
                                onClick={() => handleToggleItem(item)}
                                title="Click to cycle: Pending -> In Progress -> Completed"
                                className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-left hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                <span className="text-slate-700">{item.item_label}</span>
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChecklistIcon status={item.status} />}
                                  {item.status.replace('_', ' ')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Submit */}
                    {draftEditable && (
                      <div className="pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={!canSubmit || submittingProof}
                          onClick={handleSubmitProof}
                          className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {submittingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {submittingProof ? 'Submitting...' : 'Submit Proof to Coordinator'}
                        </button>
                        {!currentProof && <p className="mt-2 text-xs text-slate-400">Upload a proof PDF before submitting.</p>}
                        {currentProof && !allProofChecked && <p className="mt-2 text-xs text-slate-400">All proof checklist items must be checked before submitting.</p>}
                        {proofError && <p className="mt-2 text-xs font-semibold text-red-600">{proofError}</p>}
                      </div>
                    )}
                    {status === 'PROOF_SUBMITTED_TO_COORDINATOR' && (
                      <p className="text-sm text-slate-500">This proof has been submitted and is now with the Coordinator.</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-3xl p-6">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-4">Proof Versions</h2>
            {proofs.length === 0 ? (
              <p className="text-sm text-slate-400">No proofs generated yet.</p>
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
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Notes: </span>{p.gd_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task 14: when the Coordinator has sent this manuscript back for
             corrections, lead with the consolidated Author + Editor + current
             proof package -- the GD Member shouldn't have to piece it together
             from the raw per-correction list below. */}
          {status === 'CORRECTIONS_IN_PROGRESS' && corrections[0] && (
            <div className="bg-white border-2 border-slate-900 rounded-3xl p-6 space-y-3">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Corrections Package</h2>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Author Comments</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{corrections[0].comments}</p>
                {corrections[0].attachment_public_url && (
                  <a href={corrections[0].attachment_public_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#008751] hover:underline">
                    <Download className="w-3.5 h-3.5" /> {corrections[0].attachment_file_name || 'Annotated PDF'}
                  </a>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Editor Comments</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{corrections[0].editor_comments || 'No editorial comments.'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Current Proof</p>
                {proofs[0]?.public_url ? (
                  <a href={proofs[0].public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#008751] hover:underline">
                    <Eye className="w-3.5 h-3.5" /> Proof v{proofs[0].version} — {proofs[0].file_name}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No proof available.</p>
                )}
              </div>
            </div>
          )}

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
                    {c.editor_feedback_at && (
                      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-bold">Editor Feedback</p>
                        <p className="text-slate-600 whitespace-pre-wrap">{c.editor_comments || 'No editorial comments.'}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
