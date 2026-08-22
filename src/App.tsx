/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Role } from './types';
import RoleSelector from './components/RoleSelector';
import TuliticsLogo from './components/TuliticsLogo';
import RequireRole from './components/RequireRole';
import AuthorWorkspace from './components/AuthorWorkspace';
import EditorWorkspace from './components/EditorWorkspace';
import ReviewerWorkspace from './components/ReviewerWorkspace';
import PublisherWorkspace from './components/PublisherWorkspace';
import CoordinatorWorkspace from './components/CoordinatorWorkspace';
import AuthPortals from './components/AuthPortals';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import { CheckCircle2, LogOut, User, AlertTriangle } from 'lucide-react';
import { checkSupabaseConnection } from './lib/supabase';
import { restoreSession, onAuthChange, logoutAccount } from './lib/auth';

export default function App() {
  // Screen routing state: 'SUBMISSION' | 'AUTH' | 'WORKSPACE'
  const [currentScreen, setCurrentScreen] = useState<'SUBMISSION' | 'AUTH' | 'WORKSPACE'>(() => {
    const saved = localStorage.getItem('jms_sim_current_screen');
    const val = (saved as 'SUBMISSION' | 'AUTH' | 'WORKSPACE') || 'SUBMISSION';
    return val;
  });

  // Authentication specific roles & modes (authRole only presets which
  // AuthPortals tab/label is shown -- it has no bearing on the role actually
  // granted, which always comes from the authenticated account's profile)
  const [authRole, setAuthRole] = useState<Role>('AUTHOR');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'>('REGISTER');
  const [showResetPasswordScreen, setShowResetPasswordScreen] = useState(false);

  // loggedInUser seeded from localStorage only as an optimistic UI cache to
  // avoid a flash of the auth screen -- the effect below always re-validates
  // it against the real Supabase session and clears it if that check fails.
  const [loggedInUser, setLoggedInUser] = useState<{ name: string; email: string; role: Role } | null>(() => {
    const saved = localStorage.getItem('jms_sim_logged_in_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [sessionChecked, setSessionChecked] = useState(false);

  const [notification, setNotification] = useState<string>('');

  // Supabase Connection States
  const [supabaseStatus, setSupabaseStatus] = useState<{ connected: boolean; schemaExists: boolean; error?: string } | null>(null);

  useEffect(() => {
    checkSupabaseConnection().then(setSupabaseStatus);
  }, []);

  // Re-validate the session against Supabase Auth -- this is the real
  // authorization check; the cached loggedInUser above is only a UI hint
  // until this resolves. Also reacts to sign-out happening elsewhere.
  useEffect(() => {
    let active = true;

    restoreSession().then((user) => {
      if (!active) return;
      setLoggedInUser(user);
      setSessionChecked(true);
    });

    const unsubscribe = onAuthChange((user) => {
      if (!user) setLoggedInUser(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('jms_sim_current_screen', currentScreen);
  }, [currentScreen]);

  useEffect(() => {
    if (loggedInUser) {
      localStorage.setItem('jms_sim_logged_in_user', JSON.stringify(loggedInUser));
    } else {
      localStorage.removeItem('jms_sim_logged_in_user');
    }
  }, [loggedInUser]);

  // Safeguard: Do not allow direct access to Workspace (profile) unless authenticated.
  // Gated on sessionChecked so a stale localStorage cache isn't trusted before
  // the real Supabase session has been validated.
  useEffect(() => {
    if (sessionChecked && currentScreen === 'WORKSPACE' && !loggedInUser) {
      setCurrentScreen('AUTH');
    }
  }, [currentScreen, loggedInUser, sessionChecked]);

  // Check for external link routing to Login/Signup directly (e.g. from tulitics.vercel.app)
  // Also detect reset-password mode for password recovery flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname.toLowerCase();
    const mode = params.get('mode');

    // Check if we're in reset password flow
    if (mode === 'reset-password') {
      setShowResetPasswordScreen(true);
      setCurrentScreen('AUTH');
      return;
    }

    const isSubmitPath = pathname.includes('submit') || pathname.includes('publish');
    const isAuthPath = pathname.includes('auth') || pathname.includes('login') || pathname.includes('signup') || pathname.includes('register');

    const hasSubmit = isSubmitPath || params.has('submit') || params.get('action') === 'submit' || params.get('action') === 'publish' || params.has('publish');
    const hasAuth = isAuthPath || params.has('auth') || params.has('login') || params.has('signup') || params.has('register') || params.get('action') === 'login' || params.get('action') === 'signup' || params.get('action') === 'register';

    if (hasSubmit) {
      setAuthRole('AUTHOR');
      setAuthMode('REGISTER');
      setCurrentScreen('AUTH');
    } else if (hasAuth) {
      if (params.has('login') || params.get('action') === 'login' || pathname.includes('login')) {
        setAuthMode('LOGIN');
      } else {
        setAuthMode('REGISTER');
      }
      setCurrentScreen('AUTH');
    }
  }, []);

  const handleSignOut = async () => {
    await logoutAccount();
    setLoggedInUser(null);
    setAuthRole('AUTHOR');
    setAuthMode('LOGIN');
    setCurrentScreen('AUTH');
    setNotification('You have logged out successfully.');
    setTimeout(() => setNotification(''), 4000);
  };

  return (
    <div
      id="jms-application-root"
      className={`bg-slate-50 flex flex-col text-slate-800 ${
        currentScreen === 'WORKSPACE' && loggedInUser?.role === 'COORDINATOR' ? 'h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >

      {/* Supabase Connection Helper Widget */}
      {supabaseStatus && !supabaseStatus.connected && (
        <div id="supabase-status-helper" className="bg-[#fff9e6] border-b border-[#ffe0b2] text-[#5c3e00] p-4 shrink-0 transition-all">
          <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-8 lg:px-10 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#f57c00] shrink-0 mt-0.5" />
            <div className="text-xs font-sans text-left">
              <p className="font-extrabold uppercase tracking-wider text-[#b26a00]">⚠️ SUPABASE CONNECTION ERROR</p>
              <p className="text-[#5c3e00] font-medium mt-1">
                Could not reach your Supabase endpoint: {supabaseStatus.error || 'Connection timed out'}. Please double check your environment keys.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main operational notifications banner */}
      {notification && (
        <div id="global-success-banner" className="bg-emerald-700 text-white p-3 shadow-md shrink-0">
          <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-8 lg:px-10 flex items-center gap-2 text-xs font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            <span className="font-bold uppercase tracking-wide">NOTIFICATION:</span>
            <span>{notification}</span>
          </div>
        </div>
      )}

      {/* RENDER CONTROLLER */}
      {currentScreen === 'SUBMISSION' && (
        <div className="min-h-screen md:h-screen w-full bg-white flex flex-col md:flex-row relative overflow-y-auto md:overflow-hidden animate-fade-in">
          {/* Left Decorative Sidebar - Green */}
          <div className="w-full md:w-[42%] bg-[#1a4038] text-white p-6 md:p-8 lg:p-10 flex flex-col justify-center relative md:h-screen shrink-0 md:overflow-hidden select-none">
            <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-10 pointer-events-none z-0" />
            <div className="absolute -left-12 -top-12 w-64 h-64 bg-emerald-800/20 rounded-full blur-2xl pointer-events-none z-0" />

            <div className="relative z-10 space-y-6 my-auto max-w-xl md:ml-auto w-full">
              <div className="space-y-3">
                <h2 className="text-2xl lg:text-3xl font-sans font-extrabold tracking-tight text-white leading-tight">
                  Unlock your growth potential with our insights
                </h2>
                <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
                  Sign up to get reports, industry news and resources for your business in your inbox—sourced from Euromonitor experts and our market research knowledge hub, Passport.
                </p>
                <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
                  Each month, you can expect a curated roundup of market, consumer and economic insights. Our goal: to help you navigate challenges and explore new pathways to growth.
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-emerald-800/40">
                <h3 className="text-lg lg:text-xl font-sans font-extrabold tracking-tight text-white">
                  Why Tulitics?
                </h3>
                <ul className="space-y-2 text-xs sm:text-sm text-emerald-100/90 list-none">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <span>Stay updated on industry trends, consumer preferences and economic shifts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <span>Access free reports and strategic resources from our research experts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <span>Get insights and data to inspire your strategy</span>
                  </li>
                </ul>
                <p className="text-emerald-200/80 text-[11px] sm:text-xs italic pt-1">
                  Whatever stage you're at in your organisation, we'll help you stay in the know.
                </p>
              </div>
            </div>
          </div>

          {/* Right Content Side - White */}
          <div className="w-full md:w-[58%] bg-slate-50/50 p-4 md:p-6 lg:p-8 flex flex-col justify-center items-center relative overflow-y-auto md:overflow-hidden md:h-screen shrink-0">
            <div className="max-w-lg w-full mx-auto my-auto space-y-6 py-4 px-5 sm:px-7 md:px-8 bg-white border border-slate-100 rounded-2xl shadow-xl md:shadow-[0_8px_30px_rgb(0,0,0,0.06)] md:max-h-[calc(100vh-3rem)] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
              <div>
                <h2 className="font-sans font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Submit Your Manuscript
                </h2>
                <p className="text-xs text-slate-500 font-semibold mt-2">
                  Create an account or log in to submit a manuscript and track it through peer review.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {loggedInUser ? (
                  <>
                    <button
                      id="btn-nav-my-profile"
                      onClick={() => setCurrentScreen('WORKSPACE')}
                      className="px-4 py-3 bg-[#008751] hover:bg-[#007043] text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center gap-2 w-full"
                    >
                      <User className="w-4 h-4" />
                      Go to My Profile
                    </button>
                    <button
                      id="btn-nav-sign-out"
                      onClick={handleSignOut}
                      className="px-4 py-3 border border-[#cbd8df] text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm flex items-center justify-center gap-2 w-full"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      id="btn-nav-register"
                      onClick={() => {
                        setAuthRole('AUTHOR');
                        setAuthMode('REGISTER');
                        setCurrentScreen('AUTH');
                      }}
                      className="px-6 py-3 bg-[#008751] hover:bg-[#007043] text-white rounded-lg text-sm font-bold transition cursor-pointer shadow-md shadow-emerald-50/85 w-full"
                    >
                      Create Author Account
                    </button>
                    <button
                      id="btn-nav-sign-in"
                      onClick={() => {
                        setAuthRole('AUTHOR');
                        setAuthMode('LOGIN');
                        setCurrentScreen('AUTH');
                      }}
                      className="px-6 py-3 border border-[#008751] text-[#008751] hover:bg-emerald-50 rounded-lg text-sm font-bold transition cursor-pointer shadow-sm w-full"
                    >
                      Sign In / Login
                    </button>
                  </>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-600 font-semibold mb-3">Other Portal Access:</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { role: 'EDITOR' as Role, label: 'Editor' },
                    { role: 'REVIEWER' as Role, label: 'Reviewer' },
                    { role: 'PUBLISHER' as Role, label: 'Publisher' },
                    { role: 'COORDINATOR' as Role, label: 'Coordinator' },
                  ]).map(({ role, label }) => (
                    <button
                      key={role}
                      onClick={() => {
                        setAuthRole(role);
                        setAuthMode('LOGIN');
                        setCurrentScreen('AUTH');
                      }}
                      className="px-3 py-2 border border-slate-200 hover:border-[#008751] text-slate-700 hover:text-[#008751] rounded-lg text-xs font-bold transition cursor-pointer hover:bg-emerald-50"
                    >
                      {label} Login
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentScreen === 'AUTH' && showResetPasswordScreen && (
        <ResetPasswordScreen
          onBackToLogin={() => {
            setShowResetPasswordScreen(false);
            setAuthMode('LOGIN');
          }}
          onSuccessReset={() => {
            setShowResetPasswordScreen(false);
            setAuthMode('LOGIN');
            setCurrentScreen('AUTH');
            setNotification('Password reset successfully! Please log in with your new password.');
            setTimeout(() => setNotification(''), 4000);
          }}
        />
      )}

      {currentScreen === 'AUTH' && !showResetPasswordScreen && (
        <AuthPortals
          activeRole={authRole}
          initialMode={authMode}
          onBackToLanding={() => {
            if (loggedInUser) {
              setCurrentScreen('WORKSPACE');
            } else {
              setCurrentScreen('SUBMISSION');
            }
          }}
          onSuccessAuth={(user) => {
            setLoggedInUser(user);
            setCurrentScreen('WORKSPACE');
            setNotification(`Successfully logged in as ${user.name}`);
            setTimeout(() => setNotification(''), 4000);
          }}
        />
      )}

      {currentScreen === 'WORKSPACE' && (() => {
        // Coordinator uses a fixed dashboard shell (sidebar + internally
        // scrolling content, like a desktop app) -- everything else uses
        // ordinary page scrolling. Only Coordinator gets the bounded/
        // overflow-hidden treatment; forcing it on the others would clip
        // their content, since they're built assuming the page itself grows
        // and scrolls (min-h-screen), not a fixed-height shell.
        const isShell = loggedInUser?.role === 'COORDINATOR';
        const shellClass = isShell ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'flex-grow flex flex-col';
        return (
        <div className={shellClass}>
          {/* Workspace chrome for every role except Author (whose workspace has its own header) */}
          {loggedInUser && loggedInUser.role !== 'AUTHOR' && (
            <RoleSelector
              activeRole={loggedInUser.role}
              unassignedCount={0}
              inReviewCount={0}
              inProductionCount={0}
              loggedInUser={loggedInUser}
              onSignOut={handleSignOut}
            />
          )}

          <main id="jms-workspace-main" className={shellClass}>
            <div className={`animate-fade-in duration-300 ${shellClass}`}>
              {/* The workspace rendered is always exactly the authenticated
                  user's own role -- there is no client-side role switch. */}
              <RequireRole role={loggedInUser?.role} allowed={['AUTHOR', 'EDITOR', 'REVIEWER', 'PUBLISHER', 'COORDINATOR']}>
                {loggedInUser?.role === 'AUTHOR' && (
                  <AuthorWorkspace currentUser={loggedInUser} onSignOut={handleSignOut} />
                )}

                {loggedInUser?.role === 'EDITOR' && (
                  <EditorWorkspace currentUser={loggedInUser} />
                )}

                {loggedInUser?.role === 'REVIEWER' && (
                  <ReviewerWorkspace currentUser={loggedInUser} />
                )}

                {loggedInUser?.role === 'PUBLISHER' && (
                  <PublisherWorkspace currentUser={loggedInUser} />
                )}

                {loggedInUser?.role === 'COORDINATOR' && (
                  <CoordinatorWorkspace />
                )}
              </RequireRole>
            </div>
          </main>
        </div>
        );
      })()}

    </div>
  );
}
