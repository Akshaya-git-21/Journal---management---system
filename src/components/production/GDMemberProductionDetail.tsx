import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, Circle, Check, Download, Eye, AlertTriangle, CheckSquare, Upload, ClipboardCheck, FileText, ArrowRight } from 'lucide-react';
import { ManuscriptRow, ProfileRow, ManuscriptFileRow, getManuscript, getProfilesByIds, getManuscriptFiles, getRevisionFiles, getRevisions } from '../../lib/workflow';
import {
  ProductionRow, ProductionChecklistItemRow, ChecklistItemStatus, ProofRow, CorrectionRow, JournalTemplateRow,
  getProduction, getChecklist, getProofs, getCorrections, getJournalTemplates,
  setChecklistItemStatus, gdMemberCompleteChecklist, advanceProductionStage,
  uploadProof, gdMemberUploadProofV2, gdMemberSetProofNotes,
  gdMemberAcceptAssignment, gdMemberSelectTemplate, gdMemberSetWorkStatus
} from '../../lib/production';
import { getManuscriptStatusLabel, STANDARD_STATUS_COLORS } from '../../lib/manuscriptStatusLabel';

const JOURNAL_NAME = 'Journal of Molecular Sciences';

// Plain checked/unchecked toggle -- no IN_PROGRESS middle state. A stray
// IN_PROGRESS row from before this change just toggles straight to COMPLETED.
const CHECKLIST_STATUS_CYCLE: Record<ChecklistItemStatus, ChecklistItemStatus> = {
  PENDING: 'COMPLETED', IN_PROGRESS: 'COMPLETED', COMPLETED: 'PENDING',
};

const STEPS = ['Accepted', 'Copyediting', 'Production Checklist', 'Formatting', 'Typesetting', 'Proof Generated', 'Author Proofreading', 'Final Approval', 'Publication'];

