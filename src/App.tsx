/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Role, Manuscript } from './types';
import { INITIAL_MANUSCRIPTS } from './initialData';
import RoleSelector from './components/RoleSelector';
import TuliticsLogo from './components/TuliticsLogo';
import AuthorWorkspace from './components/AuthorWorkspace';
import EditorWorkspace from './components/EditorWorkspace';
import ReviewerWorkspace from './components/ReviewerWorkspace';
import PublisherWorkspace from './components/PublisherWorkspace';
import ArchitectWorkspace from './components/ArchitectWorkspace';
import CoordinatorWorkspace from './components/CoordinatorWorkspace';
import AuthPortals from './components/AuthPortals';
import NewSubmissionFlow from './components/NewSubmissionFlow';
import { CheckCircle2, LogOut, Info, Layers, BookOpen, User, AlertTriangle, Check, Copy } from 'lucide-react';
import { 
  supabase, 
  checkSupabaseConnection, 
  getManuscriptsFromDb, 
  upsertManuscriptToDb, 
  getSupabaseSQLScript 
} from './lib/supabase';

export default function App() {
  // Screen routing state: 'SUBMISSION' | 'AUTH' | 'WORKSPACE'
  const [currentScreen, setCurrentScreen] = useState<'SUBMISSION' | 'AUTH' | 'WORKSPACE'>(() => {
    const saved = localStorage.getItem('jms_sim_current_screen');
    const val = (saved as 'SUBMISSION' | 'AUTH' | 'WORKSPACE') || 'SUBMISSION';
    return val;
  });

  // Authentication specific roles & modes
  const [authRole, setAuthRole] = useState<Role>(() => {
    const saved = localStorage.getItem('jms_sim_active_role');
    const val = (saved as Role) || 'AUTHOR';
    return val === 'ARCHITECT' ? 'AUTHOR' : val;
  });
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  const [loggedInUser, setLoggedInUser] = useState<{ name: string; email: string; role: Role } | null>(() => {
    const saved = localStorage.getItem('jms_sim_logged_in_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Current active workspace role
  const [activeRole, setActiveRole] = useState<Role>(() => {
    const saved = localStorage.getItem('jms_sim_active_role');
    return (saved as Role) || 'AUTHOR';
  });

  // Load manuscripts state from localStorage or load default initial data
  const [manuscripts, setManuscripts] = useState<Manuscript[]>(() => {
    const saved = localStorage.getItem('jms_sim_manuscripts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse manuscripts local storage", e);
      }
    }
    return INITIAL_MANUSCRIPTS;
  });

  const [notification, setNotification] = useState<string>('');

  // Supabase Connection States
  const [supabaseStatus, setSupabaseStatus] = useState<{ connected: boolean; schemaExists: boolean; error?: string } | null>(null);
  const [showSqlScript, setShowSqlScript] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load/Seed database on startup if active
  useEffect(() => {
    async function initSupabase() {
      const status = await checkSupabaseConnection();
      setSupabaseStatus(status);
      
      if (status.connected && status.schemaExists) {
        try {
          const dbManuscripts = await getManuscriptsFromDb();
          if (dbManuscripts.length === 0) {
            // Seed the Supabase database with default entries for immediate rich dashboard content
            console.log("Supabase database empty. Seeding INITIAL_MANUSCRIPTS...");
            for (const m of INITIAL_MANUSCRIPTS) {
              await upsertManuscriptToDb(m);
            }
            const reloaded = await getManuscriptsFromDb();
            setManuscripts(reloaded);
          } else {
            setManuscripts(dbManuscripts);
          }
        } catch (err) {
          console.error("Failed to load or seed Supabase manuscripts", err);
        }
      }
    }
    initSupabase();
  }, []);

  // Synchronize state changes to Local Storage
  useEffect(() => {
    localStorage.setItem('jms_sim_manuscripts', JSON.stringify(manuscripts));
  }, [manuscripts]);

  useEffect(() => {
    localStorage.setItem('jms_sim_active_role', activeRole);
  }, [activeRole]);

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
      setAuthMode('LOGIN');
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

  const handleRoleChange = (role: Role) => {
    setActiveRole(role);
    setNotification(''); 
  };

  const handleUpdateManuscript = async (updated: Manuscript) => {
    setManuscripts((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
    try {
      await upsertManuscriptToDb(updated);
    } catch (err) {
      console.warn("Could not upsert manuscript update to Supabase, local cache preserved:", err);
    }
  };

  const handleSaveDraftManuscript = async (draft: Manuscript) => {
    setManuscripts((prev) => {
      const exists = prev.some((m) => m.id === draft.id);
      if (exists) {
        return prev.map((m) => (m.id === draft.id ? draft : m));
      } else {
        return [...prev, draft];
      }
    });
    try {
      await upsertManuscriptToDb(draft);
    } catch (err) {
      console.warn("Could not upsert manuscript draft to Supabase, local cache preserved:", err);
    }
  };

  const handleSubmitManuscript = async (manuscriptId: string) => {
    // Find the manuscript and trigger status change
    const m = manuscripts.find((item) => item.id === manuscriptId);
    if (m) {
      const updated: Manuscript = {
        ...m,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString()
      };
      await handleUpdateManuscript(updated);
    }

    setNotification(`SUCCESS: Manuscript proposal ${manuscriptId} successfully initialized and dispatched to Editor review queue.`);
    setTimeout(() => {
      setNotification('');
    }, 6000);
  };

  const handleSignOut = () => {
    setLoggedInUser(null);
    setCurrentScreen('SUBMISSION');
    setNotification('You have logged out successfully.');
    setTimeout(() => setNotification(''), 4000);
  };

  // Compute live telemetry counts for indicators matching specified statuses
  const unassignedCount = manuscripts.filter((m) => m.status === 'SUBMITTED').length;
  const inReviewCount = manuscripts.filter(
    (m) => m.status === 'UNDER_REVIEW' || m.status === 'AWAITING_DECISION'
  ).length;
  const inProductionCount = manuscripts.filter((m) => m.status === 'ACCEPTED').length;

  return (
    <div id="jms-application-root" className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      
      {/* Supabase Connection Helper Widget */}
      {supabaseStatus && (!supabaseStatus.connected || !supabaseStatus.schemaExists) && (
        <div id="supabase-status-helper" className="bg-[#fff9e6] border-b border-[#ffe0b2] text-[#5c3e00] p-4 shrink-0 transition-all">
          <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#f57c00] shrink-0 mt-0.5" />
              <div className="text-xs font-sans text-left">
                <p className="font-extrabold uppercase tracking-wider text-[#b26a00]">
                  {supabaseStatus.connected ? '🔌 SUPABASE CONNECTED (MIGRATION REQUIRED)' : '⚠️ SUPABASE CONNECTION ERROR'}
                </p>
                <p className="text-[#5c3e00] font-medium mt-1">
                  {supabaseStatus.connected 
                    ? `Connected to Supabase project 'uqevcpokthdqlispnxyz', but the required database tables or buckets are not initialized.`
                    : `Could not reach your Supabase endpoint: ${supabaseStatus.error || 'Connection timed out'}. Please double check your environment keys.`}
                </p>
              </div>
            </div>
            
            {supabaseStatus.connected && (
              <div className="flex items-center gap-3 self-end md:self-auto">
                <button
                  onClick={() => setShowSqlScript(!showSqlScript)}
                  className="px-4 py-2 bg-[#ffb74d] hover:bg-[#ffa726] text-[#5c3e00] font-mono text-[10px] font-black uppercase tracking-wider rounded-lg shadow-xs transition cursor-pointer"
                >
                  {showSqlScript ? 'Hide SQL Script' : 'Reveal SQL Setup Script'}
                </button>
              </div>
            )}
          </div>

          {showSqlScript && (
            <div className="max-w-7xl mx-auto px-4 mt-4 animate-fade-in text-left">
              <div className="bg-slate-900 text-slate-300 p-4 rounded-xl border border-slate-800 relative shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="text-[10px] font-mono font-bold uppercase text-slate-500">SQL Schema & Storage Policies Setup</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getSupabaseSQLScript());
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white font-sans text-[10px] font-bold rounded-lg transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy SQL Script'}</span>
                  </button>
                </div>
                <pre className="font-mono text-[10px] overflow-x-auto max-h-60 text-slate-400 leading-normal select-all">
                  {getSupabaseSQLScript()}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main operational notifications banner */}
      {notification && (
        <div id="global-success-banner" className="bg-emerald-700 text-white p-3 shadow-md shrink-0">
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-2 text-xs font-mono">
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
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-400 font-mono">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>SYSTEM STATUS: ONLINE</span>
                <span className="text-slate-650">|</span>
                <span>OJS v3.4 COMPATIBLE</span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <button 
                  onClick={() => {
                    setAuthRole('EDITOR');
                    setAuthMode('LOGIN');
                    setCurrentScreen('AUTH');
                  }}
                  className="hover:text-white transition cursor-pointer font-bold font-mono text-[10px] uppercase"
                >
                  Editor Log In
                </button>
                <span>•</span>
                <button 
                  onClick={() => {
                    setAuthRole('REVIEWER');
                    setAuthMode('LOGIN');
                    setCurrentScreen('AUTH');
                  }}
                  className="hover:text-white transition cursor-pointer font-bold font-mono text-[10px] uppercase"
                >
                  Reviewer Log In
                </button>
              </div>
            </div>
          </div>

          {/* Main Navigation Header */}
          <header className="bg-white border-b border-[#e2e8f0] px-4 sm:px-6 py-4 shadow-xs sticky top-0 z-50">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TuliticsLogo iconSize={32} showText={true} textColorClass="text-[#155e42]" subTitle="SPECIALIZED SUBMISSION PORTAL" usePng={true} />
              </div>

              <div className="flex items-center gap-3">
                <button
                  id="btn-nav-sign-in"
                  onClick={() => {
                    setAuthRole('AUTHOR');
                    setAuthMode('LOGIN');
                    setCurrentScreen('AUTH');
                  }}
                  className="px-4 py-2 border border-[#cbd8df] text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm"
                >
                  Sign In to Tracker
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
                  Register Account
                </button>
              </div>
            </div>
          </header>

          {/* Main Wizard Area */}
          <div className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
            <NewSubmissionFlow
              currentUser={loggedInUser}
              onCancel={() => {
                if (loggedInUser) {
                  setCurrentScreen('WORKSPACE');
                } else {
                  if (confirm("Reset current draft progress?")) {
                    localStorage.removeItem('ojs_submission_cached_draft');
                    window.location.reload();
                  }
                }
              }}
              onSubmit={(paperObj) => {
                const primaryContact = paperObj.contributors?.find((c: any) => c.isPrincipalContact) || paperObj.contributors?.[0];
                const authorName = primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}` : "Dr. Ada Lovelace";
                const authorEmail = primaryContact ? primaryContact.email : "author@stanford.edu";

                const parentManuscript: Manuscript = {
                  id: `OJS-${paperObj.id}`,
                  title: paperObj.title,
                  abstract: paperObj.abstract,
                  references: "",
                  isDoubleBlind: true,
                  coverLetter: paperObj.coverLetter || "Confidential Cover Letter.",
                  fileName: paperObj.fileName || paperObj.uploadedFileNames?.[0] || 'manuscript_submission.pdf',
                  fileSize: paperObj.fileSize || "2.4 MB",
                  uploadedAt: new Date().toISOString(),
                  storagePath: paperObj.storagePath || null,
                  publicUrl: paperObj.publicUrl || null,
                  contributors: (paperObj.contributors || []).map((c: any) => ({
                    id: c.id,
                    name: `${c.firstName} ${c.lastName}`,
                    email: c.email,
                    affiliation: c.affiliation,
                    role: c.role
                  })),
                  status: 'SUBMITTED',
                  submittedAt: new Date().toISOString(),
                  reviewers: [],
                  suggestedReviewers: (paperObj.reviewerSuggestions || []).map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    email: r.email,
                    approved: false
                  })),
                  discussions: [],
                  doi: null,
                  volume: null,
                  issue: null,
                  publishedAt: null,
                  authorId: loggedInUser ? "auth_ada" : `guest_${paperObj.id}`,
                  authorName: authorName,
                  authorEmail: authorEmail,
                  submissionStep: 9,
                  editorsNotes: ""
                };

                handleSaveDraftManuscript(parentManuscript);
                
                if (!loggedInUser) {
                  const newUser = {
                    name: authorName,
                    email: authorEmail,
                    role: 'AUTHOR' as Role
                  };
                  setLoggedInUser(newUser);
                  setActiveRole('AUTHOR');
                }

                setNotification(`SUCCESS: Manuscript "${paperObj.title}" successfully dispatched to the peer review queue.`);
                setTimeout(() => {
                  setNotification('');
                  setCurrentScreen('WORKSPACE');
                }, 4000);
              }}
            />
          </div>
        </div>
      )}

      {currentScreen === 'AUTH' && (
        <AuthPortals
          activeRole={authRole}
          initialMode={authMode}
          onBackToLanding={() => {
            window.location.href = 'https://tulitics.vercel.app/';
          }}
          onSuccessAuth={(user) => {
            setLoggedInUser(user);
            setActiveRole(user.role);
            setCurrentScreen('WORKSPACE');
            setNotification(`Successfully logged in as ${user.name}`);
            setTimeout(() => setNotification(''), 4000);
          }}
        />
      )}

      {currentScreen === 'WORKSPACE' && (
        <div className="flex-grow flex flex-col">
          {/* Dynamic Role Multi-Tenant Persona Simulator Selector */}
          {activeRole !== 'AUTHOR' && (
            <RoleSelector
              activeRole={activeRole}
              onRoleChange={handleRoleChange}
              unassignedCount={unassignedCount}
              inReviewCount={inReviewCount}
              inProductionCount={inProductionCount}
              loggedInRole={loggedInUser?.role}
              loggedInUser={loggedInUser}
              onSignOut={handleSignOut}
            />
          )}

          <main id="jms-workspace-main" className="flex-grow">
            <div className="animate-fade-in duration-300">
              
              {activeRole === 'AUTHOR' && (
                <AuthorWorkspace
                  manuscripts={manuscripts}
                  onSaveManuscript={handleSaveDraftManuscript}
                  onSubmitManuscript={handleSubmitManuscript}
                  currentUser={loggedInUser}
                  onSignOut={handleSignOut}
                  onRoleChange={handleRoleChange}
                />
              )}

              {activeRole === 'EDITOR' && (
                <EditorWorkspace
                  manuscripts={manuscripts}
                  onUpdateManuscript={handleUpdateManuscript}
                  currentUser={loggedInUser}
                />
              )}

              {activeRole === 'REVIEWER' && (
                <ReviewerWorkspace
                  manuscripts={manuscripts}
                  onUpdateManuscript={handleUpdateManuscript}
                  currentUser={loggedInUser}
                />
              )}

              {activeRole === 'PUBLISHER' && (
                <PublisherWorkspace
                  manuscripts={manuscripts}
                  onUpdateManuscript={handleUpdateManuscript}
                  currentUser={loggedInUser}
                />
              )}

              {activeRole === 'ARCHITECT' && <ArchitectWorkspace />}

              {activeRole === 'COORDINATOR' && (
                <CoordinatorWorkspace
                  manuscripts={manuscripts}
                  onUpdateManuscript={handleUpdateManuscript}
                />
              )}

            </div>
          </main>
        </div>
      )}

      {/* Static premium workspace info footer */}
      <footer id="jms-platform-footer" className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 px-6 shrink-0 text-left">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] font-mono">
            <div className="space-y-1">
              <p className="font-bold text-white uppercase tracking-wider text-xs">
                Journal of Artificial Intelligence in Medicine & Public Health
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-1.5">
                <p className="text-slate-400">
                  JMS™ Specialized OJS-Style Multi-Tenant Enterprise System
                </p>
                <div className="bg-slate-950 p-1 px-2 rounded-lg border border-slate-850 shrink-0 w-fit self-start sm:self-auto">
                  <TuliticsLogo iconSize={18} showText={false} usePng={true} />
                </div>
              </div>
            </div>
            <p className="text-slate-500 text-right">© {new Date().getFullYear()} JMS. All rights reserved.</p>
          </div>
        </footer>

    </div>
  );
}
