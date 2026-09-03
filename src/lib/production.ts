import { supabase } from './supabase';

/**
 * Typed client wrapper around the Production module RPCs (see
 * supabase/migrations/0047_production_module.sql). This is a separate,
 * additive layer on top of an ACCEPTED manuscript -- it never writes to
 * manuscripts.status directly (production_publish() is the sole exception,
 * and it does so by calling the existing mark_published() RPC).
 */

export type ProductionStatus =
  | 'NOT_STARTED' | 'IN_PRODUCTION' | 'COPYEDITING' | 'FORMATTING' | 'TYPESETTING'
  | 'PROOF_GENERATED' | 'PROOF_SUBMITTED_TO_COORDINATOR' | 'PROOF_SENT_TO_AUTHOR' | 'AUTHOR_PROOF_REVIEW'
  | 'CORRECTIONS_SUBMITTED' | 'PRODUCTION_REVIEW' | 'PROOF_UPDATED'
  | 'CLARIFICATION_REQUESTED' | 'AUTHOR_APPROVED' | 'READY_FOR_PUBLICATION' | 'PUBLISHED'
  | 'CORRECTIONS_IN_PROGRESS' | 'FINAL_PROOF_READY';

export interface ProductionRow {
  manuscript_id: string;
  production_status: ProductionStatus;
  /** The GD Member assigned to this manuscript's production (see
   * assign_gd_member() / 0051_assign_gd_member.sql) -- null until a
   * Coordinator explicitly assigns one. Not set by start_production()
   * itself. */
  assigned_to: string | null;
  /** When assigned_to was last set (see 0054_gd_member_queue_columns.sql) --
   * distinct from updated_at, which is also bumped by unrelated later
   * production actions. Null until a GD Member has ever been assigned. */
  assigned_at: string | null;
  /** Publisher-only overall status for the manuscript's production work --
   * distinct from the GD Member's item-by-item checklist. See
   * set_publisher_task_status() in 0057_publisher_task_status.sql. */
  publisher_task_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  /** Task 12 -- set once the Coordinator sends the Author's corrections to
   * the assigned Editor for verification. Purely additive: doesn't gate any
   * production_status transition, just unlocks the Editor's read-only
   * verification view. See 0061_send_corrections_to_editor.sql. */
  sent_to_editor_at: string | null;
  sent_to_editor_correction_id: string | null;
  current_proof_version: number;
  accepted_at: string;
  created_at: string;
  updated_at: string;
}

export type ChecklistItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface ProductionChecklistItemRow {
  id: string;
  manuscript_id: string;
  item_key: string;
  item_label: string;
  status: ChecklistItemStatus;
  /** Which checklist this item belongs to -- COPYEDITING (0055, 11 fixed
   * items), PROOF (0059, seeded on first proof upload), or CORRECTION
   * (0064, seeded on first corrected-proof upload). Same table, same
   * RLS/RPCs, UI sections just filter on this. */
  stage: 'COPYEDITING' | 'PROOF' | 'CORRECTION';
  updated_by: string | null;
  updated_at: string;
}

export interface ProofRow {
  id: string;
  manuscript_id: string;
  version: number;
  file_name: string;
  storage_path: string;
  public_url: string | null;
  /** GD Member's own notes on this proof version (Task 9 "Add notes" /
   * "Save Draft"). See gd_member_set_proof_notes() in
   * 0059_gd_member_proof_preparation.sql. */
  gd_notes: string;
  uploaded_by: string | null;
  uploaded_at: string;
  sent_to_author_at: string | null;
  approved_at: string | null;
}

export type CorrectionStatus = 'SUBMITTED' | 'REVIEWED';

export interface CorrectionRow {
  id: string;
  manuscript_id: string;
  proof_version: number;
  comments: string;
  attachment_storage_path: string;
  attachment_public_url: string | null;
  attachment_file_name: string | null;
  status: CorrectionStatus;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Task 13 -- the assigned Editor's feedback on this correction round,
   * submitted after the Coordinator sends it over (see
   * 0062_editor_reviews_proof_comments.sql). Null until submitted. */
  editor_comments: string | null;
  editor_verified: boolean | null;
  editor_feedback_by: string | null;
  editor_feedback_at: string | null;
}

