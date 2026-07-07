/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Role, Manuscript } from './types';
import { INITIAL_MANUSCRIPTS } from './initialData';
import RoleSelector from './components/RoleSelector';
import AuthorWorkspace from './components/AuthorWorkspace';
import EditorWorkspace from './components/EditorWorkspace';
import ReviewerWorkspace from './components/ReviewerWorkspace';
import PublisherWorkspace from './components/PublisherWorkspace';
import ArchitectWorkspace from './components/ArchitectWorkspace';
import CoordinatorWorkspace from './components/CoordinatorWorkspace';
import LandingPage from './components/LandingPage';
import AuthPortals from './components/AuthPortals';
import { CheckCircle2, LogOut, Info, Layers, BookOpen, User, AlertTriangle, Check, Copy } from 'lucide-react';
import { 
  supabase, 
  checkSupabaseConnection, 
  getManuscriptsFromDb, 
  upsertManuscriptToDb, 
  getSupabaseSQLScript 
} from './lib/supabase';

export default function App() {
  // Screen routing state: 'LANDING' | 'AUTH' | 'WORKSPACE'
  const [currentScreen, setCurrentScreen] = useState<'LANDING' | 'AUTH' | 'WORKSPACE'>(() => {
    const saved = localStorage.getItem('jms_sim_current_screen');
    return (saved as 'LANDING' | 'AUTH' | 'WORKSPACE') || 'LANDING';
  });

  // Authentication specific roles & modes
  const [authRole, setAuthRole] = useState<Role>(() => {
    const saved = localStorage.getItem('jms_sim_active_role');
    return (saved as Role) || 'AUTHOR';
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
    setCurrentScreen('LANDING');
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
      {currentScreen === 'LANDING' && (
        <LandingPage
          manuscripts={manuscripts}
          onSubmitClick={() => {
            setAuthRole('AUTHOR');
            setAuthMode('REGISTER');
            setCurrentScreen('AUTH');
          }}
          onLoginClick={(role, mode) => {
            setAuthRole(role);
            setAuthMode(mode);
            setCurrentScreen('AUTH');
          }}
        />
      )}

      {currentScreen === 'AUTH' && (
        <AuthPortals
          activeRole={authRole}
          initialMode={authMode}
          onBackToLanding={() => setCurrentScreen('LANDING')}
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
      {currentScreen !== 'LANDING' && (
        <footer id="jms-platform-footer" className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 px-6 shrink-0 text-left">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] font-mono">
            <div className="space-y-1">
              <p className="font-bold text-white uppercase tracking-wider text-xs">
                Journal of Artificial Intelligence in Medicine & Public Health
              </p>
              <p className="text-slate-400 mt-1">
                JMS™ Specialized OJS-Style Multi-Tenant Enterprise System • Designed and Built for <strong className="text-slate-200">TULITICS</strong>
              </p>
            </div>
            <p className="text-slate-500 text-right">© {new Date().getFullYear()} TULITICS. All rights reserved.</p>
          </div>
        </footer>
      )}

    </div>
  );
}
