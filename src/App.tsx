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
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('REGISTER');

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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname.toLowerCase();

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
        <div className="flex-grow flex flex-col min-h-screen bg-slate-50">
          {/* Top Editorial Ribbon */}
          <div className="bg-[#0f172a] text-slate-300 py-2.5 px-4 sm:px-6 border-b border-slate-800 text-xs">
            <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-8 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-400 font-mono">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>SYSTEM STATUS: ONLINE</span>
                <span className="text-slate-650">|</span>
                <span>OJS v3.4 COMPATIBLE</span>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 text-slate-400 flex-wrap justify-center">
                {([
                  { role: 'AUTHOR' as Role, label: 'Author Log In' },
                  { role: 'EDITOR' as Role, label: 'Editor Log In' },
                  { role: 'REVIEWER' as Role, label: 'Reviewer Log In' },
                  { role: 'PUBLISHER' as Role, label: 'Publisher Log In' },
                  { role: 'COORDINATOR' as Role, label: 'Coordinator Log In' },
                ]).map(({ role, label }, idx) => (
                  <React.Fragment key={role}>
                    {idx > 0 && <span>•</span>}
                    <button
                      onClick={() => {
                        setAuthRole(role);
                        setAuthMode('LOGIN');
                        setCurrentScreen('AUTH');
                      }}
                      className="hover:text-white transition cursor-pointer font-bold font-mono text-[10px] uppercase"
                    >
                      {label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Main Navigation Header */}
          <header className="bg-white border-b border-[#e2e8f0] px-4 sm:px-6 py-2.5 shadow-xs sticky top-0 z-50">
            <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-8 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TuliticsLogo iconSize={32} showText={true} textColorClass="text-[#155e42]" subTitle="PORTAL" usePng={true} />
              </div>

              <div className="flex items-center gap-3">
                {loggedInUser ? (
                  <>
                    <button
                      id="btn-nav-my-profile"
                      onClick={() => setCurrentScreen('WORKSPACE')}
                      className="px-4 py-2 bg-[#008751] hover:bg-[#007043] text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1"
                    >
                      <User className="w-3.5 h-3.5" />
                      My Profile
                    </button>
                    <button
                      id="btn-nav-sign-out"
                      onClick={handleSignOut}
                      className="px-4 py-2 border border-[#cbd8df] text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      id="btn-nav-sign-in"
                      onClick={() => {
                        setAuthRole('AUTHOR');
                        setAuthMode('LOGIN');
                        setCurrentScreen('AUTH');
                      }}
                      className="px-4 py-2 border border-[#cbd8df] text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm"
                    >
                      Sign In / Login
                    </button>
                    <button
                      id="btn-nav-register"
                      onClick={() => {
                        setAuthRole('AUTHOR');
                        setAuthMode('REGISTER');
                        setCurrentScreen('AUTH');
                      }}
                      className="px-4 py-2 bg-[#008751] hover:bg-[#007043] text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-md shadow-emerald-50/85"
                    >
                      Sign Up / Register
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Landing call-to-action: real submission now happens inside the
              Author workspace against a real account, so this screen's job
              is just to route people to sign up / log in. */}
          <div className="flex-grow w-full max-w-2xl mx-auto px-6 py-20 text-center">
            <h1 className="text-2xl font-black text-slate-900 mb-3">Submit Your Manuscript</h1>
            <p className="text-sm text-slate-500 mb-8">
              Create an Author account (or log in) to submit a manuscript and track it through peer review.
            </p>
            <button
              onClick={() => { setAuthRole('AUTHOR'); setAuthMode('REGISTER'); setCurrentScreen('AUTH'); }}
              className="px-6 py-3 bg-[#008751] hover:bg-[#007043] text-white rounded-lg text-sm font-bold transition cursor-pointer shadow-md"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {currentScreen === 'AUTH' && (
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
                  <PublisherWorkspace manuscripts={[]} onUpdateManuscript={() => {}} currentUser={loggedInUser} />
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