/** Journal-wide PDF template (Task 7) -- not per-manuscript. Coordinator
 * uploads, Coordinator and GD Member can both view/download. See
 * 0058_journal_pdf_template.sql. */
export interface JournalTemplateRow {
  id: string;
  file_name: string;
  storage_path: string;
  public_url: string | null;
  description: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

function rpcOrThrow<T>(promise: PromiseLike<{ data: T; error: any }>): Promise<T> {
  return Promise.resolve(promise).then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  });
}

// ------------------------------------------
// Mutations (RPCs)
// ------------------------------------------

export const startProduction = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('start_production', { p_manuscript_id: manuscriptId }));

/** Coordinator-only: assigns (or reassigns) the GD Member who owns this
 * manuscript's production work. See assign_gd_member() in
 * 0051_assign_gd_member.sql -- also the sole gate for GD Member visibility
 * (a GD Member sees only manuscripts where assigned_to = their own id). */
export const assignGDMember = (manuscriptId: string, gdMemberId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('assign_gd_member', { p_manuscript_id: manuscriptId, p_gd_member_id: gdMemberId }));

export const updateChecklistItem = (manuscriptId: string, itemKey: string, status: ChecklistItemStatus) =>
  rpcOrThrow<ProductionChecklistItemRow>(supabase.rpc('update_checklist_item', {
    p_manuscript_id: manuscriptId, p_item_key: itemKey, p_status: status
  }));

/** GD Member-only (must be the manuscript's assigned GD Member): drives the
 * same PENDING/IN_PROGRESS/COMPLETED cycle as the Coordinator's own
 * updateChecklistItem() above, so the Coordinator can see partial progress
 * ("started but not finished") rather than a plain checked/unchecked flag.
 * See gd_member_set_checklist_item() in 0056_gd_member_checklist_tristate.sql. */
export const setChecklistItemStatus = (manuscriptId: string, itemKey: string, status: ChecklistItemStatus) =>
  rpcOrThrow<ProductionChecklistItemRow>(supabase.rpc('gd_member_set_checklist_item', {
    p_manuscript_id: manuscriptId, p_item_key: itemKey, p_status: status
  }));

/** GD Member-only: marks the Production Checklist complete and advances the
 * manuscript out of copyediting -- refuses server-side unless every
 * checklist item is checked (see gd_member_complete_checklist() in
 * 0055_gd_member_production_checklist.sql). */
export const gdMemberCompleteChecklist = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('gd_member_complete_checklist', { p_manuscript_id: manuscriptId }));

/** Publisher-only: sets the manuscript's overall Production Task Status
 * (Not Started / In Progress / Complete) -- separate from and coarser than
 * the GD Member's item-by-item checklist. See set_publisher_task_status()
 * in 0057_publisher_task_status.sql. */
export const setPublisherTaskStatus = (manuscriptId: string, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE') =>
  rpcOrThrow<ProductionRow>(supabase.rpc('set_publisher_task_status', { p_manuscript_id: manuscriptId, p_status: status }));

/** GD Member-only (Task 9): uploads or replaces the proof PDF while drafting
 * (status TYPESETTING or already PROOF_GENERATED -- i.e. before submission
 * to the Coordinator). Pair with uploadProof() below for the storage step.
 * See gd_member_upload_proof() in 0059_gd_member_proof_preparation.sql. */
export const gdMemberUploadProof = (manuscriptId: string, storagePath: string, publicUrl: string, fileName: string) =>
  rpcOrThrow<ProofRow>(supabase.rpc('gd_member_upload_proof', {
    p_manuscript_id: manuscriptId, p_storage_path: storagePath, p_public_url: publicUrl, p_file_name: fileName
  }));

/** GD Member-only: saves draft notes on the current proof version ("Save
 * Draft"). See gd_member_set_proof_notes() in
 * 0059_gd_member_proof_preparation.sql. */
export const gdMemberSetProofNotes = (manuscriptId: string, notes: string) =>
  rpcOrThrow<ProofRow>(supabase.rpc('gd_member_set_proof_notes', { p_manuscript_id: manuscriptId, p_notes: notes }));

/** GD Member-only: "Submit Proof to Coordinator" -- refuses server-side
 * unless a proof has been uploaded and every Proof Checklist item is
 * checked. Transitions PROOF_GENERATED -> PROOF_SUBMITTED_TO_COORDINATOR,
 * which is what puts the manuscript in the Coordinator's Production
 * workspace. See gd_member_submit_proof() in
 * 0059_gd_member_proof_preparation.sql. */
export const gdMemberSubmitProof = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('gd_member_submit_proof', { p_manuscript_id: manuscriptId }));

