import React, { useState, useEffect } from 'react';
import { resetPasswordWithToken } from '../lib/auth';
import TuliticsLogo from './TuliticsLogo';
import { Key, Eye, EyeOff, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

interface ResetPasswordScreenProps {
  onBackToLogin: () => void;
  onSuccessReset: () => void;
}

export default function ResetPasswordScreen({ onBackToLogin, onSuccessReset }: ResetPasswordScreenProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  const labelStyle = "block text-slate-700 font-sans font-medium mb-0.5 text-xs sm:text-sm leading-tight";
  const inputStyle = `w-full bg-white text-slate-900 placeholder-slate-400 border border-emerald-100/80 rounded-lg pl-9 pr-9 py-1.5 focus:ring-2 focus:outline-none focus:border-[#008751] focus:ring-[#008751] font-sans font-semibold text-sm transition-all duration-200 shadow-xs`;

  const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!password) {
      errors.push('Password is required');
    }
    if (password.length < 8) {
      errors.push('At least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('At least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('At least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('At least one number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  };

  const passwordValidation = validatePassword(newPassword);
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Validate both passwords
    if (!newPassword || !confirmPassword) {
      setErrorMsg('Both password fields are required.');
      return;
    }

    if (!passwordValidation.valid) {
      setErrorMsg('Password does not meet security requirements.');
      return;
    }

    if (!passwordsMatch) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await resetPasswordWithToken(newPassword, confirmPassword);
      setSuccessMsg('Your password has been reset successfully!');
      setPasswordResetSuccess(true);
      setNewPassword('');
      setConfirmPassword('');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        onSuccessReset();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="reset-password-screen" className="min-h-screen md:h-screen w-full bg-white flex flex-col md:flex-row relative overflow-y-auto md:overflow-hidden animate-fade-in">

      <button
        id="btn-reset-password-back"
        onClick={onBackToLogin}
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-xs text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg transition-all duration-150 font-bold cursor-pointer shadow-xs"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
      </button>

      {/* Left Decorative Sidebar - Green */}
      <div id="reset-password-decorative-sidebar" className="w-full md:w-[42%] bg-[#1a4038] text-white p-6 md:p-8 lg:p-10 flex flex-col justify-center relative md:h-screen shrink-0 md:overflow-hidden select-none">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-10 pointer-events-none z-0" />
        <div className="absolute -left-12 -top-12 w-64 h-64 bg-emerald-800/20 rounded-full blur-2xl pointer-events-none z-0" />

        <div className="relative z-10 space-y-6 my-auto max-w-xl md:ml-auto w-full">
          <div className="space-y-4">
            <h2 className="text-2xl lg:text-3xl font-sans font-extrabold tracking-tight text-white leading-tight">
              Create a New Password
            </h2>
            <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
              Your password reset link is valid and ready to use. Please create a strong, unique password to protect your account.
            </p>
            <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
              Make sure to choose a password that is difficult to guess and includes a mix of uppercase, lowercase, numbers, and special characters.
            </p>
          </div>

          <div className="space-y-3 pt-4 border-t border-emerald-800/40">
            <h3 className="text-lg lg:text-xl font-sans font-extrabold tracking-tight text-white">
              Password Requirements
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-emerald-100/90 list-none">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                <span>At least 8 characters long</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                <span>Contains uppercase letters (A-Z)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                <span>Contains lowercase letters (a-z)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                <span>Contains numbers (0-9)</span>
              </li>
            </ul>
          </div>

          <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-3 text-xs text-emerald-100/80 font-semibold">
            ⏱️ <strong>Important:</strong> This reset link expires in 24 hours for security. If it expires, you can request a new one.
          </div>
        </div>
      </div>

      {/* Right Form Side - White */}
      <div className="w-full md:w-[58%] bg-slate-50/50 p-4 md:p-6 lg:p-8 flex flex-col justify-center items-center relative overflow-y-auto md:overflow-hidden md:h-screen shrink-0">
        <div className="max-w-lg w-full mx-auto my-auto space-y-4 py-6 px-5 sm:px-7 md:px-8 bg-white border border-slate-100 rounded-2xl shadow-xl md:shadow-[0_8px_30px_rgb(0,0,0,0.06)] md:max-h-[calc(100vh-3rem)] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">

          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-sans font-black text-lg text-slate-900 tracking-tight leading-none">
                Reset Password
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Create a strong, new password for your account.
              </p>
            </div>
            <Key className="w-8 h-8 text-[#008751] opacity-20" />
          </div>

          {/* Alerts Banner */}
          {errorMsg && (
            <div id="reset-password-err-banner" className="bg-red-50 border border-red-200/60 text-red-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in font-semibold">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-500 stroke-[2.2]" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div id="reset-password-success-banner" className="bg-emerald-50 border border-[#bbf7d0] text-emerald-900 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in font-semibold">
              <CheckCircle className="w-4.5 h-4.5 shrink-0 text-[#008751] stroke-[2.2]" />
              <span>{successMsg}</span>
            </div>
          )}

          {passwordResetSuccess ? (
            <div className="space-y-4 text-center py-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-[#008751]" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">Password Reset Successfully!</h3>
                <p className="text-xs text-slate-600 font-semibold">
                  Your password has been updated. You will be redirected to login shortly.
                </p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 space-y-2">
                <p className="font-semibold">What's next:</p>
                <p>You can now log in using your new password. Make sure to keep your new password secure.</p>
              </div>
              <button
                type="button"
                onClick={onSuccessReset}
                className="w-full mt-4 bg-[#008751] hover:bg-[#007043] text-white font-mono text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg transition-all duration-150 cursor-pointer shadow-sm hover:shadow"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* New Password Field */}
              <div>
                <label className={labelStyle}>New Password</label>
                <div className="relative flex items-center shadow-xs rounded-lg">
                  <Key className="absolute left-3 w-4 h-4 text-slate-400" />
                  <input
                    id="input-reset-password-new"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={inputStyle}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
                    disabled={!newPassword}
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {newPassword && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-600">Password requirements:</div>
                    <div className="space-y-1">
                      {[
                        { check: newPassword.length >= 8, label: 'At least 8 characters' },
                        { check: /[A-Z]/.test(newPassword), label: 'Uppercase letter' },
                        { check: /[a-z]/.test(newPassword), label: 'Lowercase letter' },
                        { check: /[0-9]/.test(newPassword), label: 'Number' }
                      ].map((req, idx) => (
                        <div key={idx} className={`text-xs flex items-center gap-1.5 ${req.check ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <span className={`text-xs font-bold ${req.check ? 'text-emerald-600' : 'text-slate-300'}`}>
                            {req.check ? '✓' : '○'}
                          </span>
                          {req.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Field */}
              <div>
                <label className={labelStyle}>Confirm Password</label>
                <div className="relative flex items-center shadow-xs rounded-lg">
                  <Key className="absolute left-3 w-4 h-4 text-slate-400" />
                  <input
                    id="input-reset-password-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={`${inputStyle} ${confirmPassword && !passwordsMatch ? 'border-red-300' : ''}`}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
                    disabled={!confirmPassword}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Password Match Indicator */}
                {confirmPassword && (
                  <div className={`mt-1.5 text-xs font-semibold flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-600' : 'text-red-600'}`}>
                    <span className={passwordsMatch ? 'text-emerald-600' : 'text-red-600'}>
                      {passwordsMatch ? '✓' : '✗'}
                    </span>
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                id="btn-reset-password-submit"
                type="submit"
                disabled={loading || !passwordValidation.valid || !passwordsMatch}
                className="w-full bg-[#008751] hover:bg-[#007043] text-white font-mono text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-sm hover:shadow disabled:opacity-75 disabled:cursor-not-allowed mt-6"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  'Update Password'
                )}
              </button>

              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full text-[#008751] hover:text-[#007043] font-bold text-xs underline transition-colors py-2"
              >
                Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
