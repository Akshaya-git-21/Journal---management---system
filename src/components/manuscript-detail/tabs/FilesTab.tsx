import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { RevisionRow } from '../../../lib/workflow';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import FilePreviewModal from '../../FilePreviewModal';

interface Props {
  manuscriptId: string;
  showAllFiles?: boolean;
  revisions?: RevisionRow[];
}

interface ManuscriptFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  public_url: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  revision_id: string | null;
}

function FilesTable({ files, onPreview }: { files: ManuscriptFile[]; onPreview: (f: ManuscriptFile) => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Filename</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Size</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Uploaded</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {files.map((file) => (
              <tr key={file.id} className="hover:bg-slate-50 transition">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-900">{file.file_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{file.file_type}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{file.file_size}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {new Date(file.uploaded_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {file.public_url && (
                      <>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onPreview(file);
                          }}
                          className="p-1.5 hover:bg-slate-200 rounded transition"
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-slate-600" />
                        </button>
                        <a
                          href={file.public_url}
                          download={file.file_name}
                          className="p-1.5 hover:bg-slate-200 rounded transition"
                          title="Download"
                        >
                          <Download className="w-4 h-4 text-slate-600" />
                        </a>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FilesTab({ manuscriptId, revisions = [] }: Props) {
  const [files, setFiles] = useState<ManuscriptFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewFile, setPreviewFile] = useState<ManuscriptFile | null>(null);

  useEffect(() => {
    const loadFiles = async () => {
      try {
        setLoading(true);
        const { data, error: err } = await supabase
          .from('manuscript_files')
          .select('*')
          .eq('manuscript_id', manuscriptId)
          .order('uploaded_at', { ascending: false });

        if (err) throw err;
        setFiles(data || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load files');
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [manuscriptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mr-2" />
        <p className="text-slate-600">Loading files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <p className="text-slate-600">No files uploaded</p>
      </div>
    );
  }

  // Original submission files (revision_id null) vs. this manuscript's
  // revision cycle(s) -- shown as separate sections so it's clear which
  // files belong to the original submission versus a revision re-upload.
  const originalFiles = files.filter((f) => !f.revision_id);
  const sortedRevisions = [...revisions].sort((a, b) => a.revision_number - b.revision_number);

  return (
    <>
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-3">Original Submission Files</h3>
          {originalFiles.length > 0 ? (
            <FilesTable files={originalFiles} onPreview={setPreviewFile} />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
              No original submission files.
            </div>
          )}
        </div>

        {sortedRevisions.map((rev) => {
          const revFiles = files.filter((f) => f.revision_id === rev.id);
          return (
            <div key={rev.id}>
              <h3 className="text-sm font-bold text-slate-900 mb-3">Revision {rev.revision_number} — Uploaded Files</h3>
              {revFiles.length > 0 ? (
                <FilesTable files={revFiles} onPreview={setPreviewFile} />
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  No files uploaded for this revision yet.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {previewFile && (
        <FilePreviewModal
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          fileName={previewFile.file_name}
          fileType={previewFile.file_type}
          fileSize={previewFile.file_size}
          publicUrl={previewFile.public_url || undefined}
        />
      )}
    </>
  );
}
