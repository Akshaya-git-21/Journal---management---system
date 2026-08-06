import { useState, useEffect } from 'react';
import { getRevisions, getRevisionFiles, assignRevisedManuscriptToEditor, getEditorAssignments, ManuscriptFileRow, RevisionRow, EditorAssignmentRow } from '../lib/workflow';
import { listActiveProfilesByRole, ProfileRow } from '../lib/workflow';
import { Loader2, Send, Download, User } from 'lucide-react';

interface CoordinatorRevisionManagerProps {
  manuscriptId: string;
  onRevisionSent?: () => void;
}

export default function CoordinatorRevisionManager({ manuscriptId, onRevisionSent }: CoordinatorRevisionManagerProps) {
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<RevisionRow | null>(null);
  const [revisionFiles, setRevisionFiles] = useState<ManuscriptFileRow[]>([]);
  const [editors, setEditors] = useState<ProfileRow[]>([]);
  const [selectedEditor, setSelectedEditor] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currentEditorAssignment, setCurrentEditorAssignment] = useState<EditorAssignmentRow | null>(null);

  useEffect(() => {
    loadData();
  }, [manuscriptId]);

  useEffect(() => {
    if (selectedRevision) {
      loadRevisionFiles(selectedRevision.id);
    }
  }, [selectedRevision]);

  const loadData = async () => {
    try {
      const [revisionsData, editorsData, editorAssignmentsData] = await Promise.all([
        getRevisions(manuscriptId),
        listActiveProfilesByRole('EDITOR'),
        getEditorAssignments(manuscriptId)
      ]);

      setRevisions(revisionsData);
      setEditors(editorsData);

      if (revisionsData.length > 0) {
        setSelectedRevision(revisionsData[revisionsData.length - 1]);
      }

      if (editorAssignmentsData.length > 0) {
        const latest = editorAssignmentsData[editorAssignmentsData.length - 1];
        setCurrentEditorAssignment(latest);
        setSelectedEditor(latest.editor_id);
      }
    } catch (e) {
      console.error('Failed to load revision data:', e);
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

  const handleSendToEditor = async () => {
    if (!selectedRevision || !selectedEditor) return;
    setBusy(true);
    try {
      await assignRevisedManuscriptToEditor(manuscriptId, selectedEditor);
      onRevisionSent?.();
    } catch (e) {
      console.error('Failed to send revision to editor:', e);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading revision data...
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <p className="text-slate-600">No revisions submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Revisions List */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-bold text-slate-900 mb-4">REVISIONS</h3>
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
                  <p className="text-xs text-slate-600">
                    Requested: {new Date(rev.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  rev.status === 'REVISION_SUBMITTED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {rev.status.replace(/_/g, ' ')}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Revision Details */}
      {selectedRevision && selectedRevision.status === 'REVISION_SUBMITTED' && (
        <>
          {/* Submitted Files */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="font-bold text-slate-900 mb-4">SUBMITTED FILES ({revisionFiles.length})</h3>
            {revisionFiles.length === 0 ? (
              <p className="text-slate-600 text-sm">No files submitted.</p>
            ) : (
              <div className="space-y-3">
                {revisionFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded">
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

          {/* Assign to Editor */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="font-bold text-slate-900 mb-4">RE-ASSIGN TO EDITOR</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Select Editor</label>
                <select
                  value={selectedEditor}
                  onChange={(e) => setSelectedEditor(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Choose editor...</option>
                  {editors.map((editor) => (
                    <option key={editor.id} value={editor.id}>
                      {editor.name} ({editor.email})
                    </option>
                  ))}
                </select>
              </div>

              <button
                disabled={busy || !selectedEditor}
                onClick={handleSendToEditor}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" /> Send Revised Manuscript to Editor
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            ℹ️ This will create a new editor assignment for reviewing the revised manuscript. The editor will see this in their "Revisions" tab.
          </div>
        </>
      )}

      {/* No Action Needed */}
      {selectedRevision && selectedRevision.status !== 'REVISION_SUBMITTED' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center">
          <p className="text-slate-600">
            Status: <strong>{selectedRevision.status.replace(/_/g, ' ')}</strong>
          </p>
          <p className="text-sm text-slate-500 mt-2">Waiting for author to submit revised manuscript...</p>
        </div>
      )}
    </div>
  );
}