/** GD Member-only (Task 15): uploads or replaces the corrected proof PDF
 * while working through the Coordinator's corrections package (status
 * CORRECTIONS_IN_PROGRESS only). Seeds the Correction Checklist the first
 * time. Notes are shared with gdMemberSetProofNotes() above -- both just
 * edit the current proof version's gd_notes regardless of stage. See
 * gd_member_upload_corrected_proof() in 0064_gd_member_performs_corrections.sql. */
export const gdMemberUploadCorrectedProof = (manuscriptId: string, storagePath: string, publicUrl: string, fileName: string) =>
  rpcOrThrow<ProofRow>(supabase.rpc('gd_member_upload_corrected_proof', {
    p_manuscript_id: manuscriptId, p_storage_path: storagePath, p_public_url: publicUrl, p_file_name: fileName
  }));

/** GD Member-only: "Submit Corrected Proof" -- refuses server-side unless a
 * corrected proof has been uploaded and every Correction Checklist item is
 * checked. CORRECTIONS_IN_PROGRESS -> FINAL_PROOF_READY. See
 * gd_member_submit_corrected_proof() in 0064_gd_member_performs_corrections.sql. */
export const gdMemberSubmitCorrectedProof = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('gd_member_submit_corrected_proof', { p_manuscript_id: manuscriptId }));

export const advanceProductionStage = (manuscriptId: string, toStage: 'FORMATTING' | 'TYPESETTING') =>
  rpcOrThrow<ProductionRow>(supabase.rpc('advance_production_stage', { p_manuscript_id: manuscriptId, p_to_stage: toStage }));

export const generateProof = (manuscriptId: string, storagePath: string, publicUrl: string, fileName: string) =>
  rpcOrThrow<ProofRow>(supabase.rpc('generate_proof', {
    p_manuscript_id: manuscriptId, p_storage_path: storagePath, p_public_url: publicUrl, p_file_name: fileName
  }));

export const sendProofToAuthor = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('send_proof_to_author', { p_manuscript_id: manuscriptId }));

/** Coordinator-only (Task 10): rejects a submitted proof back to the
 * assigned GD Member for another pass -- PROOF_SUBMITTED_TO_COORDINATOR ->
 * PROOF_GENERATED, which is what the GD Member's Proof Preparation panel
 * treats as editable again. See coordinator_return_proof_to_gd_member() in
 * 0060_coordinator_proof_review.sql. */
export const coordinatorReturnProofToGDMember = (manuscriptId: string, note: string = '') =>
  rpcOrThrow<ProductionRow>(supabase.rpc('coordinator_return_proof_to_gd_member', { p_manuscript_id: manuscriptId, p_note: note }));

/** Coordinator-only (Task 16): the corrected proof isn't good enough --
 * straight back to the GD Member, skipping the author. FINAL_PROOF_READY ->
 * CORRECTIONS_IN_PROGRESS (same status/UI as the very first corrections
 * round). See coordinator_return_for_further_corrections() in
 * 0065_final_proof_review_and_publishing.sql. */
export const coordinatorReturnForFurtherCorrections = (manuscriptId: string, note: string = '') =>
  rpcOrThrow<ProductionRow>(supabase.rpc('coordinator_return_for_further_corrections', { p_manuscript_id: manuscriptId, p_note: note }));

/** Coordinator-only (Task 18): the important handoff from proofreading to
 * publishing, once the Author has approved a final proof (any round).
 * AUTHOR_APPROVED -> READY_FOR_PUBLICATION. See
 * coordinator_confirm_proofreading_completed() in
 * 0065_final_proof_review_and_publishing.sql. */
export const coordinatorConfirmProofreadingCompleted = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('coordinator_confirm_proofreading_completed', { p_manuscript_id: manuscriptId }));

/** GD Member-only (Task 20): saves/edits publication metadata while
 * READY_FOR_PUBLICATION -- "Save Draft" and "Edit" are the same call.
 * Required-field validation happens server-side at publish time, not here,
 * so partial progress can be saved. See gd_member_save_publication_metadata()
 * in 0065_final_proof_review_and_publishing.sql. */
