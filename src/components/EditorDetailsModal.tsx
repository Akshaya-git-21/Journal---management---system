import React, { useState } from 'react';
import { X, Copy, Lock, AlertCircle } from 'lucide-react';
import { resetUserPassword } from '../lib/auth';
import { ProfileRow } from '../lib/workflow';

interface EditorDetailsModalProps {
  editor: ProfileRow | null;
  onClose: () => void;
}

export default function EditorDetailsModal({ editor, onClose }: EditorDetailsModalProps) {
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!editor) return null;

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleResetPassword = async () => {
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError('Please enter a password in both fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      // No token passed here -- resetUserPassword() always reads (and
      // refreshes if needed) a fresh session token itself. Passing one down
      // from a value captured once when the parent workspace mounted was
      // the actual bug: a Coordinator session open longer than the access
      // token's ~1hr lifetime would keep sending that same now-expired
      // token forever, failing with "Unauthorized: session is invalid or
      // has expired" on every attempt no matter how recently they'd logged in.
      await resetUserPassword(editor.id, newPassword);
      setTempPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordReset(false);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const initials = (editor.name || 'UN').split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#004d2b] to-[#008751] text-white px-6 py-4 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">{editor.role === 'REVIEWER' ? 'Reviewer' : editor.role === 'PUBLISHER' ? 'Publisher' : 'Editor'} Details</h2>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-1 rounded transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Profile Summary */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 font-bold flex items-center justify-center">
              {initials}
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-900">{editor.name || 'Unknown'}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">{editor.role || 'Editor'}</p>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Contact Information */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest font-bold text-slate-600">Contact</p>
            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Email</p>
                  <p className="text-sm font-medium text-slate-900 break-all">{editor.email}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(editor.email, 'email')}
                  className="ml-2 p-2 hover:bg-slate-100 rounded-lg transition shrink-0"
                  title="Copy email"
                >
                  <Copy className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              {copiedField === 'email' && <p className="text-[10px] text-emerald-600 font-semibold">✓ Copied</p>}
            </div>
          </div>

          {/* Account Information */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest font-bold text-slate-600">Account</p>
            <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Status:</span>
                <span className={`font-semibold px-2 py-1 rounded-full text-[11px] ${
                  editor.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                  editor.status === 'INVITED' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {editor.status}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">User ID:</span>
                <span className="font-mono text-slate-800 truncate">{editor.id.slice(0, 8)}...</span>
              </div>
            </div>
          </div>

          {/* Password Management */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-600" />
              <p className="text-xs uppercase tracking-widest font-bold text-slate-600">Login Credentials</p>
            </div>

            {!tempPassword && !showPasswordReset && (
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <p className="text-[11px] text-slate-600">Password: <span className="font-mono">••••••••</span></p>
                <p className="text-[10px] text-slate-500">
                  For security reasons, existing passwords cannot be retrieved. You can set a new temporary password for testing access.
                </p>
              </div>
            )}

            {tempPassword && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-3">
                <div className="bg-white rounded-lg p-2 flex items-center justify-between">
                  <p className="text-sm font-mono text-slate-800 break-all">{tempPassword}</p>
                  <button
                    onClick={() => copyToClipboard(tempPassword, 'password')}
                    className="ml-2 p-2 hover:bg-slate-100 rounded-lg transition shrink-0"
                    title="Copy password"
                  >
                    <Copy className="w-4 h-4 text-emerald-600" />
                  </button>
                </div>
                {copiedField === 'password' && <p className="text-[10px] text-emerald-600 font-semibold">✓ Copied</p>}
                <p className="text-[10px] text-emerald-700 font-semibold">Temporary password created successfully!</p>
              </div>
            )}

            {showPasswordReset && (
              <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-700">{error}</p>
                  </div>
                )}
                <input
                  type="password"
                  placeholder="New password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={loading}
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => {
                    const generated = generatePassword();
                    setNewPassword(generated);
                    setConfirmPassword(generated);
                  }}
                  disabled={loading}
                  className="w-full text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50 py-1 transition"
                >
                  Generate Random Password
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetPassword}
                    disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg font-semibold text-sm transition"
                  >
                    {loading ? 'Resetting...' : 'Set Password'}
                  </button>
                  <button
                    onClick={() => {
                      setShowPasswordReset(false);
                      setError(null);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    disabled={loading}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 px-3 py-2 rounded-lg font-semibold text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!tempPassword && (
              <button
                onClick={() => setShowPasswordReset(!showPasswordReset)}
                disabled={showPasswordReset}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold text-sm transition"
              >
                {showPasswordReset ? 'Setting password...' : 'Set Temporary Password'}
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-[10px] text-blue-700 leading-relaxed">
              <strong>Security Note:</strong> Passwords are encrypted and never stored in plaintext. New temporary passwords are only displayed once. Share securely with the editor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
