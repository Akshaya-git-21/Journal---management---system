import { useState, useEffect, ChangeEvent } from 'react';
import { getRevisions, getRevisionFiles, uploadRevisionFile, submitRevision, ManuscriptFileRow, RevisionRow } from '../lib/workflow';
import { Loader2, Upload, Download, CheckCircle } from 'lucide-react';

interface AuthorRevisionRequestProps {
  manuscriptId: string;
  onRevisionSubmitted?: () => void;
}

const RESPONSE_NOTE_MAX = 2000;

export default function AuthorRevisionRequest({ manuscriptId, onRevisionSubmitted }: AuthorRevisionRequestProps) {
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<RevisionRow | null>(null);
  const [revisionFiles, setRevisionFiles] = useState<ManuscriptFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responseNote, setResponseNote] = useState('');
  const [error, setError] = useState('');

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

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedRevision) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadRevisionFile(selectedRevision.id, file, 'Manuscript');
      }
      await loadRevisionFiles(selectedRevision.id);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitRevision = async () => {
    // Guard against duplicate submission: only the RPC's own state check
    // (manuscript.status === 'REVISION_REQUESTED') is authoritative, but
    // gating on the still-AWAITING_AUTHOR_UPLOAD local status prevents a
    // double-click from firing the RPC twice for the same revision.
    if (!selectedRevision || revisionFiles.length === 0 || submitting) return;
    if (selectedRevision.status !== 'AWAITING_AUTHOR_UPLOAD') return;

    setSubmitting(true);
    setError('');
    try {
      // The real workflow transition: REVISION_REQUESTED -> EDITOR_REVIEW,
      // flips this revision row to REVISION_SUBMITTED, and resets the
      // editor's assessment_status so they re-evaluate the new files.
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

  return (
    <div className="space-y-6">
      {/* Revision Timeline */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-bold text-slate-900 mb-4">REVISION REQUESTS</h3>
        <div className="space-y-2">
          {revisions.filter(r => r.status === 'AWAITING_AUTHOR_UPLOAD' || r.status === 'REVISION_SUBMITTED').map((rev) => (
            <button
              key={rev.id}
              onClick={() => setSelectedRevision(rev)}
              className={`w-full text-left p-4 rounded-lg border-2 transition ${
                selectedRevision?.id === rev.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">
                    {rev.decision_type === 'MAJOR_REVISION' ? 'Major Revision Requested' : rev.decision_type === 'MINOR_REVISION' ? 'Minor Revision Requested' : `Revision #${rev.revision_number}`}
                  </p>
                  <p className="text-xs text-slate-600">
                    Revision #{rev.revision_number} &middot; Requested: {new Date(rev.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  rev.status === 'REVISION_SUBMITTED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  {rev.status === 'AWAITING_AUTHOR_UPLOAD' ? 'Awaiting Upload' : 'Submitted'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedRevision && (
        <>
          {/* Decision Letter */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="font-bold text-slate-900 mb-4">DECISION LETTER</h3>
            <div className="bg-slate-50 p-4 rounded border border-slate-200 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {selectedRevision.decision_letter || 'No letter provided.'}
            </div>
          </div>

          {/* File Upload */}
          {selectedRevision.status === 'AWAITING_AUTHOR_UPLOAD' && (
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <h3 className="font-bold text-slate-900 mb-4">UPLOAD REVISED MANUSCRIPT</h3>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition cursor-pointer">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                    id="revision-file-input"
                  />
                  <label htmlFor="revision-file-input" className="cursor-pointer block">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="font-semibold text-slate-900">Click to upload files</p>
                    <p className="text-xs text-slate-600 mt-1">or drag and drop</p>
                  </label>
                </div>

                {uploading && (
                  <div className="flex items-center justify-center py-4 text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Uploading...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Uploaded Files */}
          {revisionFiles.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <h3 className="font-bold text-slate-900 mb-4">UPLOADED FILES ({revisionFiles.length})</h3>
              <div className="space-y-3">
                {revisionFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{file.file_name}</p>
                      <p className="text-xs text-slate-600">{file.file_size} • {new Date(file.uploaded_at).toLocaleDateString()}</p>
                    </div>
                    {selectedRevision.status === 'REVISION_SUBMITTED' && (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response note + Submit */}
          {selectedRevision.status === 'AWAITING_AUTHOR_UPLOAD' && revisionFiles.length > 0 && (
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

              <button
                disabled={submitting}
                onClick={handleSubmitRevision}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <Upload className="w-4 h-4" /> Submit Revised Manuscript
              </button>
              <p className="text-xs text-slate-600 text-center">
                Your manuscript will be sent to the editor for review.
              </p>
            </div>
          )}

          {/* Submitted Status */}
          {selectedRevision.status === 'REVISION_SUBMITTED' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
              <p className="font-semibold text-emerald-900">Revision Submitted</p>
              <p className="text-sm text-emerald-700 mt-2">
                Your revised manuscript has been submitted. The editor will review it and provide feedback.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
