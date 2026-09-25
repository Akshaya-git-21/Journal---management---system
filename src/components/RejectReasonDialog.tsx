import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface RejectReasonDialogProps {
  isOpen: boolean;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Confirmation step for an Editor rejecting a submission. A reason is
 * required; it is sent with the REJECT recommendation, which (like every
 * other Editor decision) goes to the Coordinator, who forwards it to the
 * Author.
 */
export function RejectReasonDialog({ isOpen, busy = false, error = '', onCancel, onConfirm }: RejectReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isOpen) { setReason(''); setTouched(false); }
  }, [isOpen]);

  if (!isOpen) return null;
  const missing = reason.trim() === '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-black text-slate-900">Reject this submission?</h3>
        <p className="mt-2 text-sm text-slate-600">
          Your decision goes to the Coordinator, who forwards it to the Author. This can't be undone from here.
        </p>
        <label className="mt-4 block text-xs font-bold text-slate-700">Reason for rejection (required)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={busy}
          rows={4}
          placeholder="Explain why this submission is being rejected..."
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
        {touched && missing && <p className="mt-1 text-xs font-semibold text-red-600">A reason is required.</p>}
        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { setTouched(true); if (!missing) onConfirm(reason.trim()); }}
            disabled={busy || missing}
            className="flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}
