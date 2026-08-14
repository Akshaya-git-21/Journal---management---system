import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';

interface Props {
  manuscriptId: string;
}

interface ManuscriptFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  public_url: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

export function FilesTab({ manuscriptId }: Props) {
  const [files, setFiles] = useState<ManuscriptFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                        <a
                          href={file.public_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-slate-200 rounded transition"
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-slate-600" />
                        </a>
                        <a
                          href={file.public_url}
                          download
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
