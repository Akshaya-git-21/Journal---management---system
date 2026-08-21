import { useState, useEffect, ChangeEvent, DragEvent } from 'react';
import { getRevisions, getRevisionFiles, uploadRevisionFile, deleteManuscriptFile, submitRevision, ManuscriptFileRow, RevisionRow } from '../lib/workflow';
import { Loader2, Upload, CheckCircle, X, FileText } from 'lucide-react';

interface AuthorRevisionRequestProps {
  manuscriptId: string;
  onRevisionSubmitted?: () => void;
}

const RESPONSE_NOTE_MAX = 2000;
const MANUSCRIPT_FILE_TYPE = 'Revised Manuscript';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Uploaded just now';
  if (mins < 60) return `Uploaded ${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Uploaded ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return `Uploaded ${new Date(iso).toLocaleDateString()}`;
}

function Dropzone({
  label,
  required,
  file,
  uploading,
  onSelect,
  onRemove,
}: {
  label: string;
  required: boolean;
  file: ManuscriptFileRow | null;
  uploading: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = `revision-upload-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onSelect(dropped);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-bold text-slate-900">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {required && !file && <span className="text-xs font-bold text-amber-600">Required</span>}
      </div>

      {file ? (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-3 min-w-0">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{file.file_name}</p>
              <p className="text-xs text-slate-500">{file.file_size} &middot; {timeAgo(file.uploaded_at)}</p>
            </div>
          </div>
          <button
            onClick={onRemove}
            className="text-xs font-bold text-red-600 hover:text-red-700 flex-shrink-0 ml-3"
          >
            Remove
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
          }`}
        >
          <input
            id={inputId}
            type="file"
            accept=".pdf,.docx,.doc"
            disabled={uploading}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const selected = e.target.files?.[0];
              if (selected) onSelect(selected);
              e.target.value = '';
            }}
            className="hidden"
          />
          {uploading ? (
            <Loader2 className="w-6 h-6 text-blue-500 mx-auto mb-2 animate-spin" />
          ) : (
            <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          )}
          <p className="text-sm font-semibold text-slate-900">
            {uploading ? 'Uploading...' : 'Drag & drop your file here'}
          </p>
          {!uploading && <p className="text-xs text-slate-500 mt-0.5">or <span className="text-blue-600 font-semibold">Browse files</span></p>}
          <p className="text-[11px] text-slate-400 mt-2">PDF, DOCX &middot; Maximum 20 MB</p>
        </label>
      )}
    </div>
  );
}

export default function AuthorRevisionRequest({ manuscriptId, onRevisionSubmitted }: AuthorRevisionRequestProps) {
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<RevisionRow | null>(null);
  const [revisionFiles, setRevisionFiles] = useState<ManuscriptFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [responseNote, setResponseNote] = useState('');
  const [error, setError] = useState('');
  const [showDecisionLetter, setShowDecisionLetter] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [manualChecklist, setManualChecklist] = useState({ addressedComments: false, confirmedDetails: false });

  useEffect(() => {
    loadRevisions();
  }, [manuscriptId]);

  useEffect(() => {
    if (selectedRevision) {
      loadRevisionFiles(selectedRevision.id);
    }
  }, [selectedRevision]);

  const loadRevisions = async () => {
    try {
      const data = await getRevisions(manuscriptId);
      const pendingRevisions = data.filter(r => r.status === 'AWAITING_AUTHOR_UPLOAD' || r.status === 'REVISION_SUBMITTED');
      setRevisions(data);
      if (pendingRevisions.length > 0) {
        setSelectedRevision(pendingRevisions[pendingRevisions.length - 1]);
      }
    } catch (e) {
      console.error('Failed to load revisions:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadRevisionFiles = async (revisionId: string) => {
    try {
      const files = await getRevisionFiles(revisionId);
      setRevisionFiles(files);
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  };

  const handleFileSelect = async (fileType: string, file: File) => {
    if (!selectedRevision) return;
    setUploadingType(fileType);
    setError('');
    try {
      await uploadRevisionFile(selectedRevision.id, manuscriptId, file, fileType);
      await loadRevisionFiles(selectedRevision.id);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.message || 'Failed to upload file. Please try again.');
    } finally {
      setUploadingType(null);
    }
  };

  const handleRemoveFile = async (file: ManuscriptFileRow) => {
    setError('');
    try {
      await deleteManuscriptFile(file.id);
      setRevisionFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err: any) {
      setError(err.message || 'Failed to remove file.');
    }
  };

  const manuscriptFile = revisionFiles.find(f => f.file_type === MANUSCRIPT_FILE_TYPE) || null;
  const canSubmit = !!manuscriptFile;

  const handleSaveDraft = () => {
    // Files are already persisted to the database the moment they upload --
    // there's no separate draft state to write. This just reassures the
    // author that what they've uploaded so far is safe.
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2500);
  };

  const handleSubmitRevision = async () => {
    if (!selectedRevision || !canSubmit || submitting) return;
    if (selectedRevision.status !== 'AWAITING_AUTHOR_UPLOAD') return;
    if (!window.confirm(`Send Revision ${selectedRevision.revision_number} to the editor? You won't be able to make further changes once it's sent.`)) return;

    setSubmitting(true);
    setError('');
    try {
      await submitRevision(manuscriptId, responseNote.trim());
      setSelectedRevision({ ...selectedRevision, status: 'REVISION_SUBMITTED' });
      setRevisions(revisions.map(r => r.id === selectedRevision.id ? { ...r, status: 'REVISION_SUBMITTED' } : r));
      setResponseNote('');
      onRevisionSubmitted?.();
    } catch (err: any) {
      console.error('Failed to submit revision:', err);
      setError(err.message || 'Failed to submit revision. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading revision requests...
      </div>
    );
  }

  const pendingRevisions = revisions.filter(r => r.status === 'AWAITING_AUTHOR_UPLOAD' || r.status === 'REVISION_SUBMITTED');

  if (pendingRevisions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        <p className="text-slate-900 font-semibold">No Revisions Requested</p>
        <p className="text-slate-600 text-sm mt-1">Your manuscript is not in revision status.</p>
      </div>
    );
  }

  if (!selectedRevision) return null;

  const isMinor = selectedRevision.decision_type === 'MINOR_REVISION';
  const decisionLabel = isMinor ? 'Minor Revision' : selectedRevision.decision_type === 'MAJOR_REVISION' ? 'Major Revision' : 'Revision';
  const isSubmitted = selectedRevision.status === 'REVISION_SUBMITTED';

  return (
    <div className="space-y-6">
      {pendingRevisions.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {pendingRevisions.map(rev => (
            <button
              key={rev.id}
              onClick={() => setSelectedRevision(rev)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
                selectedRevision.id === rev.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Revision #{rev.revision_number}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-black text-slate-900 mb-3">Revision Required</h2>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className={`text-sm font-bold ${isMinor ? 'text-amber-700' : 'text-red-700'}`}>{decisionLabel}</span>
          <span className="text-sm font-semibold text-slate-500">Revision #{selectedRevision.revision_number}</span>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 mt-1">
          <span className="text-xs text-slate-500">Requested {new Date(selectedRevision.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span className={`text-xs font-bold flex items-center gap-1.5 ${isSubmitted ? 'text-emerald-600' : 'text-amber-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isSubmitted ? 'bg-emerald-600' : 'bg-amber-600'}`} />
            {isSubmitted ? 'Submitted' : 'Awaiting Submission'}
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-3">
          Your manuscript requires {isMinor ? 'minor' : 'major'} revisions. Please address the editor's comments and upload the revised files below.
        </p>
      </div>

      {/* Editor's Decision */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Editor's Decision</h3>
        <p className={`text-base font-bold mb-2 ${isMinor ? 'text-amber-700' : 'text-red-700'}`}>{decisionLabel}</p>
        <p className="text-sm text-slate-700 italic leading-relaxed">
          "{selectedRevision.decision_letter ? (showDecisionLetter || selectedRevision.decision_letter.length <= 160 ? selectedRevision.decision_letter : selectedRevision.decision_letter.slice(0, 160) + '…') : 'No letter provided.'}"
        </p>
        {selectedRevision.decision_letter && selectedRevision.decision_letter.length > 160 && (
          <button
            onClick={() => setShowDecisionLetter(v => !v)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 mt-2"
          >
            {showDecisionLetter ? 'Show less' : 'View decision letter'}
          </button>
        )}
      </div>

      {/* Revision Checklist */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Revision Checklist</h3>
        <div className="space-y-2.5">
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={manualChecklist.addressedComments}
              onChange={(e) => setManualChecklist(prev => ({ ...prev, addressedComments: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span className={manualChecklist.addressedComments ? 'text-slate-500 line-through' : 'text-slate-700'}>Address reviewer/editor comments</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={!!manuscriptFile} readOnly className="w-4 h-4 rounded border-slate-300" />
            <span className={manuscriptFile ? 'text-slate-500 line-through' : 'text-slate-700'}>Upload revised manuscript</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={manualChecklist.confirmedDetails}
              onChange={(e) => setManualChecklist(prev => ({ ...prev, confirmedDetails: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span className={manualChecklist.confirmedDetails ? 'text-slate-500 line-through' : 'text-slate-700'}>Confirm all author details are correct</span>
          </label>
        </div>
      </div>

      {!isSubmitted ? (
        <>
          {/* Upload Files */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide">Upload Revised Files</h3>

            <Dropzone
              label="Revised Manuscript"
              required
              file={manuscriptFile}
              uploading={uploadingType === MANUSCRIPT_FILE_TYPE}
              onSelect={(file) => handleFileSelect(MANUSCRIPT_FILE_TYPE, file)}
              onRemove={() => manuscriptFile && handleRemoveFile(manuscriptFile)}
            />

            {revisionFiles.some(f => f.file_type !== MANUSCRIPT_FILE_TYPE) && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Other Files</p>
                {revisionFiles.filter(f => f.file_type !== MANUSCRIPT_FILE_TYPE).map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <p className="text-sm text-slate-700 truncate">{f.file_name}</p>
                    </div>
                    <button onClick={() => handleRemoveFile(f)} className="text-slate-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Response note */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-900 mb-2">Response to Editor (optional)</label>
              <textarea
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value.slice(0, RESPONSE_NOTE_MAX))}
                placeholder="Summarize how you addressed the requested revisions..."
                rows={4}
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
            )}
            {draftSaved && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">Your uploaded files are saved.</div>
            )}

            <div className="flex gap-3">
              <button
                disabled={submitting}
                onClick={handleSaveDraft}
                className="flex-1 border border-slate-300 text-slate-700 text-sm font-bold py-3 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                disabled={!canSubmit || submitting}
                onClick={handleSubmitRevision}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send to Editor
              </button>
            </div>
            {!canSubmit && (
              <p className="text-xs text-slate-500 text-center">Upload the revised manuscript to submit.</p>
            )}
          </div>
        </>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
          <p className="font-semibold text-emerald-900">Revision Submitted</p>
          <p className="text-sm text-emerald-700 mt-2">
            Your revised manuscript has been submitted for coordinator review. Once the coordinator forwards it, the editor will review it and provide feedback.
          </p>
        </div>
      )}
    </div>
  );
}