export const gdMemberSavePublicationMetadata = (manuscriptId: string, metadata: {
  volume: string; issue: string; publicationDate: string | null; pageNumbers: string; doi: string; articleUrl: string;
}) =>
  rpcOrThrow<any>(supabase.rpc('gd_member_save_publication_metadata', {
    p_manuscript_id: manuscriptId, p_volume: metadata.volume, p_issue: metadata.issue,
    p_publication_date: metadata.publicationDate, p_page_numbers: metadata.pageNumbers,
    p_doi: metadata.doi, p_article_url: metadata.articleUrl
  }));

/** GD Member-only (Task 21): "Publish Article" -- refuses server-side
 * unless a final proof exists and volume/issue/DOI/publication date are all
 * filled in, then reuses the existing mark_published() RPC.
 * READY_FOR_PUBLICATION -> PUBLISHED. See gd_member_publish_article() in
 * 0065_final_proof_review_and_publishing.sql. */
export const gdMemberPublishArticle = (manuscriptId: string) =>
  rpcOrThrow<any>(supabase.rpc('gd_member_publish_article', { p_manuscript_id: manuscriptId }));

export const authorOpenProof = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('author_open_proof', { p_manuscript_id: manuscriptId }));

export const authorApproveProof = (manuscriptId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('author_approve_proof', { p_manuscript_id: manuscriptId }));

export const authorSubmitCorrections = (manuscriptId: string, comments: string, storagePath: string, publicUrl: string, fileName: string) =>
  rpcOrThrow<CorrectionRow>(supabase.rpc('author_submit_corrections', {
    p_manuscript_id: manuscriptId, p_comments: comments, p_storage_path: storagePath, p_public_url: publicUrl, p_file_name: fileName
  }));

export const requestClarification = (manuscriptId: string, message: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('request_clarification', { p_manuscript_id: manuscriptId, p_message: message }));

export const respondClarification = (manuscriptId: string, message: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('respond_clarification', { p_manuscript_id: manuscriptId, p_message: message }));

export const acceptCorrections = (manuscriptId: string, correctionId: string) =>
  rpcOrThrow<ProductionRow>(supabase.rpc('accept_corrections', { p_manuscript_id: manuscriptId, p_correction_id: correctionId }));

/** Coordinator-only (Task 12): forwards the Author's proof corrections
 * (comments + annotated PDF, if any) plus the current proof PDF to the
 * assigned Editor for verification. Does not change production_status --
 * see 0061_send_corrections_to_editor.sql. */
export const sendCorrectionsToEditor = (manuscriptId: string, correctionId: string, note: string = '') =>
  rpcOrThrow<ProductionRow>(supabase.rpc('coordinator_send_corrections_to_editor', { p_manuscript_id: manuscriptId, p_correction_id: correctionId, p_note: note }));

/** Editor-only (Task 13): submits editorial comments + an approve/verify
 * flag on the correction round the Coordinator sent over. Notifies every
 * active Coordinator. See 0062_editor_reviews_proof_comments.sql. */
export const submitEditorProductionFeedback = (manuscriptId: string, correctionId: string, comments: string, verified: boolean) =>
  rpcOrThrow<CorrectionRow>(supabase.rpc('editor_submit_production_feedback', {
    p_manuscript_id: manuscriptId, p_correction_id: correctionId, p_comments: comments, p_verified: verified
  }));

/** Coordinator-only (Task 14): consolidates Author + Editor comments and
 * hands the manuscript back to the assigned GD Member for corrections --
 * CORRECTIONS_SUBMITTED/PRODUCTION_REVIEW -> CORRECTIONS_IN_PROGRESS. See
 * 0063_send_for_corrections.sql. */
export const sendForCorrections = (manuscriptId: string, correctionId: string, note: string = '') =>
  rpcOrThrow<ProductionRow>(supabase.rpc('coordinator_send_for_corrections', { p_manuscript_id: manuscriptId, p_correction_id: correctionId, p_note: note }));

export const productionPublish = (manuscriptId: string, doi: string, volume: string, issue: string) =>
  rpcOrThrow(supabase.rpc('production_publish', { p_manuscript_id: manuscriptId, p_doi: doi, p_volume: volume, p_issue: issue }));

