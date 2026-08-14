import React, { useState } from 'react';
import { requestPasswordReset } from '../lib/auth';
import TuliticsLogo from './TuliticsLogo';
import { Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  const labelStyle = "block text-slate-700 font-sans font-medium mb-0.5 text-xs sm:text-sm leading-tight";
  const inputStyle = `w-full bg-white text-slate-900 placeholder-slate-400 border border-emerald-100/80 rounded-lg pl-9 pr-3 py-1.5 focus:ring-2 focus:outline-none focus:border-[#008751] focus:ring-[#008751] font-sans font-semibold text-sm transition-all duration-200 shadow-xs`;

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Validate email
    if (!email) {
      setErrorMsg('Email address is required.');
      return;
    }

    if (!validateEmail(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSuccessMsg(`Password reset email sent to ${email}. Check your inbox for further instructions.`);
      setEmailSubmitted(true);
      setEmail('');
    } catch (err: any) {
      // Security: Don't reveal if email exists or not to prevent account enumeration
      setErrorMsg('If an account exists with this email, you will receive a password reset link shortly.');
      setEmailSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="forgot-password-screen" className="min-h-screen md:h-screen w-full bg-white flex flex-col md:flex-row relative overflow-y-auto md:overflow-hidden animate-fade-in">

      <button
        id="btn-forgot-password-back"
        onClick={onBackToLogin}
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-xs text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg transition-all duration-150 font-bold cursor-pointer shadow-xs"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
      </button>

      {/* Left Decorative Sidebar - Green */}
      <div id="forgot-password-decorative-sidebar" className="w-full md:w-[42%] bg-[#1a4038] text-white p-6 md:p-8 lg:p-10 flex flex-col justify-center relative md:h-screen shrink-0 md:overflow-hidden select-none">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-10 pointer-events-none z-0" />
        <div className="absolute -left-12 -top-12 w-64 h-64 bg-emerald-800/20 rounded-full blur-2xl pointer-events-none z-0" />

        <div className="relative z-10 space-y-6 my-auto max-w-xl md:ml-auto w-full">
          <div className="space-y-4">
            <h2 className="text-2xl lg:text-3xl font-sans font-extrabold tracking-tight text-white leading-tight">
              Reset Your Password
            </h2>
            <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
              We understand that losing access to your account can be frustrating. Don't worry—we've made it easy to regain access securely.
            </p>
            <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
              Enter the email address associated with your account, and we'll send you a secure link to reset your password.
            </p>
          </div>

          <div className="space-y-3 pt-4 border-t border-emerald-800/40">
            <h3 className="text-lg lg:text-xl font-sans font-extrabold tracking-tight text-white">
              How it works
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-emerald-100/90 list-none">
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 font-black text-base shrink-0 mt-0">1</span>
                <span>Enter your email address in the form</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 font-black text-base shrink-0 mt-0">2</span>
                <span>Check your email for a password reset link</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 font-black text-base shrink-0 mt-0">3</span>
                <span>Click the link and create a new password</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-400 font-black text-base shrink-0 mt-0">4</span>
                <span>Log in with your new password</span>
              </li>
            </ul>
          </div>

          <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-3 text-xs text-emerald-100/80 font-semibold">
            ⚠️ <strong>Security tip:</strong> Never share your password reset link with anyone. Tulitics support will never ask for your password.
          </div>
        </div>
      </div>

      {/* Right Form Side - White */}
      <div className="w-full md:w-[58%] bg-slate-50/50 p-4 md:p-6 lg:p-8 flex flex-col justify-center items-center relative overflow-y-auto md:overflow-hidden md:h-screen shrink-0">
        <div className="max-w-lg w-full mx-auto my-auto space-y-4 py-6 px-5 sm:px-7 md:px-8 bg-white border border-slate-100 rounded-2xl shadow-xl md:shadow-[0_8px_30px_rgb(0,0,0,0.06)] md:max-h-[calc(100vh-3rem)] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">

          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-sans font-black text-lg text-slate-900 tracking-tight leading-none">
                Forgot Password
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                We'll send you a secure link to reset your password.
              </p>
            </div>
            <Mail className="w-8 h-8 text-[#008751] opacity-20" />
          </div>

          {/* Alerts Banner */}
          {errorMsg && (
            <div id="forgot-password-err-banner" className="bg-red-50 border border-red-200/60 text-red-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in font-semibold">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-500 stroke-[2.2]" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div id="forgot-password-success-banner" className="bg-emerald-50 border border-[#bbf7d0] text-emerald-900 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in font-semibold">
              <CheckCircle className="w-4.5 h-4.5 shrink-0 text-[#008751] stroke-[2.2]" />
              <span>{successMsg}</span>
            </div>
          )}

          {emailSubmitted ? (
            <div className="space-y-4 text-center py-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-[#008751]" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">Email sent successfully!</h3>
                <p className="text-xs text-slate-600 font-semibold">
                  Check your inbox and spam folder for an email from us with a password reset link.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-2 text-left">
                <p className="font-semibold">Next steps:</p>
                <ul className="list-inside space-y-1 text-slate-600">
                  <li>• Check your email for the reset link</li>
                  <li>• Click the link to reset your password</li>
                  <li>• Link expires in 24 hours for security</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full mt-4 bg-[#008751] hover:bg-[#007043] text-white font-mono text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg transition-all duration-150 cursor-pointer shadow-sm hover:shadow"
              >
                Back to Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmailSubmitted(false);
                  setEmail('');
                }}
                className="w-full text-[#008751] hover:text-[#007043] font-bold text-xs underline transition-colors"
              >
                Try another email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelStyle}>Email Address</label>
                <div className="relative flex items-center shadow-xs rounded-lg">
                  <Mail className="absolute left-3 w-4 h-4 text-slate-400" />
                  <input
                    id="input-forgot-password-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@university-journal.org"
                    className={inputStyle}
                    disabled={loading}
                  />
                </div>
                {email && !validateEmail(email) && (
                  <p className="text-red-600 text-xs mt-1 font-semibold">Please enter a valid email address</p>
                )}
              </div>

              <button
                id="btn-forgot-password-submit"
                type="submit"
                disabled={loading || !email || !validateEmail(email)}
                className="w-full bg-[#008751] hover:bg-[#007043] text-white font-mono text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-sm hover:shadow disabled:opacity-75 disabled:cursor-not-allowed mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
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
