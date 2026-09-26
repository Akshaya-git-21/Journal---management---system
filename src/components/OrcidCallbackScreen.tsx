import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, MailCheck } from 'lucide-react';
import {
  OrcidHandoff,
  loginWithOrcidToken,
  completeOrcidSignup,
  linkOrcidToAccount,
  readPendingClaims,
} from '../lib/orcidAuth';
import type { Role } from '../types';

interface Props {
  handoff: OrcidHandoff;
  onSuccessAuth: (user: { name: string; email: string; role: Role }) => void;
  onBack: () => void;
}

type Step = 'working' | 'form' | 'link' | 'verify' | 'error';

const inputStyle =
  'w-full bg-white text-slate-900 border border-emerald-100/80 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:outline-none focus:border-[#008751] focus:ring-[#008751]';
const labelStyle = 'block text-slate-700 font-sans font-medium mb-0.5 text-xs sm:text-sm';
const primaryBtn =
  'w-full bg-[#008751] hover:bg-[#007043] text-white font-mono text-xs font-black uppercase tracking-widest py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-75 disabled:cursor-not-allowed';

export default function OrcidCallbackScreen({ handoff, onSuccessAuth, onBack }: Props) {
  const claims = handoff.kind === 'pending' && handoff.token ? readPendingClaims(handoff.token) : null;

  const [step, setStep] = useState<Step>(
    handoff.kind === 'login' ? 'working' : handoff.kind === 'pending' && claims ? 'form' : 'error'
  );
  const [error, setError] = useState(handoff.kind === 'error' ? handoff.message || 'ORCID sign-in failed.' : '');
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState(claims?.given || '');
  const [lastName, setLastName] = useState(claims?.family || '');
  const orcidEmails = claims?.emails || [];
  const [email, setEmail] = useState(orcidEmails[0] || '');
  const [affiliation, setAffiliation] = useState(claims?.affiliation || '');
  const [department, setDepartment] = useState(claims?.department || '');
  const [country, setCountry] = useState(claims?.country || '');
  const [password, setPassword] = useState('');

  const finish = async (token: string) => {
    const user = await loginWithOrcidToken(token);
    onSuccessAuth({ name: user.name, email: user.email, role: user.role });
  };

  // Returning author (iD already linked): exchange the one-time token for a session.
  useEffect(() => {
    if (handoff.kind !== 'login' || !handoff.token) return;
    finish(handoff.token).catch((e: any) => {
      setError(e.message || 'ORCID sign-in failed.');
      setStep('error');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await completeOrcidSignup(handoff.token!, email, firstName, lastName, { affiliation, department, country });
      if (r.status === 'link_required') setStep('link');
      else if (r.status === 'verify_email') setStep('verify');
      else if (r.token) await finish(r.token);
    });
  };

  const submitLink = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await linkOrcidToAccount(handoff.token!, email, password);
      if (r.token) await finish(r.token);
    });
  };

  const errorBox = error && (
    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-semibold">{error}</p>
  );

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white border border-slate-100 rounded-2xl shadow-xl p-6 sm:p-8 space-y-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-[#008751]">Continue with ORCID</p>

        {step === 'working' && (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Signing you in…
          </div>
        )}

        {step === 'form' && claims && (
          <form onSubmit={submitDetails} className="space-y-3">
            <h2 className="text-xl font-extrabold text-slate-900">Welcome{claims.given ? `, ${claims.given}` : ''}</h2>
            <p className="text-xs text-slate-500 font-semibold">
              ORCID iD <span className="text-[#008751] font-bold">{claims.orcid}</span> is verified. Confirm your details to create your Author account.
              {!orcidEmails.length && ' ORCID did not share an email, so please enter one.'}
            </p>
            {errorBox}
            <div>
              <label className={labelStyle}>Given names</label>
              <input className={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className={labelStyle}>Family name</label>
              <input className={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div>
              <label className={labelStyle}>Email address</label>
              {orcidEmails.length > 1 ? (
                <select className={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)}>
                  {orcidEmails.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : orcidEmails.length === 1 ? (
                <input className={`${inputStyle} bg-slate-50 cursor-not-allowed`} type="email" value={email} readOnly />
              ) : (
                <input className={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              )}
              <p className="text-[11px] text-slate-400 font-semibold mt-1">
                {orcidEmails.length
                  ? 'Taken from your ORCID record and verified by ORCID.'
                  : 'We will email you a link to confirm this address. To skip that step, set an email on your ORCID record to visible to "Everyone" and sign in with ORCID again.'}
              </p>
            </div>
            <div>
              <label className={labelStyle}>Primary affiliation</label>
              <input className={inputStyle} value={affiliation} onChange={(e) => setAffiliation(e.target.value)} placeholder="e.g. Stanford University" />
            </div>
            <div>
              <label className={labelStyle}>Department</label>
              <input className={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Computer Science" />
            </div>
            <div>
              <label className={labelStyle}>Country</label>
              <input className={inputStyle} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. United States" />
            </div>
            {(claims.affiliation || claims.country) && (
              <p className="text-[11px] text-slate-400 font-semibold">Affiliation and country were read from your public ORCID record. You can edit them.</p>
            )}
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : 'Create account'}
            </button>
          </form>
        )}

        {step === 'link' && (
          <form onSubmit={submitLink} className="space-y-3">
            <h2 className="text-xl font-extrabold text-slate-900">Link your existing account</h2>
            <p className="text-xs text-slate-500 font-semibold">
              An account with <span className="font-bold">{email}</span> already exists. Enter its password to link it to your ORCID iD.
            </p>
            {errorBox}
            <div>
              <label className={labelStyle}>Password</label>
              <input className={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </div>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : 'Link and continue'}
            </button>
            <button type="button" onClick={() => { setStep('form'); setError(''); }} className="text-xs font-bold text-slate-500 hover:underline cursor-pointer">
              ‹ Use a different email
            </button>
          </form>
        )}

        {step === 'verify' && (
          <div className="space-y-3 text-center py-2">
            <MailCheck className="w-8 h-8 text-[#008751] mx-auto" />
            <h2 className="text-xl font-extrabold text-slate-900">Check your inbox</h2>
            <p className="text-xs text-slate-500 font-semibold">
              Your account is created. We sent a confirmation link to <span className="font-bold">{email}</span>. Click it, then sign in with ORCID.
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm font-semibold">{error || 'ORCID sign-in failed.'}</p>
            </div>
          </div>
        )}

        {step !== 'working' && (
          <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 hover:underline cursor-pointer">
            ← Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