// ------------------------------------------
// File uploads -- same manuscript-files bucket, new path prefix
// ------------------------------------------

export async function uploadProof(manuscriptId: string, file: File): Promise<{ storagePath: string; publicUrl: string }> {
  const path = `${manuscriptId}/production/proofs/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage.from('manuscript-files').upload(path, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data } = supabase.storage.from('manuscript-files').getPublicUrl(path);
  return { storagePath: path, publicUrl: data.publicUrl };
}

export async function uploadCorrectionAttachment(manuscriptId: string, file: File): Promise<{ storagePath: string; publicUrl: string }> {
  const path = `${manuscriptId}/production/corrections/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage.from('manuscript-files').upload(path, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data } = supabase.storage.from('manuscript-files').getPublicUrl(path);
  return { storagePath: path, publicUrl: data.publicUrl };
}

/** Coordinator-only: uploads a new journal PDF template. Stored under a
 * journal-wide `templates/` prefix (not per-manuscript) in the same public
 * manuscript-files bucket everything else already uses -- storage RLS
 * restricts writes under that prefix to Coordinators (0058_journal_pdf_template.sql),
 * downloads are covered by the bucket's existing public-read policy. The
 * newly uploaded row becomes the "current" template (most recent by
 * uploaded_at); older ones are kept for history, not deleted automatically. */
export async function uploadJournalTemplate(file: File, description: string = ''): Promise<JournalTemplateRow> {
  const path = `templates/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage.from('manuscript-files').upload(path, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data: urlData } = supabase.storage.from('manuscript-files').getPublicUrl(path);

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('journal_templates').insert({
    file_name: file.name,
    storage_path: path,
    public_url: urlData.publicUrl,
    description,
    uploaded_by: userData.user?.id ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as JournalTemplateRow;
}

/** Coordinator/GD Member (RLS): every template, newest first -- callers
 * that only want the current one should take templates[0]. */
export async function getJournalTemplates(): Promise<JournalTemplateRow[]> {
  const { data, error } = await supabase.from('journal_templates').select('*').order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Coordinator-only: removes a template (row + storage object). */
export async function deleteJournalTemplate(id: string, storagePath: string): Promise<void> {
  const { error: dbError } = await supabase.from('journal_templates').delete().eq('id', id);
  if (dbError) throw new Error(dbError.message);
  await supabase.storage.from('manuscript-files').remove([storagePath]);
}

// ------------------------------------------
// Reads (RLS-scoped)
// ------------------------------------------

export async function getProduction(manuscriptId: string): Promise<ProductionRow | null> {
  const { data, error } = await supabase.from('manuscript_production').select('*').eq('manuscript_id', manuscriptId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Coordinator/GD Member (RLS): every manuscript_production row, for the list screens. */
export async function listProduction(): Promise<ProductionRow[]> {
  const { data, error } = await supabase.from('manuscript_production').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getChecklist(manuscriptId: string): Promise<ProductionChecklistItemRow[]> {
  const { data, error } = await supabase.from('manuscript_production_checklist').select('*').eq('manuscript_id', manuscriptId).order('item_key', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProofs(manuscriptId: string): Promise<ProofRow[]> {
  const { data, error } = await supabase.from('manuscript_proofs').select('*').eq('manuscript_id', manuscriptId).order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCorrections(manuscriptId: string): Promise<CorrectionRow[]> {
  const { data, error } = await supabase.from('manuscript_production_corrections').select('*').eq('manuscript_id', manuscriptId).order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

let productionChannelSeq = 0;

// Unique channel name per call -- same fix as subscribeToManuscripts() in
// workflow.ts. A fixed name broke the moment more than one caller held a
// subscription open at once (ProductionSection plus, once the manuscript
// detail page started watching production status too, ManuscriptDetailHeader/
// OverviewTab/DecisionTab all mounting simultaneously): supabase-js throws
// "cannot add postgres_changes callbacks ... after subscribe()" on the second
// .channel() call reusing an already-subscribed topic.
export function subscribeToProduction(onChange: () => void): () => void {
  const channel = supabase
    .channel(`manuscripts-production-changes-${++productionChannelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_production' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_production_checklist' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_proofs' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_production_corrections' }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