// Module 71/72: production_status alone can't distinguish "GD Member still
// doing offline formatting work" from "work status marked Completed, now
// working through the Production Checklist" -- both are production_status
// = 'COPYEDITING'. gd_work_status is what actually separates those two
// stepper tabs.
function stepIndex(status: string | undefined, gdWorkStatus?: string) {
  switch (status) {
    case undefined: case 'NOT_STARTED': case 'IN_PRODUCTION': return 0;
    case 'COPYEDITING': return gdWorkStatus === 'COMPLETED' ? 2 : 1;
    case 'FORMATTING': return 3;
    case 'TYPESETTING': return 4;
    case 'PROOF_GENERATED': case 'PROOF_SUBMITTED_TO_COORDINATOR': return 5;
    case 'PROOF_SENT_TO_AUTHOR': case 'AUTHOR_PROOF_REVIEW': case 'CORRECTIONS_SUBMITTED':
    case 'CLARIFICATION_REQUESTED': case 'PRODUCTION_REVIEW': case 'PROOF_UPDATED':
    case 'CORRECTIONS_IN_PROGRESS': case 'FINAL_PROOF_READY':
    case 'PROOF_SENT_TO_EDITOR': case 'EDITOR_CORRECTIONS_REQUESTED': case 'EDITOR_CORRECTIONS_PENDING_SEND': case 'PROOF_READY_FOR_EDITOR': return 6;
    case 'AUTHOR_APPROVED': case 'EDITOR_APPROVED': case 'PROOF_SENT_TO_AUTHOR_FINAL': case 'AUTHOR_FINAL_CORRECTIONS_REQUESTED': return 7;
    case 'READY_FOR_PUBLICATION': case 'PUBLISHED': return 8;
    default: return 0;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Plain checkbox-style tick mark (not a circular icon) -- matches the ☐/☑
 * checklist wireframe from Task 6. COMPLETED = filled square with a tick,
 * anything else (PENDING, or a stray IN_PROGRESS from before this became a
 * two-state toggle) = empty square. */
function ChecklistIcon({ status }: { status: ProductionChecklistItemRow['status'] }) {
  if (status === 'COMPLETED') {
    return (
      <span className="flex items-center justify-center w-4 h-4 rounded-[4px] bg-emerald-600 shrink-0">
        <Check className="w-3 h-3 text-white" strokeWidth={3} />
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
export default function GDMemberProductionDetail({ manuscriptId, onBack, onOpenPublication }: { manuscriptId: string; onBack: () => void; onOpenPublication?: () => void }) {
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
  const [uploadingCorrectedProof, setUploadingCorrectedProof] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const [togglingCorrectionKey, setTogglingCorrectionKey] = useState<string | null>(null);
  // Module 71: accept assignment -> choose template -> self-reported work
  // status. The first two are hard gates (see the early returns below);
  // work status is available once past them.
  const [templates, setTemplates] = useState<JournalTemplateRow[]>([]);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [selectedTemplateForGate, setSelectedTemplateForGate] = useState('');
  const [selectingTemplate, setSelectingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [savingWorkStatus, setSavingWorkStatus] = useState(false);
  const [workStatusError, setWorkStatusError] = useState('');
  const [acceptedFiles, setAcceptedFiles] = useState<ManuscriptFileRow[]>([]);
  const [advancingStage, setAdvancingStage] = useState(false);
  const [advanceStageError, setAdvanceStageError] = useState('');
  const [movedToPublish, setMovedToPublish] = useState(false);

  const load = async () => {
    try {
      const [m, prod, cl, pf, corr, tpl, revisions] = await Promise.all([
        getManuscript(manuscriptId),
        getProduction(manuscriptId),
        getChecklist(manuscriptId),
        getProofs(manuscriptId),
        getCorrections(manuscriptId),
        getJournalTemplates(),
        getRevisions(manuscriptId),
      ]);
      setManuscript(m);
      setProduction(prod);
      setChecklist(cl);
      setProofs(pf);
      setCorrections(corr);
      setTemplates(tpl);
      if (!notesDirty) setNotesDraft(pf[0]?.gd_notes || '');
      if (m?.assigned_editor_id) {
        const map = await getProfilesByIds([m.assigned_editor_id]);
        setEditorProfile(map[m.assigned_editor_id] || null);
      }
      // The document that led to ACCEPTED -- the latest revision's files if
      // this manuscript went through any revision cycles, otherwise the
      // original submission files (revision_id null).
      const latestRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;
      const files = latestRevision ? await getRevisionFiles(latestRevision.id) : await getManuscriptFiles(manuscriptId);
      setAcceptedFiles(files.filter((f) => f.file_type?.toLowerCase().includes('manuscript')));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [manuscriptId]);

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError('');
    try {
      await gdMemberAcceptAssignment(manuscriptId);
      await load();
    } catch (e: any) {
      setAcceptError(e.message || 'Failed to accept the assignment.');
    } finally {
      setAccepting(false);
    }
  };

  const handleSelectTemplate = async () => {
    if (!selectedTemplateForGate) return;
    setSelectingTemplate(true);
    setTemplateError('');
    try {
      await gdMemberSelectTemplate(manuscriptId, selectedTemplateForGate);
      await load();
    } catch (e: any) {
      setTemplateError(e.message || 'Failed to select the template.');
    } finally {
      setSelectingTemplate(false);
    }
  };

  const handleSetWorkStatus = async (status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED') => {
    setSavingWorkStatus(true);
    setWorkStatusError('');
    try {
      await gdMemberSetWorkStatus(manuscriptId, status);
      await load();
    } catch (e: any) {
      setWorkStatusError(e.message || 'Failed to update work status.');
    } finally {
      setSavingWorkStatus(false);
    }
  };

  const handleAdvanceToTypesetting = async () => {
    setAdvancingStage(true);
    setAdvanceStageError('');
    try {
      await advanceProductionStage(manuscriptId, 'TYPESETTING');
      await load();
    } catch (e: any) {
      setAdvanceStageError(e.message || 'Failed to move to Typesetting.');
    } finally {
      setAdvancingStage(false);
    }
  };

  // Module 69: a single upload call now does both "upload" and "submit" --
  // the RPC itself decides whether this routes to the Author (very first
  // version) or the Editor (any correction round, regardless of who
  // requested it), so there's no separate submit step or draft/submitted
  // RPC pair to pick between anymore.
  const handleUploadProof = async (file: File) => {
    setUploadingProof(true);
    setProofError('');
    try {
      const { storagePath, publicUrl } = await uploadProof(manuscriptId, file);
      await gdMemberUploadProofV2(manuscriptId, storagePath, publicUrl, file.name, notesDraft);
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

  const handleUploadCorrectedProof = async (file: File) => {
    setUploadingCorrectedProof(true);
    setCorrectionError('');
    try {
      const { storagePath, publicUrl } = await uploadProof(manuscriptId, file);
      await gdMemberUploadProofV2(manuscriptId, storagePath, publicUrl, file.name, notesDraft);
      setNotesDirty(false);
      await load();
    } catch (e: any) {
      setCorrectionError(e.message || 'Failed to upload the corrected proof PDF.');
    } finally {
      setUploadingCorrectedProof(false);
    }
  };

  const handleToggleCorrectionItem = async (item: ProductionChecklistItemRow) => {
    setTogglingCorrectionKey(item.item_key);
    setCorrectionError('');
    try {
      await setChecklistItemStatus(manuscriptId, item.item_key, CHECKLIST_STATUS_CYCLE[item.status]);
      await load();
    } catch (e: any) {
      setCorrectionError(e.message || 'Failed to update checklist item.');
    } finally {
      setTogglingCorrectionKey(null);
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
  const idx = stepIndex(status, production?.gd_work_status);

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
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Author</p><p className="text-slate-700">{manuscript.author_name} &lt;{manuscript.author_email}&gt;</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Editor</p><p className="text-slate-700">{editorProfile?.name || '--'}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Journal</p><p className="text-slate-700">{JOURNAL_NAME}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Accepted Date</p><p className="text-slate-700">{formatDate(production?.accepted_at || manuscript.updated_at)}</p></div>
        </div>
      </div>

      {acceptedFiles.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">Final Accepted Manuscript</h2>
          <div className="space-y-2">
            {acceptedFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <div>
                  <p className="font-bold text-slate-800">{f.file_name}</p>
                  <p className="text-xs text-slate-400">Uploaded {formatDate(f.uploaded_at)}</p>
                </div>
                {f.public_url && (
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={f.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
                    <a href={f.public_url} download className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Download</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
      ) : !production.gd_accepted_at ? (
        /* Module 71 hard gate: nothing else in production is usable until
           the GD Member explicitly accepts the assignment. */
        <div className="bg-white border-2 border-slate-900 rounded-3xl p-6 space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Accept Production Assignment</h2>
          <p className="text-sm text-slate-600">You've been assigned to handle this manuscript's production.</p>
          <div className="grid gap-3 sm:grid-cols-2 max-w-md">
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-400">Start Date</p>
              <p className="text-sm font-bold text-slate-800">{formatDate(production.assigned_start_date)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-400">End Date</p>
              <p className="text-sm font-bold text-slate-800">{formatDate(production.assigned_end_date)}</p>
            </div>
          </div>
          {acceptError && <p className="text-xs font-semibold text-red-600">{acceptError}</p>}
          <button
            type="button"
            disabled={accepting}
            onClick={handleAccept}
            className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40"
          >
            {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {accepting ? 'Accepting...' : 'Accept Assignment'}
          </button>
        </div>
      ) : !production.selected_template_id ? (
        /* Module 71 hard gate: pick which journal template this manuscript
           is being formatted with before any other production work. */
        <div className="bg-white border-2 border-slate-900 rounded-3xl p-6 space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Choose a Template</h2>
          <p className="text-sm text-slate-600">Select the journal PDF template you'll use to format this manuscript.</p>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">No journal template has been uploaded yet. Ask the Coordinator, or upload one yourself from the PDF Template page.</p>
          ) : (
            <>
              <div className="grid gap-2 max-w-lg">
                {templates.map((t) => (
                  <div key={t.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${selectedTemplateForGate === t.id ? 'border-[#008751] bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                      <input type="radio" name="template" checked={selectedTemplateForGate === t.id} onChange={() => setSelectedTemplateForGate(t.id)} />
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{t.file_name}</p>
                        <p className="text-xs text-slate-400">Uploaded {formatDate(t.uploaded_at)}</p>
                      </div>
                    </label>
                    {t.public_url && (
                      <a
                        href={t.public_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </a>
                    )}
                  </div>
                ))}
              </div>
              {templateError && <p className="text-xs font-semibold text-red-600">{templateError}</p>}
              <button
                type="button"
                disabled={!selectedTemplateForGate || selectingTemplate}
                onClick={handleSelectTemplate}
                className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {selectingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                {selectingTemplate ? 'Selecting...' : 'Use This Template'}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Module 71/72: the Work Status screen and the Production
              Checklist screen are mutually exclusive "tabs" for the same
              underlying COPYEDITING production_status -- gd_work_status is
              what tells them apart. Work Status disappears the moment it's
              marked Completed, handing off to the Production Checklist tab
              below as its own dedicated screen (nothing else renders
              alongside it, since every later card is gated on a
              production_status past COPYEDITING anyway). */}
          {(production.production_status === 'IN_PRODUCTION' || production.production_status === 'COPYEDITING') && production.gd_work_status !== 'COMPLETED' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Work Status</h2>
              <select
                value={production.gd_work_status}
                disabled={savingWorkStatus}
                onChange={(e) => handleSetWorkStatus(e.target.value as 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED')}
                className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide outline-none disabled:opacity-60 ${
                  production.gd_work_status === 'COMPLETED' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                  production.gd_work_status === 'IN_PROGRESS' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                  'border-slate-300 bg-slate-50 text-slate-600'
                }`}
              >
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <p className="text-base text-slate-500">
              Status: <span className={`font-bold text-lg ${
                production.gd_work_status === 'COMPLETED' ? 'text-emerald-600' :
                production.gd_work_status === 'IN_PROGRESS' ? 'text-amber-600' : 'text-slate-600'
              }`}>{production.gd_work_status === 'IN_PROGRESS' ? 'In Progress' : production.gd_work_status === 'COMPLETED' ? 'Completed' : 'Not Started'}</span>
            </p>
            {workStatusError && <p className="mt-2 text-xs font-semibold text-red-600">{workStatusError}</p>}
          </div>
          )}

          {/* Module 71/72: the checklist opens once Work Status is marked
              Completed, and disappears again the moment
              gd_member_complete_checklist() advances production_status past
              COPYEDITING (-> FORMATTING) -- it's done, so it steps out of
              the way instead of lingering as a read-only card; the stepper
              above already shows Formatting as the next active tab. */}
          {production.gd_work_status === 'COMPLETED' && (production.production_status === 'IN_PRODUCTION' || production.production_status === 'COPYEDITING') && (
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
                              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChecklistIcon status={item.status} />}
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
          )}

          {/* Module 73: Formatting has no checklist of its own -- once the
              Production Checklist above is done and production_status has
              moved on to FORMATTING, the GD Member just confirms formatting
              is complete and moves on to Typesetting themselves (this used
              to be Coordinator-only; see advance_production_stage() in
              0073_gd_member_advances_formatting.sql). */}
          {status === 'FORMATTING' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-3">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Formatting</h2>
              <p className="text-sm text-slate-500">Once the manuscript's formatting (per the template you selected) is done, move it on to Typesetting to upload the proof.</p>
              {advanceStageError && <p className="text-xs font-semibold text-red-600">{advanceStageError}</p>}
              <button
                type="button"
                disabled={advancingStage}
                onClick={handleAdvanceToTypesetting}
                className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-40"
              >
                {advancingStage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {advancingStage ? 'Moving...' : 'Move to Typesetting'}
              </button>
            </div>
          )}

          {/* Proof Preparation -- Module 69: uploading Proof v1 while
              TYPESETTING IS the submit action, sending it straight to the
              Author. PROOF_GENERATED/PROOF_SUBMITTED_TO_COORDINATOR are kept
              here only so a manuscript still on the pre-Module-69 two-step
              flow renders sensibly. */}
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
                const currentProof = proofs[0] || null;
                const canUpload = status === 'TYPESETTING' && !currentProof;
                const proofChecklist = checklist.filter((c) => c.stage === 'PROOF');

                return (
                  <>
                    {/* Upload proof PDF -- Module 69: this single upload IS
                        the submit action. It routes straight to the Author
                        (Proof v1) the moment it's uploaded, so there's no
                        separate draft/replace/submit cycle any more. */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Proof PDF</p>
                      {currentProof ? (
                        <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                          <div>
                            <p className="font-bold text-slate-800">Proof v{currentProof.version}</p>
                            <p className="text-xs text-slate-400">{currentProof.file_name} • Uploaded {formatDate(currentProof.uploaded_at)}</p>
                          </div>
                          {currentProof.public_url && (
                            <a href={currentProof.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
                          )}
                        </div>
                      ) : canUpload ? (
                        <label className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white cursor-pointer ${uploadingProof ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#008751] hover:bg-[#007043]'}`}>
                          {uploadingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          {uploadingProof ? 'Uploading...' : 'Upload Proof PDF'}
                          <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploadingProof} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProof(f); e.target.value = ''; }} />
                        </label>
                      ) : (
                        <p className="text-sm text-slate-400">No proof was uploaded.</p>
                      )}
                      {proofError && <p className="mt-2 text-xs font-semibold text-red-600">{proofError}</p>}
                    </div>

                    {canUpload && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Notes (optional, sent with the proof)</p>
                        <textarea
                          value={notesDraft}
                          onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
                          placeholder="Notes about this proof..."
                          rows={3}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#008751]"
                        />
                      </div>
                    )}

                    {/* Proof Checklist -- kept as a working record for the GD
                        Member; no longer gates sending the proof, since
                        uploading is itself the send action now. */}
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
                                disabled={busy}
                                onClick={() => handleToggleItem(item)}
                                title="Click to toggle checked"
                                className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-left hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                <span className="text-slate-700">{item.item_label}</span>
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChecklistIcon status={item.status} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Module 69: whenever the GD Member owes a new version -- a
             correction requested by the Author (first round or Final
             Review) or by the Editor -- lead with the consolidated
             package so they don't have to piece it together from the raw
             per-correction list below. Always the correction round tied to
             the CURRENT proof version, never just "the newest row". */}
          {['CORRECTIONS_IN_PROGRESS', 'EDITOR_CORRECTIONS_REQUESTED', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED'].includes(status || '') && (() => {
            const activeCorrection = corrections.find((c) => c.proof_version === production?.current_proof_version && c.status === 'SUBMITTED');
            if (!activeCorrection) return null;
            return (
              <div className="bg-white border-2 border-slate-900 rounded-3xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Corrections Package</h2>
                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    Requested by {activeCorrection.correction_source === 'EDITOR' ? 'Editor' : 'Author'}
                  </span>
                </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">{activeCorrection.correction_source === 'EDITOR' ? 'Editor Comments' : 'Author Comments'}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{activeCorrection.comments}</p>
                {activeCorrection.attachment_public_url && (
                  <a href={activeCorrection.attachment_public_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#008751] hover:underline">
                    <Download className="w-3.5 h-3.5" /> {activeCorrection.attachment_file_name || 'Annotated PDF'}
                  </a>
                )}
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
            );
          })()}

          {corrections.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-4">Author Proof Corrections</h2>
              <div className="space-y-4">
                {corrections.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-slate-200 p-4 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-800">Proof v{c.proof_version} — submitted {formatDate(c.submitted_at)}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.correction_source && (
                          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-100 text-slate-500">{c.correction_source === 'EDITOR' ? 'Editor' : 'Author'}</span>
                        )}
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${c.status === 'REVIEWED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.status}</span>
                      </div>
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

          {(status === 'PROOF_SENT_TO_AUTHOR' || status === 'AUTHOR_PROOF_REVIEW') && (
            <div className="rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-6 text-sm font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Submitted -- waiting for Author proofreading.
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-3xl p-6">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-4">Proof Versions</h2>
            {proofs.length === 0 ? (
              <p className="text-sm text-slate-400">No proofs generated yet.</p>
            ) : (
              <div className="space-y-2">
                {proofs.map((p) => {
                  const isCurrent = p.version === production?.current_proof_version;
                  return (
                  <div key={p.id} className={`rounded-2xl border px-4 py-3 text-sm ${isCurrent ? 'border-[#008751] bg-emerald-50' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800">Proof v{p.version} {isCurrent && <span className="ml-1 text-[10px] font-bold uppercase text-emerald-700">Current</span>}</p>
                        <p className="text-xs text-slate-400">{p.file_name} • Uploaded {formatDate(p.uploaded_at)}{p.sent_to_author_at ? ` • Sent ${formatDate(p.sent_to_author_at)}` : ''}{p.approved_at ? ` • Approved ${formatDate(p.approved_at)}` : ''}</p>
                      </div>
                      {p.public_url && (
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={p.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="w-3.5 h-3.5" /> View</a>
                          <a href={p.public_url} download className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Download</a>
                        </div>
                      )}
                    </div>
                    {p.gd_notes && (
                      <p className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 whitespace-pre-wrap">
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Notes: </span>{p.gd_notes}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Module 69: the actual corrections work -- upload the new proof
             version. This single upload IS the submit action: it routes
             straight to the Editor the moment it's uploaded (Rule 1 -- every
             correction round, however it was requested, always goes to the
             Editor next), so there's no separate submit step. Shown whenever
             the GD Member owes a new version, whether the correction was
             requested by the Author (first round or Final Review) or the
             Editor. */}
          {['CORRECTIONS_IN_PROGRESS', 'EDITOR_CORRECTIONS_REQUESTED', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED'].includes(status || '') && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Corrected Proof</h2>

              {(() => {
                const correctionChecklist = checklist.filter((c) => c.stage === 'CORRECTION');

                return (
                  <>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Corrected Proof PDF</p>
                      <label className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white cursor-pointer ${uploadingCorrectedProof ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#008751] hover:bg-[#007043]'}`}>
                        {uploadingCorrectedProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploadingCorrectedProof ? 'Uploading & sending to Editor...' : 'Upload Corrected PDF -- sends straight to Editor'}
                        <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploadingCorrectedProof} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCorrectedProof(f); e.target.value = ''; }} />
                      </label>
                      {correctionError && <p className="mt-2 text-xs font-semibold text-red-600">{correctionError}</p>}
                    </div>

                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Correction Notes (optional, sent with the proof)</p>
                      <textarea
                        value={notesDraft}
                        onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
                        placeholder="Notes on the corrections applied..."
                        rows={3}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#008751]"
                      />
                    </div>

                    {correctionChecklist.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Correction Checklist</p>
                          <span className="text-xs font-bold text-slate-400">
                            {correctionChecklist.filter((c) => c.status === 'COMPLETED').length} / {correctionChecklist.length} checked
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {correctionChecklist.map((item) => {
                            const busy = togglingCorrectionKey === item.item_key;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                disabled={busy}
                                onClick={() => handleToggleCorrectionItem(item)}
                                title="Click to toggle checked"
                                className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-left hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                <span className="text-slate-700">{item.item_label}</span>
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChecklistIcon status={item.status} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Tasks 19-22 (Ready for Publication / Published) now live in
             their own page -- GDMemberPublicationDetail.tsx, reached via
             the sidebar's separate "Publication" section -- rather than
             here alongside the earlier production/corrections work. This
             manuscript can still be opened here from the unfiltered
             Production Queue once it's reached that stage, so point the
             GD Member at the right page instead of showing nothing. */}
          {(status === 'READY_FOR_PUBLICATION' || status === 'PUBLISHED') && (
            <div className="bg-white border-2 border-[#008751] bg-emerald-50 rounded-3xl p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-emerald-800">
                {status === 'PUBLISHED' ? 'This manuscript has been published.' : `Proof v${production?.current_proof_version} is approved and ready for publication.`}
              </p>
              {status === 'READY_FOR_PUBLICATION' && !movedToPublish ? (
                <button
                  type="button"
                  onClick={() => setMovedToPublish(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043]"
                >
                  <CheckCircle2 className="w-4 h-4" /> Move to Publish
                </button>
              ) : status === 'READY_FOR_PUBLICATION' && movedToPublish ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Moved to Publish
                  </p>
                  {onOpenPublication && (
                    <button
                      type="button"
                      onClick={onOpenPublication}
                      className="text-xs font-bold text-[#008751] hover:underline"
                    >
                      Go to Publication section &rarr;
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
