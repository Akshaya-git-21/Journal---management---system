import { Loader2, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string;
  editorName?: string;
  editorEmail?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AssignmentConfirmationDialog({
  isOpen,
  title,
  message,
  details,
  editorName,
  editorEmail,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  onConfirm,
  onCancel
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-blue-600 text-white p-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <h2 className="text-lg font-bold">{title}</h2>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-slate-700">{message}</p>
          {details && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900">{details}</p>
            </div>
          )}
          {editorName && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-600 mb-1">EDITOR</p>
              <p className="text-sm font-semibold text-blue-900">{editorName}</p>
              {editorEmail && <p className="text-xs text-blue-700 mt-1">{editorEmail}</p>}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
