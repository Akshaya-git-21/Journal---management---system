import { useState, useEffect } from 'react';
import { getRevisions, getRevisionFiles, updateRevisionStatus, ManuscriptFileRow, RevisionRow } from '../lib/workflow';
import { Loader2, Download, Upload, Check, X as XIcon } from 'lucide-react';

interface RevisionReviewProps {
  manuscriptId: string;
  onStatusUpdate?: () => void;
}

export default function RevisionReview({ manuscriptId, onStatusUpdate }: RevisionReviewProps) {
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<RevisionRow | null>(null);
  const [revisionFiles, setRevisionFiles] = useState<ManuscriptFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
      setRevisions(data);
      if (data.length > 0) {
        setSelectedRevision(data[data.length - 1]);
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
      console.error('Failed to load revision files:', e);
    }
  };

  const handleMarkAsUnderReview = async () => {
    if (!selectedRevision) return;
    setBusy(true);
    try {
      await updateRevisionStatus(selectedRevision.id, 'UNDER_REVIEW');
      setSelectedRevision({ ...selectedRevision, status: 'UNDER_REVIEW' });
      setRevisions(revisions.map(r => r.id === selectedRevision.id ? { ...r, status: 'UNDER_REVIEW' } : r));
      onStatusUpdate?.();
    } catch (e) {
      console.error('Failed to update revision status:', e);
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteRevision = async () => {
    if (!selectedRevision) return;
    setBusy(true);
    try {
      await updateRevisionStatus(selectedRevision.id, 'COMPLETED');
      setSelectedRevision({ ...selectedRevision, status: 'COMPLETED' });
      setRevisions(revisions.map(r => r.id === selectedRevision.id ? { ...r, status: 'COMPLETED' } : r));
      onStatusUpdate?.();
    } catch (e) {
      console.error('Failed to complete revision:', e);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading revision history...
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <p className="text-slate-600">No revisions requested yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revision Timeline */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-bold text-slate-900 mb-4">REVISION HISTORY</h3>
        <div className="space-y-2">
          {revisions.map((rev) => (
            <button
              key={rev.id}
              onClick={() => setSelectedRevision(rev)}
              className={`w-full text-left p-4 rounded-lg border-2 transition ${
                selectedRevision?.id === rev.id
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">Revision #{rev.revision_number}</p>
                  <p className="text-xs text-slate-600">Requested: {new Date(rev.requested_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    rev.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : rev.status === 'UNDER_REVIEW'
                      ? 'bg-blue-100 text-blue-700'
                      : rev.status === 'REVISION_SUBMITTED'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {rev.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Revision Details */}
      {selectedRevision && (
        <>
          {/* Decision Letter */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="font-bold text-slate-900 mb-4">DECISION LETTER</h3>
            <div className="bg-slate-50 p-4 rounded border border-slate-200 text-sm text-slate-700 leading-relaxed">
              {selectedRevision.decision_letter || 'No decision letter provided.'}
            </div>
          </div>

          {/* Submitted Files */}
          {selectedRevision.status !== 'AWAITING_AUTHOR_UPLOAD' && (
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <h3 className="font-bold text-slate-900 mb-4">REVISED MANUSCRIPT FILES</h3>
              {revisionFiles.length === 0 ? (
                <p className="text-slate-600 text-sm">No files submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {revisionFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{file.file_name}</p>
                        <p className="text-xs text-slate-600">{file.file_size} • {new Date(file.uploaded_at).toLocaleDateString()}</p>
                      </div>
                      <button className="text-emerald-600 hover:text-emerald-700 p-2">
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Revision Actions */}
          {selectedRevision.status === 'REVISION_SUBMITTED' && (
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <h3 className="font-bold text-slate-900 mb-4">REVISION ACTIONS</h3>
              <p className="text-sm text-slate-600 mb-4">
                The author has submitted their revised manuscript. Review the changes and decide whether to:
              </p>
              <div className="space-y-2">
                <button
                  disabled={busy}
                  onClick={handleMarkAsUnderReview}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Upload className="w-4 h-4" /> Send to Reviewers for Re-evaluation
                </button>
                <button
                  disabled={busy}
                  onClick={handleCompleteRevision}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" /> Mark Revisions as Complete & Proceed
                </button>
              </div>
            </div>
          )}

          {/* Revision Summary */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="font-bold text-slate-900 mb-4">REVISION SUMMARY</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-600">Revision #</p>
                <p className="font-semibold text-slate-900">{selectedRevision.revision_number}</p>
              </div>
              <div>
                <p className="text-slate-600">Status</p>
                <p className="font-semibold text-slate-900">{selectedRevision.status.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-slate-600">Requested</p>
                <p className="font-semibold text-slate-900">{new Date(selectedRevision.requested_at).toLocaleDateString()}</p>
              </div>
              {selectedRevision.submitted_at && (
                <div>
                  <p className="text-slate-600">Submitted</p>
                  <p className="font-semibold text-slate-900">{new Date(selectedRevision.submitted_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
