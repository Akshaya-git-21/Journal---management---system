import React, { useState } from 'react';
import { Manuscript } from '../types';
import TuliticsLogo from './TuliticsLogo';
import {
  BookOpen,
  FileText,
  Bookmark,
  Users,
  Compass,
  Megaphone,
  Mail,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Search,
  Globe,
  ChevronDown,
  Sparkles,
  Lock,
  ArrowRightLeft,
  Activity,
  CheckCircle,
  FileCheck2,
  Calendar,
  MessageSquare,
  Facebook,
  Twitter,
  Youtube,
  Instagram,
  Linkedin,
  Clock
} from 'lucide-react';

interface LandingPageProps {
  manuscripts: Manuscript[];
  onSubmitClick: () => void;
  onLoginClick: (role: 'AUTHOR' | 'REVIEWER' | 'EDITOR' | 'PUBLISHER' | 'COORDINATOR', mode: 'LOGIN' | 'REGISTER') => void;
}

export default function LandingPage({ manuscripts, onSubmitClick, onLoginClick }: LandingPageProps) {
  // Navigation active tab for Join section
  const [activeJoinTab, setActiveJoinTab] = useState<'BOARD' | 'PARTNERS' | 'REVIEWER'>('PARTNERS');
  
  // Simulated announcements
  const announcements = [
    {
      date: 'June 09, 2026',
      tag: 'Special Issue',
      title: 'Neural Diagnosis Patterns in Pediatric Oncology: Cross-Validation Scales',
      desc: 'Inviting manuscripts focusing on multi-modal computer vision and transformer diagnostics on cellular biopsy slices.'
    },
    {
      date: 'May 28, 2026',
      tag: 'Publishing Integrity',
      title: 'Ethics and Patient Data Sovereignty in Large Medical Models',
      desc: 'Exploring multi-tenant secure databases, differential privacy constraints, and zero-knowledge medical auditing.'
    }
  ];

  // Selected sub-sections dropdown states
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Filter published manuscripts to showcase under Issues
  const publishedArticles = manuscripts.filter((m) => m.status === 'PUBLISHED');

  return (
    <div id="jms-public-landing-container" className="bg-[#fcfdfd] min-h-screen flex flex-col font-sans text-left">
      
      {/* 2. MAIN WHITE NAVIGATION HEADER BAR */}
      <header className="border-b border-gray-150/80 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col lg:flex-row items-center justify-between gap-6">
          
          {/* Logo / Title Area */}
          <div className="cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <TuliticsLogo iconSize="lg" showText={true} textColorClass="text-[#155e42]" usePng={true} />
          </div>

          {/* Nav Items */}
          <div className="flex flex-wrap items-center gap-6 text-sm sm:text-[15px] text-slate-600 font-bold font-sans">
            
            <div className="relative group">
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'about' ? null : 'about')}
                className="hover:text-[#008751] flex items-center gap-1 py-0.5 transition-colors"
              >
                About <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-[#008751]" />
              </button>
              {activeDropdown === 'about' && (
                <div className="absolute left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-52 text-xs sm:text-sm space-y-2 z-50 animate-fade-in">
                  <a href="#aim-scope" onClick={() => setActiveDropdown(null)} className="block p-2 hover:bg-slate-50 hover:text-[#008751] font-bold rounded-lg transition-colors">Aim & Scope</a>
                  <a href="#aim-scope" onClick={() => { setActiveDropdown(null); setActiveJoinTab('BOARD'); }} className="block p-2 hover:bg-slate-50 hover:text-[#008751] font-bold rounded-lg transition-colors">Editorial Board</a>
                </div>
              )}
            </div>

            <div className="relative group">
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'policies' ? null : 'policies')}
                className="hover:text-[#008751] flex items-center gap-1 py-0.5 transition-colors"
              >
                Editorial Policies <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-[#008751]" />
              </button>
              {activeDropdown === 'policies' && (
                <div className="absolute left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-64 text-xs sm:text-sm space-y-2 z-50 animate-fade-in">
                  <a href="#aim-scope" onClick={() => setActiveDropdown(null)} className="block p-2 hover:bg-slate-50 hover:text-[#008751] font-bold rounded-lg transition-colors">Double-Blind Review Model</a>
                  <a href="#aim-scope" onClick={() => setActiveDropdown(null)} className="block p-2 hover:bg-slate-50 hover:text-[#008751] font-bold rounded-lg transition-colors">Ethics & COI Disclosures</a>
                </div>
              )}
            </div>

            <a href="#aim-scope" className="hover:text--[#008751] py-0.5 transition-colors">Information For</a>
            
            <a href="#aim-scope" className="hover:text--[#008751] py-0.5 transition-colors">Resources</a>

            <button
              onClick={onSubmitClick}
              className="bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              Submit Your Article <ExternalLink className="w-4 h-4" />
            </button>

            <button 
              className="p-2 text-slate-400 hover:text-[#008751] hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              onClick={() => alert("Index search initialized.")}
            >
              <Search className="w-4 h-4" />
            </button>

          </div>

        </div>
      </header>

      {/* 2.5 HERO SECTION: MAIN CALLOUT - SUBMIT YOUR MANUSCRIPT (Polished, professional sizing) */}
      <section className="bg-gradient-to-br from-[#eaf6f0] via-[#f4faf7] to-[#ffffff] text-slate-800 py-16 sm:py-20 lg:py-24 px-6 border-b border-slate-100 text-left relative overflow-hidden animate-fade-in">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-[0.06] pointer-events-none" />
        <div className="absolute -left-36 -top-36 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          
          {/* Hero text (Left Side) */}
          <div className="lg:col-span-7 flex flex-col items-start space-y-6">
            
            <span className="bg-white border border-[#bbf7d0] text-[#155e42] font-mono font-black tracking-widest uppercase text-xs px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5">
              🌱 OPEN ACCESS | PEER-REVIEWED | GLOBAL IMPACT
            </span>

            <h2 className="text-4xl sm:text-5xl lg:text-[52px] font-serif font-black tracking-tight text-slate-900 leading-[1.125] max-w-2xl text-left">
              Journal of Artificial <br className="hidden md:inline" />
              Intelligence in Medicine & <br />
              <span className="text-[#155e42] block md:inline font-bold">Public Health</span>
            </h2>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl font-medium">
              Advancing responsible AI innovations that improve human health, empower communities, and shape the future of medicine and public health.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto pt-2">
              <button
                onClick={onSubmitClick}
                className="bg-[#008751] hover:bg-[#007043] text-white font-bold text-sm px-6 py-3.5 rounded-lg tracking-normal transition-all duration-150 shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                Submit Your Article <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onLoginClick('AUTHOR', 'LOGIN')}
                className="bg-white hover:bg-slate-50/50 text-[#008751] border border-[#008751] font-bold text-sm px-6 py-3.5 rounded-lg transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
              >
                Track Active Papers <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>

          {/* Hero Visual Mockup (Right Side - Composable 3D CSS visual) */}
          <div className="lg:col-span-5 relative w-full h-[380px] sm:h-[420px] mx-auto flex items-center justify-center select-none">
            {/* Ambient neon green backing glow */}
            <div className="absolute w-72 h-72 bg-emerald-400/10 rounded-full blur-3xl -z-10 pointer-events-none animate-pulse" />
            
            {/* The Pedestal (3D stage at the bottom) */}
            <div className="absolute bottom-4 w-72 h-14 bg-white border border-[#e2e8f0] rounded-[50%] shadow-[0_15px_35px_rgba(4,120,87,0.08)] flex items-center justify-center z-10 overflow-hidden">
              <div className="w-[96%] h-[92%] rounded-[50%] bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-center shadow-inner">
                <div className="w-[84%] h-[84%] rounded-[50%] bg-gradient-to-b from-[#e6f4ea] to-[#ffffff] border border-dashed border-[#86efac]" />
              </div>
            </div>

            {/* Glowing Green 3D Earth Globe sitting on the pedestal */}
            <div className="absolute bottom-[38px] w-36 h-36 rounded-full bg-gradient-to-tr from-[#008751] via-[#10b981] to-[#34d399] shadow-[0_10px_35px_rgba(16,185,129,0.25)] border border-emerald-300 flex items-center justify-center z-20 overflow-hidden animate-bounce" style={{ animationDuration: '6s' }}>
              {/* Globe Grid Gridlines Overlay */}
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1.2px,transparent_1.2px)] [background-size:12px_12px]" />
              <div className="absolute w-[80%] h-[60%] rounded-[50%] bg-white/20 blur-[1px] rotate-12 -top-2 -left-2" />
              <div className="absolute w-[40%] h-[40%] rounded-[50%] bg-white/20 blur-[1px] rotate-45 bottom-4 right-2" />
              <div className="absolute inset-0 rounded-full shadow-[inset_0_4px_16px_rgba(255,255,255,0.4)]" />
            </div>

            {/* Orbiting rings */}
            <div className="absolute bottom-[36px] w-[210px] h-11 border-[2.5px] border-emerald-400/30 rounded-[50%] rotate-12 -translate-y-8 z-15 pointer-events-none" />
            <div className="absolute bottom-[36px] w-[230px] h-12 border border-emerald-300/15 rounded-[50%] -rotate-12 -translate-y-4 z-15 pointer-events-none" />

            {/* Left Plate: AI Screen Tablet */}
            <div className="absolute left-0 top-4 w-44 h-64 bg-white/75 border border-white/90 backdrop-blur-md rounded-2xl p-4.5 shadow-lg shadow-slate-100/50 z-30 transition-all duration-300 hover:-translate-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-sans font-black text-xl text-[#008751] tracking-wide">AI</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              
              {/* Neural network wireframe (SVG) */}
              <svg className="w-full h-32 text-[#a7f3d0]" viewBox="0 0 100 80" fill="none" stroke="currentColor">
                <line x1="20" y1="20" x2="50" y2="10" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="20" y1="20" x2="40" y2="40" strokeWidth="1" />
                <line x1="50" y1="10" x2="80" y2="30" strokeWidth="1.5" />
                <line x1="40" y1="40" x2="80" y2="30" strokeWidth="1" strokeDasharray="3 1" />
                <line x1="40" y1="40" x2="60" y2="70" strokeWidth="1.5" />
                <line x1="80" y1="30" x2="60" y2="70" strokeWidth="1" />
                <line x1="20" y1="50" x2="40" y2="40" strokeWidth="1" />
                
                <circle cx="20" cy="20" r="4.5" fill="#008751" />
                <circle cx="50" cy="10" r="3.5" fill="#34d399" />
                <circle cx="80" cy="30" r="5" fill="#059669" />
                <circle cx="40" cy="40" r="4.5" fill="#10b981" />
                <circle cx="60" cy="70" r="3.5" fill="#008751" />
                <circle cx="20" cy="50" r="3" fill="#6ee7b7" />
              </svg>

              <div className="space-y-1.5">
                <div className="w-full h-1.5 bg-slate-100 rounded" />
                <div className="w-[80%] h-1.5 bg-slate-100 rounded" />
              </div>
            </div>

            {/* Right Plate: Telemetry Heart Rate screen */}
            <div className="absolute right-0 top-16 w-40 h-48 bg-white/85 border border-white backdrop-blur-md rounded-2xl p-4 shadow-lg shadow-slate-100/50 z-25 transition-all duration-300 hover:scale-105 flex flex-col justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 font-mono leading-none">BPM METRIC</span>
                  <span className="block text-xs font-black text-slate-800 mt-1">Cardiac Wave</span>
                </div>
              </div>

              {/* ECG heart wave line */}
              <div className="h-16 w-full bg-slate-50/50 rounded-xl p-2 border border-slate-100 overflow-hidden flex items-center">
                <svg className="w-full h-full text-emerald-500 stroke-[2.2]" viewBox="0 0 100 40" fill="none">
                  <path d="M0,20 L30,20 L35,10 L40,30 L45,20 L50,20 L53,5 L58,35 L62,20 L68,20 L73,20 L100,20" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div className="flex items-center justify-between font-mono text-xs font-bold text-slate-400 leading-none">
                <span>REF 0928</span>
                <span className="text-[#155e42] animate-pulse">● LIVE</span>
              </div>
            </div>

            {/* Floating mini glass orbs */}
            <div className="absolute top-1/4 right-36 w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-200 to-white/90 shadow-md border border-white/50 animate-bounce" style={{ animationDuration: '4s' }} />
            <div className="absolute bottom-1/4 left-1/3 w-4.5 h-4.5 rounded-full bg-gradient-to-tr from-emerald-300 to-white/95 shadow-xs border border-white/50 animate-bounce" style={{ animationDuration: '3.5s' }} />
          </div>

        </div>
      </section>

      {/* FLOATING METRICS BAR (AUTHENTIC MOCKUP MATCH) */}
      <div className="max-w-7xl mx-auto px-6 relative z-20 w-full">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_15px_40px_rgba(30,41,59,0.04)] grid grid-cols-2 md:grid-cols-5 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100 -mt-10">
          
          {/* Metric 1 */}
          <div className="flex items-center gap-3.5 pt-4 md:pt-0">
            <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shrink-0 shadow-xs">
              <FileText className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="block text-xl font-black text-slate-900 leading-none">2,450+</span>
              <span className="block text-xs text-slate-500 font-bold mt-1.5 uppercase tracking-wider font-mono">Articles Published</span>
            </div>
          </div>

          {/* Metric 2 */}
          <div className="flex items-center gap-3.5 pt-4 md:pt-0 md:pl-6">
            <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shrink-0 shadow-xs">
              <Globe className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="block text-xl font-black text-slate-900 leading-none">98+</span>
              <span className="block text-xs text-slate-500 font-bold mt-1.5 uppercase tracking-wider font-mono">Countries Reached</span>
            </div>
          </div>

          {/* Metric 3 */}
          <div className="flex items-center gap-3.5 pt-4 md:pt-0 md:pl-6">
            <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shrink-0 shadow-xs">
              <Activity className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="block text-xl font-black text-slate-900 leading-none">15.3</span>
              <span className="block text-xs text-slate-500 font-bold mt-1.5 uppercase tracking-wider font-mono">CiteScore 2024</span>
            </div>
          </div>

          {/* Metric 4 */}
          <div className="flex items-center gap-3.5 pt-4 md:pt-0 md:pl-6">
            <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shrink-0 shadow-xs">
              <Clock className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="block text-xl font-black text-slate-900 leading-none">3 Days</span>
              <span className="block text-xs text-slate-500 font-bold mt-1.5 uppercase tracking-wider font-mono">Avg. First Decision</span>
            </div>
          </div>

          {/* Metric 5 */}
          <div className="flex items-center gap-3.5 pt-4 md:pt-0 md:pl-6">
            <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shrink-0 shadow-xs">
              <Lock className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="block text-xl font-black text-slate-900 leading-none">100%</span>
              <span className="block text-xs text-slate-500 font-bold mt-1.5 uppercase tracking-wider font-mono">Open Access</span>
            </div>
          </div>

        </div>
      </div>

      {/* CORE PILLARS SECTION */}
      <section className="bg-[#fcfdfd] py-16 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          
          <div className="text-center space-y-3">
            <h3 className="font-serif font-black text-3xl sm:text-4xl text-slate-900 tracking-tight">
              Built for Authors. Driven by Integrity.
            </h3>
            <p className="text-slate-500 text-sm sm:text-base max-w-2xl mx-auto font-medium leading-relaxed">
              Our advanced publishing platform ensures a transparent, efficient, and author-friendly experience from submission to publication.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Pillar 1 */}
            <div className="bg-white border border-slate-100 p-6 sm:p-7 rounded-2xl space-y-4 hover:shadow-lg hover:shadow-slate-100/30 transition-all duration-200 text-left">
              <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shadow-xs">
                <CheckCircle className="w-5.5 h-5.5 stroke-[2px]" />
              </div>
              <h4 className="font-sans font-extrabold text-slate-900 text-base">Rigorous Peer Review</h4>
              <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                Double-blind review by leading experts to ensure research quality and credibility.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="bg-white border border-slate-100 p-6 sm:p-7 rounded-2xl space-y-4 hover:shadow-lg hover:shadow-slate-100/30 transition-all duration-200 text-left">
              <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shadow-xs">
                <Sparkles className="w-5.5 h-5.5" />
              </div>
              <h4 className="font-sans font-bold text-slate-900 text-base">Faster Publishing</h4>
              <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                Streamlined workflows and AI assistance for efficient editorial and review processes.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="bg-white border border-slate-100 p-6 sm:p-7 rounded-2xl space-y-4 hover:shadow-lg hover:shadow-slate-100/30 transition-all duration-200 text-left">
              <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shadow-xs">
                <Globe className="w-5.5 h-5.5" />
              </div>
              <h4 className="font-sans font-bold text-slate-900 text-base">Global Visibility</h4>
              <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                Maximize the impact of your research with worldwide exposure and indexing.
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="bg-white border border-slate-100 p-6 sm:p-7 rounded-2xl space-y-4 hover:shadow-lg hover:shadow-slate-100/30 transition-all duration-200 text-left">
              <div className="w-11 h-11 rounded-xl bg-[#155e42]/10 flex items-center justify-center text-[#155e42] shadow-xs">
                <Lock className="w-5.5 h-5.5" />
              </div>
              <h4 className="font-sans font-bold text-slate-900 text-base">Open & Ethical</h4>
              <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                We are committed to open access, research integrity, and ethical publishing standards.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 3. SIMULATED ACADEMIC PORTALS ACCESS PANEL (Polished Light Theme) */}
      <section className="bg-gradient-to-b from-[#f8fafc] to-[#f0f9f5] py-16 px-6 border-t border-b border-slate-150/70 relative">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-emerald-100/50">
            <div className="space-y-2 text-left">
              <span className="bg-[#008751]/10 border border-[#008751]/20 px-3 py-1 rounded-lg text-xs font-mono text-[#008751] font-bold uppercase tracking-wider block w-fit">
                Multi-Tenant Role Gates Sandbox
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 font-sans">Active Academic Portal Access Points</h2>
              <p className="text-slate-500 text-sm sm:text-base leading-normal max-w-3xl">
                The enterprise publishing system isolates databases according to role definitions. Choose a simulated portal below to examine permissions safeguards, consensus decisions, or XML/DOI pipelines.
              </p>
            </div>
            <div className="bg-white border border-emerald-100 px-3.5 py-1.5 rounded-lg text-xs font-mono text-[#008751] font-bold shrink-0 shadow-xs">
              ⚡ Status: Standard Compliance v3.5.0
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            
            {/* AUTHOR PORTAL PANEL */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:border-emerald-250 hover:shadow-md transition-all duration-200 flex flex-col justify-between shadow-xs text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008751] animate-pulse"></span>
                  <span className="font-mono text-[10px] uppercase font-black text-[#008751] tracking-wider">Author Gates</span>
                </div>
                <h4 className="font-sans font-extrabold text-base text-slate-900">Create Drafts & Track Papers</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Submit manuscripts, keep updated in blind threads, and track reviews completely live.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-50">
                <button
                  onClick={() => onLoginClick('AUTHOR', 'LOGIN')}
                  className="bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all cursor-pointer shadow-xs animate-fade-in"
                >
                  Login
                </button>
                <button
                  onClick={() => onLoginClick('AUTHOR', 'REGISTER')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all cursor-pointer"
                >
                  Register
                </button>
              </div>
            </div>

            {/* REVIEWER PORTAL PANEL */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:border-emerald-250 hover:shadow-md transition-all duration-200 flex flex-col justify-between shadow-xs text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008751]"></span>
                  <span className="font-mono text-[10px] uppercase font-black text-[#008751] tracking-wider">Reviewer Desk</span>
                </div>
                <h4 className="font-sans font-extrabold text-base text-slate-900">Anonymous Evaluation</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Access scope-restricted manuscript text files. Conduct peer reviews and submit consensus suggestions.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-50 text-center">
                <button
                  onClick={() => onLoginClick('REVIEWER', 'LOGIN')}
                  className="bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all cursor-pointer shadow-xs w-full animate-fade-in"
                >
                  Referee Access
                </button>
              </div>
            </div>

            {/* EDITOR PORTAL PANEL */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:border-emerald-250 hover:shadow-md transition-all duration-200 flex flex-col justify-between shadow-xs text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008751] animate-pulse"></span>
                  <span className="font-mono text-[10px] uppercase font-black text-[#008751] tracking-wider">Editorial Central</span>
                </div>
                <h4 className="font-sans font-extrabold text-base text-slate-900">OJS Control Dashboard</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Monitor all articles, allocate peer referees, and record decisions with warnings logic.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-50 text-center">
                <button
                  onClick={() => onLoginClick('EDITOR', 'LOGIN')}
                  className="bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all cursor-pointer shadow-xs w-full animate-fade-in"
                >
                  Launch Hub
                </button>
              </div>
            </div>

            {/* PUBLISHER PORTAL PANEL */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:border-emerald-250 hover:shadow-md transition-all duration-200 flex flex-col justify-between shadow-xs text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008751]"></span>
                  <span className="font-mono text-[10px] uppercase font-black text-[#008751] tracking-wider">Publishing Desk</span>
                </div>
                <h4 className="font-sans font-extrabold text-base text-slate-900">Production & DOIs</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Incorporate digital identifiers, create volume release compilations, and format XML outputs.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-50 text-center">
                <button
                  onClick={() => onLoginClick('PUBLISHER', 'LOGIN')}
                  className="bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all cursor-pointer shadow-xs w-full animate-fade-in"
                >
                  Open Vault
                </button>
              </div>
            </div>

            {/* COORDINATOR PORTAL PANEL */}
            <div className="bg-white border-2 border-black rounded-2xl p-6 hover:shadow-md transition-all duration-200 flex flex-col justify-between shadow-xs text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-black animate-pulse"></span>
                  <span className="font-mono text-[10px] uppercase font-black text-black tracking-wider">Coordinator desk</span>
                </div>
                <h4 className="font-sans font-extrabold text-base text-slate-900">Oversight & Gates</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Oversee editorial workflows, adjust quality threshold gates, monitor timeline violations, and view real-time platform logs.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => onLoginClick('COORDINATOR', 'LOGIN')}
                  className="bg-black hover:bg-slate-900 text-white font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all cursor-pointer shadow-xs animate-fade-in"
                >
                  Login
                </button>
                <button
                  onClick={() => onLoginClick('COORDINATOR', 'REGISTER')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all cursor-pointer"
                >
                  Register
                </button>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 4. CALLS FOR PAPERS OPTIMIZED HERO CARDS (Upper banner callout) */}
      <section className="bg-[#fcfdfd] py-12 px-6 border-b border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="bg-slate-50/70 rounded-2xl p-6 sm:p-8 border border-slate-100 flex flex-col lg:flex-row items-center justify-between gap-6 text-left">
            <div className="lg:max-w-3xl">
              <h3 className="font-serif font-black text-slate-900 text-xl sm:text-2xl leading-snug">
                More opportunities to publish <br className="hidden sm:inline" /> your medical & clinical research:
              </h3>
            </div>
            <div className="lg:w-1/3 lg:border-l lg:border-slate-150 lg:pl-6 flex flex-col items-start gap-2">
              <p className="text-xs sm:text-sm font-bold text-slate-800 leading-none">Browse open Calls for Papers</p>
              <a
                href="#calls-panel"
                className="bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold font-sans px-5 py-3 rounded-lg transition-all shadow-xs block text-center cursor-pointer"
              >
                Explore More Opportunities
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 5. News & Announcements Panel */}
      <section className="bg-white py-16 px-6 border-b border-slate-100/80" id="calls-panel">
        <div className="max-w-4xl mx-auto">
          
          <div className="bg-[#fafdfb] rounded-2xl border border-emerald-100/50 p-6 sm:p-8 shadow-xs flex flex-col justify-between text-left">
            <div className="space-y-6">
              <h3 className="font-serif font-black text-slate-900 text-xl sm:text-2xl flex items-center gap-2 border-b border-emerald-50/60 pb-4">
                <Megaphone className="w-5.5 h-5.5 text-[#008751]" /> News & Announcements
              </h3>
              
              <div className="divide-y divide-slate-100 space-y-5">
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-mono text-[#008751] font-bold uppercase tracking-wider block">June 2026 Issue Callout</span>
                  <strong className="text-slate-950 text-sm sm:text-base leading-normal block hover:text-[#008751] transition-colors cursor-pointer font-extrabold">
                    Join as an editorial board member
                  </strong>
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                    We are seeking qualified clinical candidates to supervise upcoming peer consensus workflows. Submit your credentials to support deep learning in public healthcare diagnostic fields.
                  </p>
                </div>

                <div className="space-y-1.5 pt-5">
                  <span className="text-[10px] font-mono text-[#008751] font-bold uppercase tracking-wider block">International Research</span>
                  <strong className="text-slate-950 text-sm sm:text-base leading-normal block hover:text-[#008751] transition-colors cursor-pointer font-extrabold">
                    Partnerships & Collaborations
                  </strong>
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                    The journal has coupled databases with multi-center cancer networks to retrieve anonymized benchmarks for research cross-validation.
                  </p>
                </div>

                <div className="space-y-1.5 pt-5">
                  <span className="text-[10px] font-mono text-[#008751] font-bold uppercase tracking-wider block">Open Positions</span>
                  <strong className="text-slate-950 text-sm sm:text-base leading-normal block hover:text-[#008751] transition-colors cursor-pointer font-extrabold">
                    Join as referee
                  </strong>
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                    Expert practitioners with published history under IEEE / PubMed criteria can request automatic portal invitations inside our role gate module.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 mt-8">
              <button 
                onClick={() => alert("Simulating complete article search...")}
                className="inline-flex items-center gap-1.5 bg-[#008751] text-white font-bold text-xs uppercase px-5 py-3 rounded-lg hover:bg-[#007043] transition-all cursor-pointer shadow-xs"
              >
                Read latest issue insights →
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 8. INTERACTIVE WORKSPACE FOR TAB SELECTION */}
      <section className="bg-[#fcfdfd] py-16 px-6" id="aim-scope">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="border-b border-slate-150 flex flex-wrap gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider font-sans">
            <button
              onClick={() => setActiveJoinTab('BOARD')}
              className={`pb-2.5 px-4 border-b-2 transition-all cursor-pointer ${
                activeJoinTab === 'BOARD' ? 'border-[#008751] text-slate-900' : 'border-transparent text-gray-400 hover:text-slate-900'
              }`}
            >
              Join as Editorial Board Member
            </button>
            <button
              onClick={() => setActiveJoinTab('PARTNERS')}
              className={`pb-2.5 px-4 border-b-2 transition-all cursor-pointer ${
                activeJoinTab === 'PARTNERS' ? 'border-[#008751] text-slate-900' : 'border-transparent text-gray-400 hover:text-slate-900'
              }`}
            >
              Partnerships & Collaborations
            </button>
            <button
              onClick={() => setActiveJoinTab('REVIEWER')}
              className={`pb-2.5 px-4 border-b-2 transition-all cursor-pointer ${
                activeJoinTab === 'REVIEWER' ? 'border-[#008751] text-slate-900' : 'border-transparent text-gray-400 hover:text-slate-900'
              }`}
            >
              Join as Reviewer
            </button>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 sm:p-8 text-slate-600 text-sm leading-relaxed text-left shadow-xs">
            {activeJoinTab === 'BOARD' && (
              <div className="space-y-4">
                <h4 className="font-sans font-black text-slate-900 text-base">Supervising Peer Consensus Rules</h4>
                <p className="font-semibold">The <strong>Journal of Artificial Intelligence in Medicine & Public Health</strong> appoints leading clinical faculty representatives to steer the validation gatehouses. Associate Board members are tasked with auditing conflict-of-interest indicators and ensuring minimum peer referee feedback metrics are achieved prior to transitioning manuscripts to production.</p>
                <button onClick={() => alert("Use the simulated dashboard Login/Registration gatehouse to create editorial test accounts.")} className="bg-[#008751] hover:bg-[#007043] text-white font-bold px-4 py-2.5 rounded-lg text-xs uppercase tracking-wider cursor-pointer transition-all">Apply for Board Placement</button>
              </div>
            )}

            {activeJoinTab === 'PARTNERS' && (
              <div className="space-y-4">
                <h4 className="font-sans font-black text-slate-900 text-base">Clinical Multi-Center Cancer Registries</h4>
                <p className="font-semibold">The journal actively partners with health data foundations, university compiler networks, and the <strong>Tulatics</strong> editorial group of researchers. This consortium supports shared, anonymized image databases, CT benchmarks, and medical training weights to maintain strict open-access publication guidelines under CC BY 4.0 regulations.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-4">
                    <strong className="block text-slate-950 text-sm font-extrabold">NIH-Approved Standards</strong>
                    <span className="text-slate-500 block text-xs mt-1 font-semibold">Compliant with Health Insurance Portability metadata regulations.</span>
                  </div>
                  <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-4">
                    <strong className="block text-slate-950 text-sm font-extrabold">Secure Namespace Decoupling</strong>
                    <span className="text-slate-500 block text-xs mt-1 font-semibold">Patient identification arrays are cleanly stripped upon file transmission.</span>
                  </div>
                </div>
              </div>
            )}

            {activeJoinTab === 'REVIEWER' && (
              <div className="space-y-4">
                <h4 className="font-sans font-black text-slate-900 text-base">Contribute as an Expert Referee</h4>
                <p className="font-semibold">Ensure the scientific accuracy of published frameworks by joining our panel of dual-blind clinical reviewers. Select the <strong>Reviewer Desk</strong> portal key above to simulate how peer critiques, comment submissions, and recommendation pipelines are secured.</p>
                <button onClick={() => onLoginClick('REVIEWER', 'LOGIN')} className="bg-[#008751] hover:bg-[#007043] text-white font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer uppercase tracking-wider text-xs">Simulate Reviewer Access</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 11. RICH BLACK FOOTER COLLATERALS (With Tulitics Branding) */}
      <footer className="bg-[#0b0f12] text-slate-400 pt-12 pb-6 px-6 text-left border-t border-slate-900">
        <div className="max-w-7xl mx-auto space-y-10">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Column 1: Quick Links */}
            <div className="space-y-3 font-sans">
              <strong className="block text-white uppercase text-xs tracking-wider font-bold">Quick Links</strong>
              <ul className="space-y-2 text-slate-400 text-xs font-normal">
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Home</a></li>
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Aim & Scope</a></li>
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Editorial Board</a></li>
                <li><a href="#calls-panel" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>

            {/* Column 2: For Authors */}
            <div className="space-y-3 font-sans">
              <strong className="block text-white uppercase text-xs tracking-wider font-bold">For Authors</strong>
              <ul className="space-y-2 text-slate-400 text-xs font-normal">
                <li><button onClick={onSubmitClick} className="hover:text-white transition-colors text-left font-sans cursor-pointer">Author Guidelines</button></li>
                <li><button onClick={onSubmitClick} className="hover:text-white transition-colors text-left font-sans cursor-pointer">Submit Manuscript</button></li>
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Editorial Policies</a></li>
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Open Access Policy</a></li>
              </ul>
            </div>

            {/* Column 3: Others */}
            <div className="space-y-3 font-sans">
              <strong className="block text-white uppercase text-xs tracking-wider font-bold">Others</strong>
              <ul className="space-y-2 text-slate-400 text-xs font-normal">
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Terms & Condition</a></li>
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#aim-scope" className="hover:text-white transition-colors">Accessibility Statement</a></li>
              </ul>
            </div>

            {/* Column 4: Keep Up To Date */}
            <div className="space-y-3 font-sans">
              <strong className="block text-white uppercase text-xs tracking-wider font-bold">Keep Up to Date</strong>
              <p className="text-slate-500 text-xs leading-relaxed font-normal">
                Receive the journal's automated release logs directly on published issue distributions.
              </p>
              <div className="flex items-center gap-3 pt-1 text-slate-400">
                <a href="#facebook" className="hover:text-white transition-colors"><Facebook className="w-4 h-4" /></a>
                <a href="#twitter" className="hover:text-white transition-colors"><Twitter className="w-4 h-4" /></a>
                <a href="#youtube" className="hover:text-white transition-colors"><Youtube className="w-4 h-4" /></a>
                <a href="#instagram" className="hover:text-white transition-colors"><Instagram className="w-4 h-4" /></a>
                <a href="#linkedin" className="hover:text-white transition-colors"><Linkedin className="w-4 h-4" /></a>
              </div>
            </div>

          </div>

          {/* Bottom border separator */}
          <div className="border-t border-slate-900 pt-6 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500 font-sans">
            
            {/* TULITICS BRANDING BLOCKS */}
            <div className="flex items-center gap-2.5 bg-slate-950 p-2 px-4 rounded-xl border border-slate-900 shadow-inner">
              <TuliticsLogo iconSize={24} showText={false} usePng={true} />
            </div>

            <p className="text-slate-500 font-sans text-xs">
              Copyright 2026 © All rights Reserved.
            </p>

          </div>

        </div>
      </footer>

    </div>
  );
}
