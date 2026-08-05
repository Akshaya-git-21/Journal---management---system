import { Role } from '../types';
import TuliticsLogo from './TuliticsLogo';
import {
  Shield,
  FileText,
  CheckSquare,
  Settings,
  Users,
  LogOut,
  Sun,
  Bell,
  ChevronDown,
  Search,
  Mail
} from 'lucide-react';

interface RoleSelectorProps {
  activeRole: Role;
  unassignedCount: number;
  inReviewCount: number;
  inProductionCount: number;
  loggedInUser?: { name: string; email: string; role: Role } | null;
  onSignOut?: () => void;
}

export default function RoleSelector({
  activeRole,
  unassignedCount,
  inReviewCount,
  inProductionCount,
  loggedInUser,
  onSignOut,
}: RoleSelectorProps) {
  const roles: { val: Role; label: string; icon: any; color: string; desc: string; user: string }[] = [
    {
      val: 'AUTHOR',
      label: 'Author',
      icon: FileText,
      color: 'text-emerald-750 text-emerald-700 bg-emerald-50/80 border-emerald-200/60',
      desc: 'Create, update drafts, submit manuscripts, manage co-authors.',
      user: 'ada@computing.org'
    },
    {
      val: 'EDITOR',
      label: 'Editor',
      icon: Shield,
      color: 'text-green-800 bg-green-50/80 border-green-200/60',
      desc: 'Orchestrate reviewers, access cover letters, override thresholds, decide gates.',
      user: 'chief-editor@jms-journal.org'
    },
    {
      val: 'REVIEWER',
      label: 'Reviewer',
      icon: CheckSquare,
      color: 'text-emerald-800 bg-emerald-50 border-emerald-150',
      desc: 'Evaluate double-blind anonymized text, record recommendation reviews.',
      user: 'hamming@error-correction.net'
    },
    {
      val: 'PUBLISHER',
      label: 'Publisher',
      icon: Settings,
      color: 'text-teal-700 bg-teal-50 border-teal-150',
      desc: 'Galley file ingestion, DOI registration pipelines, production volume binding.',
      user: 'publisher-service@jms-press.org'
    },
    {
      val: 'COORDINATOR',
      label: 'Coordinator',
      icon: Users,
      color: 'text-black bg-white border-black',
      desc: 'High-contrast admin console for editorial oversight and threshold gates.',
      user: 'coordinator-triage@jms-journal.org'
    }
  ];

  const activeRoleInfo = roles.find(r => r.val === activeRole);

  if (activeRole === 'COORDINATOR') {
    return (
      <div id="jms-role-selector-container" className="sticky top-0 z-50 flex flex-col select-none">
        {/* 1. MAIN DARK GREEN NAVIGATION HEADER */}
        <div className="bg-[#002818] border-b border-[#001f12] text-white py-2 px-6 shadow-md text-left">
          <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 flex items-center justify-between gap-4">
            
            {/* Left: Brand Identity with Custom Logo */}
            <div className="shrink-0">
              <TuliticsLogo iconSize={36} showText={true} textColorClass="text-white" subTitle="JMS CORE v3.5 • COORDINATOR GATES" usePng={true} />
            </div>

            {/* Middle Search Bar matching mockup */}
            <div className="hidden md:flex items-center relative w-96 max-w-lg mx-4">
              <Search className="w-3.5 h-3.5 text-emerald-100/40 absolute left-3" />
              <input 
                type="text" 
                placeholder="Search manuscripts, authors, reviewers..." 
                className="w-full bg-[#001c10] text-[11px] text-white placeholder-emerald-100/35 border border-[#003c23] pl-9 pr-10 py-1.5 rounded-lg focus:outline-none focus:border-[#10b981] transition font-sans font-semibold"
              />
              <span className="absolute right-3 text-[9px] font-mono font-bold text-emerald-100/30">⌘ K</span>
            </div>

            {/* Right-side Utilities & Profile */}
            <div className="flex items-center gap-4 shrink-0">
              
              {/* Coordinator active capsule */}
              <div className="hidden lg:flex items-center gap-2 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full select-none text-[10px] font-black text-emerald-350 tracking-wider uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                COORDINATOR SESSION ACTIVE
              </div>

              {/* Sun icon toggler */}
              <button className="p-1.5 text-emerald-100/70 hover:text-white hover:bg-white/5 rounded-lg transition" title="Light theme enabled">
                <Sun className="w-4 h-4" />
              </button>

              {/* Bell with badge count '5' */}
              <div className="relative cursor-pointer hover:bg-white/5 p-1.5 rounded-lg transition">
                <Bell className="w-4 h-4 text-emerald-100/80" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white font-sans text-[8px] font-black flex items-center justify-center rounded-full leading-none border border-[#002818]">
                  5
                </span>
              </div>

              {/* Mail with badge count '8' */}
              <div className="relative cursor-pointer hover:bg-white/5 p-1.5 rounded-lg transition">
                <Mail className="w-4 h-4 text-emerald-100/80" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white font-sans text-[8px] font-black flex items-center justify-center rounded-full leading-none border border-[#002818]">
                  8
                </span>
              </div>

              {/* Separator */}
              <span className="h-6 w-[1px] bg-emerald-800/40 hidden sm:block" />

              {/* Profile card dropdown */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-black flex items-center justify-center text-xs select-none shadow-md border border-emerald-400">
                  {(loggedInUser?.name || 'C').charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col text-left leading-none">
                  <span className="text-[11px] font-black text-white font-sans">{loggedInUser?.name || 'Coordinator'}</span>
                  <span className="text-[10px] text-emerald-200/60 font-bold mt-1">Active User</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-emerald-200/50" />
              </div>

            </div>

          </div>
        </div>

        {/* 2. SECONDARY CONTEXT & TELEMETRY STRIP */}
        <div className="bg-white border-b border-slate-200 px-6 py-2.5 text-left">
          <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">

            {/* Session Persona Status */}
            <div className="flex items-center gap-2 flex-wrap text-left justify-center md:justify-start">
              <span className="font-sans text-[11px] font-semibold text-slate-600">
                Signed in as <strong className="text-slate-900 font-mono text-[11px] font-black">{loggedInUser?.email || 'coordinator'}</strong>
              </span>

              <span className="flex items-center gap-1 bg-[#fef7e0] text-[#b06000] border border-[#fde8c3] px-2 py-0.5 rounded text-[10px] font-black leading-none select-none tracking-wide uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff8f00] animate-pulse"></span>
                STRICT WORKFLOW LOCK
              </span>
            </div>
   
            {/* Access Scope Info / Description - Inline & Sleek */}
            <div className="hidden lg:flex items-center gap-1.5 text-slate-400 font-semibold shrink-0 text-[11px]">
              <span className="font-sans font-medium text-slate-500 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-slate-450" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Scope: High-contrast admin console for editorial oversight and threshold gates.
              </span>
            </div>

            {/* Database live metric pills */}
            <div className="flex items-center gap-2 font-sans text-[11px] select-none shrink-0 font-bold">
              <span className="flex items-center gap-1.5 bg-[#e8f0fe] px-3 py-1 rounded-full border border-[#d2e3fc] text-[#1967d2] transition leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1967d2]"></span>
                Unassigned: <strong className="text-[#1967d2] font-black">{unassignedCount}</strong>
              </span>
              <span className="flex items-center gap-1.5 bg-[#fef7e0] px-3 py-1 rounded-full border border-[#fde8c3] text-[#b06000] transition leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff8f00]"></span>
                Reviewing: <strong className="text-[#b06000] font-black">{inReviewCount}</strong>
              </span>
              <span className="flex items-center gap-1.5 bg-[#e8f6f0] px-3 py-1 rounded-full border border-[#a3cfbb] text-[#008751] transition leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#008751]"></span>
                Production: <strong className="text-[#008751] font-black">{inProductionCount}</strong>
              </span>
              
              {/* Logout button */}
              <button onClick={onSignOut} className="flex items-center gap-1.5 text-red-600 hover:text-red-700 font-sans text-[11px] font-black cursor-pointer transition p-1.5 border border-red-200 hover:border-red-300 rounded-lg bg-white px-3 leading-none shadow-xs">
                <LogOut className="w-3 h-3 text-red-600" />
                <span>Log Out</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="jms-role-selector-container" className="bg-[#f8fafc]/50 border-b border-gray-150 sticky top-0 z-50 backdrop-blur-sm">
      
      {/* 1. MAIN NAVIGATION HEADER */}
      <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-8 lg:px-10 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Brand & Identity */}
        <div className="shrink-0">
          <TuliticsLogo iconSize={36} showText={true} textColorClass="text-[#155e42]" subTitle="JMS CORE v3.5 • SPECIALIZED REVIEWS" usePng={true} />
        </div>

        {/* Middle Badge: EDITOR SESSION ACTIVE */}
        {activeRole === 'EDITOR' && (
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-1.5 bg-[#e6f4ea] border border-[#a3cfbb] px-3.5 py-1 rounded-full select-none text-[11px] font-extrabold text-[#137333] tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-[#198754] animate-pulse"></span>
              EDITOR SESSION ACTIVE
            </div>
          </div>
        )}

        {/* Signed-in user & sign-out */}
        <div className="flex items-center gap-4 self-end md:self-auto ml-auto">
          <div className="flex items-center gap-3">
            {loggedInUser ? (
              <div className="flex items-center gap-3">
                <div className="text-right flex flex-col justify-center leading-tight">
                  <span className="text-[10px] font-bold text-slate-400">Active User</span>
                  <span className="text-[11px] font-extrabold text-slate-600 font-mono mt-0.5">{loggedInUser.email}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 uppercase font-mono select-none">
                  {loggedInUser.name.charAt(0)}
                </div>
                <span className="h-4 w-[1px] bg-slate-200" />
                <button onClick={onSignOut} className="flex items-center gap-1 text-red-600 font-sans text-xs font-bold transition-colors p-1">
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black">Log Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={onSignOut} className="flex items-center gap-1 text-red-600 font-sans text-xs font-bold transition-colors p-1">
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black">Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. SECONDARY CONTEXT & TELEMETRY STRIP */}
      <div className="bg-[#fcfdfe] border-t border-gray-150 px-6 py-2.5">
        <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs md:text-sm text-slate-500">
          
          {/* Session Persona Status */}
          <div className="flex items-center gap-2 flex-wrap text-left justify-center md:justify-start">
            <span className="font-sans text-xs md:text-sm font-bold text-slate-600">
              Signed in as <strong className="text-slate-800 font-mono text-xs md:text-sm font-extrabold">{loggedInUser?.email || activeRoleInfo?.user}</strong>
            </span>

            <span className="flex items-center gap-1 bg-[#fff3cd] text-[#664d03] border border-[#ffecb5] px-2 py-0.5 rounded-[5px] text-xs font-extrabold leading-none select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-[#664d03] animate-pulse"></span>
              strict workflow lock
            </span>
          </div>
 
          {/* Access Scope Info / Description - Inline & Sleek */}
          <div className="hidden lg:flex items-center gap-1.5 text-slate-450 italic shrink-0 text-xs">
            <span className="text-slate-400 animate-pulse">🕒</span>
            <span className="font-sans font-medium text-slate-500">Scope: {activeRoleInfo?.desc || 'Orchestrate reviewers, access cover letters, override thresholds, decide gates.'}</span>
          </div>

          {/* Database live metric pills */}
          <div className="flex items-center gap-2 font-mono text-xs select-none shrink-0 font-bold">
            <span className="flex items-center gap-1.5 bg-[#f8fafc] px-2.5 py-1 rounded-lg border border-slate-250 hover:bg-slate-50 transition shadow-tiny text-slate-600 leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Unassigned: <strong className="text-slate-800">{unassignedCount}</strong>
            </span>
            <span className="flex items-center gap-1.5 bg-[#fef5e7] px-2.5 py-1 rounded-lg border border-[#f5c6cb] text-amber-800 hover:bg-[#fffcf8] transition shadow-tiny leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Reviewing: <strong className="text-[#a05a00] font-bold">{inReviewCount}</strong>
            </span>
            <span className="flex items-center gap-1.5 bg-[#e8f6f0] px-2.5 py-1 rounded-lg border border-[#a3cfbb] text-emerald-800 hover:bg-[#f3faf7] transition shadow-tiny leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Production: <strong className="text-[#146c43] font-bold">{inProductionCount}</strong>
            </span>
          </div>

        </div>
      </div>

    </div>
  );
}
