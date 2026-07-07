import React, { useState } from 'react';
import { Manuscript } from '../types';
import {
  FileText,
  CheckSquare,
  Hash,
  BookOpen,
  Send,
  CheckCircle2,
  ShieldCheck,
  Download,
  Sparkles,
  FolderPlus,
  Settings,
  CreditCard,
  Database,
  AreaChart,
  ShieldAlert,
  ChevronRight,
  Plus,
  Clock,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';

interface PublisherWorkspaceProps {
  manuscripts: Manuscript[];
  onUpdateManuscript: (manuscript: Manuscript) => void;
  currentUser?: { name: string; email: string } | null;
}

export default function PublisherWorkspace({
  manuscripts,
  onUpdateManuscript,
  currentUser
}: PublisherWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<string>('SCHEDULED_PUBLICATIONS');
  const [successBanner, setSuccessBanner] = useState('');

  // Pull accepted manuscripts (status === 'ACCEPTED')
  const acceptedPapers = manuscripts.filter((m) => m.status === 'ACCEPTED');

  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(
    acceptedPapers.length > 0 ? acceptedPapers[0].id : null
  );

  const activePaper = manuscripts.find((m) => m.id === selectedPaperId);

  // States for publisher console
  const [doiValue, setDoiValue] = useState('');
  const [selectedVolume, setSelectedVolume] = useState('Volume 14');
  const [selectedIssue, setSelectedIssue] = useState('Issue 4 (Parallel Database Repositories)');

  // Checklist states
  const [checklist, setChecklist] = useState({
    metadataVerified: false,
    galleyFormatted: false,
    referencesLinked: false,
    coAuthorsNotified: false
  });

  const [galleyFileUploaded, setGalleyFileUploaded] = useState(false);
  const [galleyFileName, setGalleyFileName] = useState('');
  const [galleyFileSize, setGalleyFileSize] = useState('');

  const handleGenerateDoi = () => {
    if (!activePaper) return;
    const cleanId = activePaper.id.replace('JMS-', '').toLowerCase();
    const generated = `10.1016/j.jms.2026.${cleanId}`;
    setDoiValue(generated);
  };

  const handleSimulateGalleyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      setGalleyFileName(file.name);
      setGalleyFileSize(sizeMB);
      setGalleyFileUploaded(true);
      setChecklist((p) => ({ ...p, galleyFormatted: true }));
    }
  };

  const handlePublishNow = () => {
    if (!activePaper) return;

    if (!galleyFileUploaded) {
      alert("Please upload the final manufactured Galley file.");
      return;
    }
    if (!doiValue) {
      alert("A registered DOI number is required for archiving.");
      return;
    }

    const updated: Manuscript = {
      ...activePaper,
      status: 'PUBLISHED',
      doi: doiValue,
      volume: selectedVolume,
      issue: selectedIssue,
      publishedAt: new Date().toISOString()
    };

    onUpdateManuscript(updated);
    setSuccessBanner(`Manuscript successfully compiled. DOI registry linked: ${doiValue}`);
    setSelectedPaperId(null);

    // Clear state values
    setDoiValue('');
    setGalleyFileUploaded(false);
    setChecklist({
      metadataVerified: false,
      galleyFormatted: false,
      referencesLinked: false,
      coAuthorsNotified: false
    });
  };

  return (
    <div id="publisher-console-container" className="max-w-7xl mx-auto px-6 py-10 text-left">
      
      {successBanner && (
        <div id="success-banner" className="bg-emerald-600 text-white p-3.5 shadow rounded-xl mb-6 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-250" />
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner('')} className="font-bold hover:underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-[#008751]/15 border border-[#008751]/20 text-[#008751] rounded-lg">
                <BookOpen className="w-5 h-5" />
              </span>
              <div>
                <strong className="block text-sm font-bold truncate max-w-[150px]">{currentUser?.name || "Dr. John Backus"}</strong>
                <span className="block text-[11px] text-emerald-300 font-mono">Publisher Office</span>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-gray-400">
              <span>Catalog Node:</span>
              <span className="text-emerald-400 font-bold">Main Server</span>
            </div>
          </div>

          {/* COLLAPSIBLE SIDEBAR GROUPS */}
          <div className="space-y-4 font-sans text-xs">
            
            {/* JOURNAL MANAGEMENT */}
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-2 px-3">
                Journal Management
              </span>
              <div className="space-y-1">
                <button onClick={() => alert("Loading settings parameters.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <Settings className="w-4 h-4 text-[#008751]" /> Journal Settings
                </button>
                <button onClick={() => alert("Loading editorial board credentials.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <UserCheck className="w-4 h-4 text-[#008751]" /> Editorial Board
                </button>
                <button onClick={() => alert("Loading policies parameters.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <CheckSquare className="w-4 h-4 text-[#008751]" /> Journal Policies
                </button>
                <button onClick={() => alert("Loading sections.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <FolderPlus className="w-4 h-4 text-[#008751]" /> Journal Sections
                </button>
              </div>
            </div>

            {/* PUBLICATION MANAGEMENT */}
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-2 px-3">
                Publication Management
              </span>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab('SCHEDULED_PUBLICATIONS')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
                    activeTab === 'SCHEDULED_PUBLICATIONS' ? 'bg-[#008751] text-white font-semibold' : 'bg-white text-gray-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Scheduled Publications</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${activeTab === 'SCHEDULED_PUBLICATIONS' ? 'bg-[#007043] text-white' : 'bg-neutral-100'}`}>
                    {acceptedPapers.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('PUBLISHED_ARTICLES')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
                    activeTab === 'PUBLISHED_ARTICLES' ? 'bg-[#008751] text-white font-semibold' : 'bg-white text-gray-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Published Articles</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${activeTab === 'PUBLISHED_ARTICLES' ? 'bg-[#007043] text-white' : 'bg-neutral-100'}`}>
                    {manuscripts.filter(m => m.status === 'PUBLISHED').length}
                  </span>
                </button>
              </div>
            </div>

            {/* DOI MANAGEMENT */}
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-2 px-3">
                DOI Management
              </span>
              <div className="space-y-1">
                <button onClick={() => alert("Crossref direct endpoints active.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <Hash className="w-4 h-4 text-[#008751]" /> DOI Registration Pipeline
                </button>
                <button onClick={() => alert("Opening DOI tracking metrics.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <Clock className="w-4 h-4 text-[#008751]" /> DOI Tracking Registry
                </button>
              </div>
            </div>

            {/* FINANCE MANAGEMENT */}
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-2 px-3">
                Finance Management
              </span>
              <div className="space-y-1">
                <button onClick={() => alert("APC payments list opened.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <CreditCard className="w-4 h-4 text-[#008751]" /> APC Invoices Payments
                </button>
                <button onClick={() => alert("Subscription tables opened.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <Database className="w-4 h-4 text-[#008751]" /> Subscription Payments
                </button>
              </div>
            </div>

            {/* SYSTEM REPORTS */}
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-2 px-3">
                Reports
              </span>
              <div className="space-y-1">
                <button onClick={() => alert("Compile Submission Report.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <AreaChart className="w-4 h-4 text-[#008751]" /> Submission Reports
                </button>
                <button onClick={() => alert("Compile acceptance rate metrics.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <FileSpreadsheet className="w-4 h-4 text-[#008751]" /> Acceptance Reports
                </button>
              </div>
            </div>

            {/* SYSTEM ADMINISTRATION */}
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-2 px-3">
                System Administration
              </span>
              <div className="space-y-1">
                <button onClick={() => alert("Opening Roles Registry settings.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <ShieldAlert className="w-4 h-4 text-[#008751]" /> Roles & Permissions
                </button>
                <button onClick={() => alert("Backup successfully saved to local sandbox database.")} className="w-full flex items-center gap-2 px-3 py-2 bg-white text-gray-600 hover:bg-slate-50 border rounded-xl">
                  <Database className="w-4 h-4 text-[#008751]" /> Backup & Restore
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Right Active View Pane */}
        <div className="lg:col-span-9 space-y-6">
          
          {activeTab === 'SCHEDULED_PUBLICATIONS' && (
            <div className="space-y-6">
              
              <div className="bg-white border text-left border-gray-200 rounded-3xl p-6 shadow-sm">
                <h3 className="font-sans font-bold text-base text-slate-900 pb-2 border-b">Production Scheduling pipeline</h3>
                <p className="text-xs text-gray-500 mt-2">All accepted manuscripts wait in the production queue below. Select a manuscript to assign DOI parameters, upload manufactured galleys, and trigger publication commands.</p>

                {acceptedPapers.length === 0 ? (
                  <div className="p-12 text-center text-xs text-gray-400 bg-slate-50 border border-dashed rounded-2xl mt-4">
                    No accepted manuscripts waiting in production queue. Transition papers in Editor Workspace first.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs font-sans">
                    {acceptedPapers.map((paper) => {
                      const isSelected = selectedPaperId === paper.id;
                      return (
                        <div
                          key={paper.id}
                          className={`border p-4 rounded-2xl hover:border-emerald-300 transition-all cursor-pointer space-y-3.5 text-left ${isSelected ? 'border-[#008751] bg-emerald-50/15' : 'bg-white border-slate-150'}`}
                          onClick={() => setSelectedPaperId(paper.id)}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded border">
                              {paper.id}
                            </span>
                            <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wide border border-emerald-150">ACCEPTED</span>
                          </div>

                          <div>
                            <strong className="block text-slate-900 text-sm leading-snug">{paper.title}</strong>
                            <p className="text-[11px] text-gray-400 mt-1">Author: {paper.authorName}</p>
                          </div>

                          <div className="text-[10px] text-gray-400 pt-2 border-t border-dashed">
                            Submitted on: <strong>{paper.submittedAt ? new Date(paper.submittedAt).toLocaleDateString() : 'N/A'}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {activePaper && (
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
                  
                  <div className="border-b pb-4">
                    <span className="font-mono text-xs text-[#008751] font-bold bg-emerald-50 px-2 py-0.5 rounded">
                      Production Galley Processor • {activePaper.id}
                    </span>
                    <h3 className="font-sans font-bold text-lg text-slate-900 mt-2">{activePaper.title}</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                    
                    {/* Checklists */}
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider font-mono text-gray-500">Quality Checklist & Verification</h4>
                        <p className="text-[10px] text-gray-400 mt-1">Cross-check all galley validation checks before issuing release logs.</p>
                      </div>

                      <div className="space-y-2.5 text-xs">
                        <label className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checklist.metadataVerified}
                            onChange={(e) => setChecklist(p => ({ ...p, metadataVerified: e.target.checked }))}
                            className="w-4 h-4 text-[#008751] focus:ring-[#008751] rounded"
                          />
                          <div>
                            <span className="block font-semibold text-slate-850">Metadata Verification</span>
                            <span className="block text-[10px] text-gray-400">Verify character sets, abstract summaries, and coauthor registry tags.</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checklist.referencesLinked}
                            onChange={(e) => setChecklist(p => ({ ...p, referencesLinked: e.target.checked }))}
                            className="w-4 h-4 text-[#008751] focus:ring-[#008751] rounded"
                          />
                          <div>
                            <span className="block font-semibold text-slate-850">Crossref Reference Validation</span>
                            <span className="block text-[10px] text-gray-400">Cross-reference BibTeX pointers against global DNS registries.</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checklist.coAuthorsNotified}
                            onChange={(e) => setChecklist(p => ({ ...p, coAuthorsNotified: e.target.checked }))}
                            className="w-4 h-4 text-[#008751] focus:ring-[#008751] rounded"
                          />
                          <div>
                            <span className="block font-semibold text-slate-850">Author Release Notification</span>
                            <span className="block text-[10px] text-gray-400">Broadcast pre-publication galley approval emails to author matrix.</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Manufacturing inputs */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider font-mono text-gray-500">Manufacturing Inputs</h4>

                      <div className="space-y-2 text-xs">
                        <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest">Upload Galley File (PDF, HTML, XML)</label>
                        <input
                          id="gal-upload"
                          type="file"
                          accept=".pdf,.html,.xml"
                          onChange={handleSimulateGalleyUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="gal-upload"
                          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 transition-all bg-slate-50/50"
                        >
                          <FileText className="w-5 h-5 text-[#008751] mb-1" />
                          <span className="text-xs font-semibold text-slate-900">Click to Upload Manufactured Galley</span>
                          <span className="text-[9px] text-gray-400 mt-0.5">Supports PDF proof or XML schemas.</span>
                        </label>

                        {galleyFileUploaded && (
                          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center justify-between text-xs font-mono">
                            <span className="truncate max-w-[170px] font-semibold text-emerald-950">{galleyFileName}</span>
                            <span className="text-[10px] text-emerald-700 bg-white border px-1.5 py-0.5 rounded-md shrink-0 ml-1">{galleyFileSize}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 text-xs">
                        <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest">Digital Object Identifier (DOI)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={doiValue}
                            onChange={(e) => setDoiValue(e.target.value)}
                            placeholder="e.g. 10.1016/j.jms.2026.c303"
                            className="flex-grow border rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#008751] font-mono"
                          />
                          <button
                            onClick={handleGenerateDoi}
                            className="bg-slate-900 text-white hover:bg-slate-800 px-3 py-2 rounded-lg text-xs font-mono font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Hash className="w-3.5 h-3.5 text-emerald-400" /> Auto Generate
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest">Volume & Issue Assignment</label>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={selectedVolume}
                            onChange={(e) => setSelectedVolume(e.target.value)}
                            className="border rounded-lg p-2 bg-white"
                          >
                            <option value="Volume 14">Volume 14 (2026)</option>
                            <option value="Volume 15">Volume 15 (2027)</option>
                          </select>
                          <select
                            value={selectedIssue}
                            onChange={(e) => setSelectedIssue(e.target.value)}
                            className="border rounded-lg p-2 bg-white"
                          >
                            <option value="Issue 4 (Parallel Database Repositories)">Issue 4 (Databases)</option>
                            <option value="Issue 1 (High-Performance Distributed Systems)">Issue 1 (Distributed Systems)</option>
                            <option value="Issue 2 (Edge Compilation Mechanisms)">Issue 2 (Compilers)</option>
                          </select>
                        </div>
                      </div>

                    </div>

                  </div>

                  <div className="border-t border-gray-150 pt-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-[11px] font-sans text-gray-400">
                      {!checklist.metadataVerified || !doiValue || !galleyFileUploaded ? (
                        <span className="text-amber-600 font-mono font-medium">⚠️ Completing checklist checkpoints required prior to release</span>
                      ) : (
                        <span className="text-emerald-600 font-mono font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Manufacturing specifications validated successfully
                        </span>
                      )}
                    </div>

                    <button
                      disabled={!checklist.metadataVerified || !doiValue || !galleyFileUploaded}
                      onClick={handlePublishNow}
                      className="bg-emerald-600 hover:bg-emerald-700 font-bold font-mono text-xs text-white uppercase tracking-wider px-6 py-3 rounded-xl disabled:opacity-40 select-none shadow-md cursor-pointer transition-all"
                    >
                      Publish Manuscript Live (XML Proof Mapped)
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

          {activeTab === 'PUBLISHED_ARTICLES' && (
            <div className="bg-white border text-left border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-sans font-bold text-base text-slate-900 pb-2 border-b">Published Articles Catalog</h3>
              <p className="text-xs text-gray-500">Live directory tracking indexed metadata indices and associated DOI registers.</p>
              
              <div className="space-y-4">
                {manuscripts.filter(m => m.status === 'PUBLISHED').length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400 bg-slate-50 border border-dashed rounded-xl font-mono">
                    Zero manuscripts compiled and published. Use Scheduled Publications tab first.
                  </div>
                ) : (
                  manuscripts.filter(m => m.status === 'PUBLISHED').map((m) => (
                    <div key={m.id} className="border p-4 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs font-sans">
                      <div>
                        <strong className="block text-slate-900 text-sm leading-snug">{m.title}</strong>
                        <p className="text-[11px] text-[#008751] font-mono mt-1">DOI Registry: {m.doi || 'Indexed'}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{m.volume} • {m.issue}</p>
                      </div>
                      <button
                        onClick={() => alert(`Opening published URI: https://doi.org/${m.doi}`)}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
                      >
                        Launch Direct Index
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
