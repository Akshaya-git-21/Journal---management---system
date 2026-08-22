import React, { useState, useEffect } from 'react';
import TuliticsLogo from './TuliticsLogo';
import { NavGroup, NavItem } from './SidebarNavGroup';
import {
  listManuscripts, subscribeToManuscripts, markPublished, uploadPublishedGalley, getContributors,
  getEditorAssignments, getReviewerAssignments, getRevisions, getProfilesByIds, listActiveProfilesByRole,
  ManuscriptRow, ContributorRow, EditorAssignmentRow, ReviewerAssignmentRow, RevisionRow, ProfileRow
} from '../lib/workflow';
import {
  FileText, CheckCircle2, XCircle, AlertTriangle, Hash, BookOpen, Settings, Users, CheckSquare,
  LayoutGrid, ClipboardList, Clock, History, Eye, ExternalLink, BarChart3, Download, ShieldAlert,
  Database, Loader2, Upload, X, Copy, RefreshCw, Globe, ChevronLeft, ChevronRight, UserCheck, FileClock,
  Inbox
} from 'lucide-react';

interface PublisherWorkspaceProps {
  currentUser?: { name: string; email: string } | null;
}

const JOURNAL_NAME = 'Journal of Molecular Sciences';

type Tab =
  | 'QUEUE' | 'SCHEDULED' | 'PUBLISHED'
  | 'DOI_PIPELINE' | 'DOI_REGISTRY'
  | 'WEBSITE_ARTICLES' | 'WEBSITE_PREVIEW' | 'PUBLIC_WEBSITE'
  | 'REPORTS' | 'DOWNLOAD_REPORTS'
  | 'JOURNAL_SETTINGS' | 'EDITORIAL_BOARD' | 'JOURNAL_POLICIES' | 'JOURNAL_SECTIONS'
  | 'ROLES' | 'BACKUP';

const WIZARD_STEPS = ['Final Article PDF', 'PDF Validation', 'Website Preview', 'Final Publication Check'] as const;

interface PublishedDetails {
  editors: EditorAssignmentRow[];
  reviewers: ReviewerAssignmentRow[];
  revisions: RevisionRow[];
  profiles: Record<string, ProfileRow>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTimestamp(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function suggestDoi(manuscriptId: string) {
  const slug = manuscriptId.split('-').pop()?.toLowerCase() || manuscriptId.toLowerCase();
  return `10.1016/j.jms.2026.${slug}`;
}

function leadingNumber(label: string) {
  return label.match(/\d+/)?.[0] || label;
}

interface PdfAnalysis { header: boolean; eof: boolean; pages: boolean; fonts: boolean; }

async function analyzePdf(file: File): Promise<PdfAnalysis> {
  const buf = await file.arrayBuffer();
  const text = new TextDecoder('latin1').decode(buf);
  const header = text.slice(0, 1024).includes('%PDF-');
  const tail = text.slice(Math.max(0, text.length - 4096));
  const eof = tail.includes('%%EOF');
  const pages = /\/Type\s*\/Page(?!s)/.test(text) || /\/Type\s*\/Pages/.test(text);
  const fonts = /\/FontFile/.test(text);
  return { header, eof, pages, fonts };
}

export default function PublisherWorkspace({ currentUser }: PublisherWorkspaceProps) {
  const [manuscripts, setManuscripts] = useState<ManuscriptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('QUEUE');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [contributors, setContributors] = useState<ContributorRow[]>([]);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [doiValue, setDoiValue] = useState('');
  const [volume, setVolume] = useState('Volume 14 (2026)');
  const [issue, setIssue] = useState('Issue 4');
  const [editingDetails, setEditingDetails] = useState(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedFileMeta, setUploadedFileMeta] = useState<{ name: string; sizeLabel: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({ publication: true, doi: true, website: true, reports: true, journal: true, system: true });
  const toggleNavGroup = (key: string) => setExpandedNavGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const [wizardStep, setWizardStep] = useState(0);
  const [publishedDetails, setPublishedDetails] = useState<PublishedDetails | null>(null);
  const [loadingPublishedDetails, setLoadingPublishedDetails] = useState(false);

  const [editors, setEditors] = useState<ProfileRow[]>([]);
  const [reviewers, setReviewers] = useState<ProfileRow[]>([]);
  const [publishers, setPublishers] = useState<ProfileRow[]>([]);

  const load = async () => {
    try {
      const [rows, editorRows, reviewerRows, publisherRows] = await Promise.all([
        listManuscripts(),
        listActiveProfilesByRole('EDITOR'),
        listActiveProfilesByRole('REVIEWER'),
        listActiveProfilesByRole('PUBLISHER'),
      ]);
      setManuscripts(rows);
      setEditors(editorRows);
      setReviewers(reviewerRows);
      setPublishers(publisherRows);
    } catch (e: any) {
      console.error('Failed to load manuscripts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsubscribe = subscribeToManuscripts(load);
    return unsubscribe;
  }, []);

  const queue = manuscripts.filter((m) => m.production_stage === 'SENT_TO_PUBLISHER');
  const published = manuscripts.filter((m) => m.status === 'PUBLISHED');
  const doiPending = queue.filter((m) => !m.doi);

  const focusedManuscript = manuscripts.find((m) => m.id === focusedId) || null;
  const displayManuscript =
    focusedManuscript && (queue.some((q) => q.id === focusedManuscript.id) || focusedManuscript.status === 'PUBLISHED')
      ? focusedManuscript
      : queue[0] || null;

  useEffect(() => {
    const m = displayManuscript;
    if (!m) { setContributors([]); return; }
    if (m.status !== 'PUBLISHED') {
      setDoiValue(m.doi || suggestDoi(m.id));
      setVolume(m.volume ? `Volume ${m.volume} (2026)` : 'Volume 14 (2026)');
      setIssue(m.issue ? `Issue ${m.issue}` : 'Issue 4');
      setPendingFile(null);
      setPdfAnalysis(null);
      setUploadedUrl(null);
      setUploadedFileMeta(null);
      setEditingDetails(false);
      setFileError('');
      setWizardStep(0);
    }
    getContributors(m.id).then(setContributors).catch(() => setContributors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayManuscript?.id]);

  useEffect(() => {
    const m = displayManuscript;
    if (!m || m.status !== 'PUBLISHED') { setPublishedDetails(null); return; }
    let cancelled = false;
    setLoadingPublishedDetails(true);
    (async () => {
      const [editors, reviewers, revisions] = await Promise.all([
        getEditorAssignments(m.id).catch(() => []),
        getReviewerAssignments(m.id).catch(() => []),
        getRevisions(m.id).catch(() => []),
      ]);
      const ids = Array.from(new Set([...editors.map((e) => e.editor_id), ...reviewers.map((r) => r.reviewer_id)].filter(Boolean)));
      const profiles = ids.length > 0 ? await getProfilesByIds(ids).catch(() => ({})) : {};
      if (!cancelled) setPublishedDetails({ editors, reviewers, revisions, profiles });
    })().finally(() => { if (!cancelled) setLoadingPublishedDetails(false); });
    return () => { cancelled = true; };
  }, [displayManuscript?.id, displayManuscript?.status]);

  const authorsLabel = contributors.length > 0
    ? contributors.map((c) => c.name).join(', ')
    : displayManuscript?.author_name || '--';

  const handleSelectFile = async (file: File) => {
    setFileError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Only PDF files are accepted.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setFileError('File exceeds the 20 MB maximum size.');
      return;
    }
    setPendingFile(file);
    setUploadedUrl(null);
    setUploadedFileMeta(null);
    setAnalyzing(true);
    try {
      const analysis = await analyzePdf(file);
      setPdfAnalysis(analysis);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUploadPdf = async () => {
    if (!pendingFile || !displayManuscript) return;
    setUploading(true);
    try {
      const url = await uploadPublishedGalley(displayManuscript.id, pendingFile);
      setUploadedUrl(url);
      setUploadedFileMeta({ name: pendingFile.name, sizeLabel: formatBytes(pendingFile.size) });
      setBanner({ type: 'success', text: 'Final PDF uploaded successfully.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e.message || 'Failed to upload the PDF.' });
    } finally {
      setUploading(false);
    }
  };

  const handleReplacePdf = () => {
    setPendingFile(null);
    setPdfAnalysis(null);
    setUploadedUrl(null);
    setUploadedFileMeta(null);
    setFileError('');
    setWizardStep(0);
  };

  const pdfUploaded = !!uploadedUrl;
  const pdfStructureOk = !!pdfAnalysis && pdfAnalysis.header && pdfAnalysis.eof && pdfAnalysis.pages;
  const metadataComplete = !!(doiValue.trim() && volume.trim() && issue.trim());
  const doiAssigned = !!doiValue.trim();
  const volumeIssueAssigned = !!volume.trim() && !!issue.trim();
  const websiteReady = pdfUploaded && pdfStructureOk && metadataComplete && doiAssigned && volumeIssueAssigned;
  const readyToPublish = websiteReady && !!displayManuscript && displayManuscript.status !== 'PUBLISHED';

  const wizardStepValid = [pdfUploaded, pdfStructureOk, true, true];
  const goNext = () => { if (wizardStepValid[wizardStep] && wizardStep < WIZARD_STEPS.length - 1) setWizardStep((s) => s + 1); };
  const goBack = () => setWizardStep((s) => Math.max(0, s - 1));

  const handleConfirmPublish = async () => {
    if (!displayManuscript) return;
    setPublishing(true);
    try {
      const volumeNum = (volume.match(/\d+/)?.[0]) || volume;
      const issueNum = (issue.match(/\d+/)?.[0]) || issue;
      await markPublished(displayManuscript.id, doiValue.trim(), volumeNum, issueNum, uploadedUrl || undefined);
      await load();
      setShowConfirm(false);
      setBanner({ type: 'success', text: 'Article is now published live.' });
    } catch (e: any) {
      setBanner({ type: 'error', text: e.message || 'Failed to publish the article.' });
    } finally {
      setPublishing(false);
    }
  };

  const publicUrl = displayManuscript?.doi ? `https://doi.org/${displayManuscript.doi}` : doiValue ? `https://doi.org/${doiValue}` : '';

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setBanner({ type: 'error', text: 'Could not copy the URL to the clipboard.' });
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen text-slate-900 pb-12 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between sticky top-0 z-40 shadow-sm w-full">
        <TuliticsLogo iconSize={36} showText={true} textColorClass="text-[#155e42]" subTitle="PUBLISHER WORKSPACE • DISTRIBUTION HUB" usePng={true} />
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>Logged in as: <strong className="text-slate-900">{currentUser?.name || 'Publisher'}</strong></span>
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Publisher</span>
        </div>
      </header>

      <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-8 lg:px-10 py-8 flex-grow">

        {banner && (
          <div className={`mb-6 rounded-2xl p-3.5 text-xs font-medium flex items-center justify-between shadow-sm ${banner.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>{banner.text}</span>
            </div>
            <button onClick={() => setBanner(null)} className="font-bold hover:underline">Dismiss</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* SIDEBAR */}
          <aside className="lg:col-span-3 bg-[#00170f] rounded-3xl p-4 space-y-3 shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div className="rounded-3xl border border-[#00311f] bg-[#001d14] p-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-[#008751]/15 border border-[#008751]/30 text-emerald-300 rounded-lg">
                  <BookOpen className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-sm font-bold text-white truncate">{currentUser?.name || 'Publisher'}</strong>
                  <span className="block text-[11px] text-emerald-300">Publisher Office</span>
                </div>
              </div>
              <div className="pt-3 border-t border-white/10 flex justify-between items-center text-[11px] text-emerald-100/60">
                <span>Catalog Node:</span>
                <span className="text-emerald-400 font-semibold">Main Server</span>
              </div>
            </div>

            <nav className="space-y-3">
              <NavGroup title="Publication Management" icon={<ClipboardList className="w-4 h-4" />} expanded={expandedNavGroups.publication} onToggle={() => toggleNavGroup('publication')}>
                <NavItem icon={<ClipboardList className="w-4 h-4" />} label="Publication Queue" active={activeTab === 'QUEUE'} count={queue.length} onClick={() => setActiveTab('QUEUE')} />
                <NavItem icon={<Clock className="w-4 h-4" />} label="Scheduled Publications" active={activeTab === 'SCHEDULED'} count={0} onClick={() => setActiveTab('SCHEDULED')} />
                <NavItem icon={<CheckCircle2 className="w-4 h-4" />} label="Published Articles" active={activeTab === 'PUBLISHED'} count={published.length} onClick={() => setActiveTab('PUBLISHED')} />
              </NavGroup>

              <NavGroup title="DOI Management" icon={<Hash className="w-4 h-4" />} expanded={expandedNavGroups.doi} onToggle={() => toggleNavGroup('doi')}>
                <NavItem icon={<Hash className="w-4 h-4" />} label="DOI Registration Pipeline" active={activeTab === 'DOI_PIPELINE'} count={doiPending.length} onClick={() => setActiveTab('DOI_PIPELINE')} />
                <NavItem icon={<History className="w-4 h-4" />} label="DOI Tracking Registry" active={activeTab === 'DOI_REGISTRY'} count={published.length} onClick={() => setActiveTab('DOI_REGISTRY')} />
              </NavGroup>

              <NavGroup title="Website Management" icon={<LayoutGrid className="w-4 h-4" />} expanded={expandedNavGroups.website} onToggle={() => toggleNavGroup('website')}>
                <NavItem icon={<LayoutGrid className="w-4 h-4" />} label="Website Articles" active={activeTab === 'WEBSITE_ARTICLES'} count={published.length} onClick={() => setActiveTab('WEBSITE_ARTICLES')} />
                <NavItem icon={<Eye className="w-4 h-4" />} label="Website Preview" active={activeTab === 'WEBSITE_PREVIEW'} onClick={() => setActiveTab('WEBSITE_PREVIEW')} />
                <NavItem icon={<ExternalLink className="w-4 h-4" />} label="Public Website" active={activeTab === 'PUBLIC_WEBSITE'} onClick={() => setActiveTab('PUBLIC_WEBSITE')} />
              </NavGroup>

              <NavGroup title="Reports" icon={<BarChart3 className="w-4 h-4" />} expanded={expandedNavGroups.reports} onToggle={() => toggleNavGroup('reports')}>
                <NavItem icon={<BarChart3 className="w-4 h-4" />} label="Publication Reports" active={activeTab === 'REPORTS'} onClick={() => setActiveTab('REPORTS')} />
                <NavItem icon={<Download className="w-4 h-4" />} label="Download Reports" active={activeTab === 'DOWNLOAD_REPORTS'} onClick={() => setActiveTab('DOWNLOAD_REPORTS')} />
              </NavGroup>

              <NavGroup title="Journal Management" icon={<Settings className="w-4 h-4" />} expanded={expandedNavGroups.journal} onToggle={() => toggleNavGroup('journal')}>
                <NavItem icon={<Settings className="w-4 h-4" />} label="Journal Settings" active={activeTab === 'JOURNAL_SETTINGS'} onClick={() => setActiveTab('JOURNAL_SETTINGS')} />
                <NavItem icon={<Users className="w-4 h-4" />} label="Editorial Board" active={activeTab === 'EDITORIAL_BOARD'} count={editors.length} onClick={() => setActiveTab('EDITORIAL_BOARD')} />
                <NavItem icon={<CheckSquare className="w-4 h-4" />} label="Journal Policies" active={activeTab === 'JOURNAL_POLICIES'} onClick={() => setActiveTab('JOURNAL_POLICIES')} />
                <NavItem icon={<LayoutGrid className="w-4 h-4" />} label="Journal Sections" active={activeTab === 'JOURNAL_SECTIONS'} onClick={() => setActiveTab('JOURNAL_SECTIONS')} />
              </NavGroup>

              <NavGroup title="System Administration" icon={<ShieldAlert className="w-4 h-4" />} expanded={expandedNavGroups.system} onToggle={() => toggleNavGroup('system')}>
                <NavItem icon={<ShieldAlert className="w-4 h-4" />} label="Roles & Permissions" active={activeTab === 'ROLES'} onClick={() => setActiveTab('ROLES')} />
                <NavItem icon={<Database className="w-4 h-4" />} label="Backup & Restore" active={activeTab === 'BACKUP'} onClick={() => setActiveTab('BACKUP')} />
              </NavGroup>
            </nav>
          </aside>

          {/* MAIN CONTENT */}
          <main className="lg:col-span-9 space-y-6">

            {loading ? (
              <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
            ) : activeTab === 'SCHEDULED' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Scheduled Publications</p>
                <div className="mt-4 p-10 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  Scheduled publishing is not available yet. Articles go live immediately once confirmed in the Publication Queue.
                </div>
              </div>
            ) : activeTab === 'PUBLISHED' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Published Articles</p>
                {published.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    No articles have been published yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {published.map((m) => {
                      const url = m.doi ? `https://doi.org/${m.doi}` : '';
                      return (
                        <div
                          key={m.id}
                          onClick={() => { setFocusedId(m.id); setActiveTab('QUEUE'); }}
                          className="border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 cursor-pointer hover:border-[#008751] hover:bg-emerald-50/20 transition-colors"
                        >
                          <div className="min-w-0">
                            <strong className="block text-sm text-slate-900 truncate">{m.title}</strong>
                            <p className="text-[11px] text-emerald-700 mt-1">DOI: {m.doi || '--'}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Volume {m.volume} • Issue {m.issue} • Published {formatDate(m.published_at)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              {m.published_pdf_url && (
                                <button onClick={() => window.open(m.published_pdf_url!, '_blank')} className="border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold px-3 py-1.5 rounded-lg">View PDF</button>
                              )}
                              {url && (
                                <button onClick={() => window.open(url, '_blank')} className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg">View Live Article</button>
                              )}
                            </div>
                            <button
                              onClick={() => { setFocusedId(m.id); setActiveTab('QUEUE'); }}
                              className="text-[11px] font-semibold text-[#008751] px-3 py-1.5"
                            >
                              View Details →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeTab === 'DOI_PIPELINE' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">DOI Registration Pipeline</p>
                <p className="text-sm text-slate-500">Manuscripts in production that still need a DOI assigned before they can be published.</p>
                {doiPending.length === 0 ? (
                  <EmptyState text="No manuscripts are waiting on a DOI right now." />
                ) : (
                  <div className="space-y-3">
                    {doiPending.map((m) => (
                      <React.Fragment key={m.id}><ListRow title={m.title} meta={`${m.id} • Sent to production ${formatDate(m.updated_at)}`} onClick={() => { setFocusedId(m.id); setActiveTab('QUEUE'); }} actionLabel="Register DOI →" /></React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'DOI_REGISTRY' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">DOI Tracking Registry</p>
                <p className="text-sm text-slate-500">Every DOI this journal has registered through publication.</p>
                {published.length === 0 ? (
                  <EmptyState text="No DOIs have been registered yet." />
                ) : (
                  <div className="space-y-3">
                    {published.map((m) => (
                      <React.Fragment key={m.id}><ListRow title={m.doi || '--'} meta={`${m.title} • Published ${formatDate(m.published_at)}`} onClick={() => { setFocusedId(m.id); setActiveTab('QUEUE'); }} actionLabel="View →" /></React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'WEBSITE_ARTICLES' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Website Articles</p>
                <p className="text-sm text-slate-500">Articles currently live on the public journal website.</p>
                {published.length === 0 ? (
                  <EmptyState text="No articles are live on the website yet." />
                ) : (
                  <div className="space-y-3">
                    {published.map((m) => (
                      <React.Fragment key={m.id}><ListRow title={m.title} meta={`Volume ${m.volume} • Issue ${m.issue} • Published ${formatDate(m.published_at)}`} onClick={() => { setFocusedId(m.id); setActiveTab('QUEUE'); }} actionLabel="View Details →" /></React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'WEBSITE_PREVIEW' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Website Preview</p>
                <p className="text-sm text-slate-500">Pick a published article to preview exactly how it renders on the public website.</p>
                {published.length === 0 ? (
                  <EmptyState text="No published articles are available to preview yet." />
                ) : (
                  <div className="space-y-3">
                    {published.map((m) => (
                      <React.Fragment key={m.id}><ListRow title={m.title} meta={`DOI: ${m.doi || '--'}`} onClick={() => { setFocusedId(m.id); setActiveTab('QUEUE'); }} actionLabel="Preview →" /></React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'PUBLIC_WEBSITE' ? (
              <PlaceholderScreen title="Public Website" text="No public-facing journal website is connected to this workspace yet." />
            ) : activeTab === 'REPORTS' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Publication Reports</p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <StatCard label="In Production Queue" value={queue.length} />
                  <StatCard label="Published Articles" value={published.length} />
                  <StatCard label="Awaiting DOI" value={doiPending.length} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-3">Recently Published</p>
                  {published.length === 0 ? (
                    <EmptyState text="No published articles yet." />
                  ) : (
                    <div className="space-y-2">
                      {[...published].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).slice(0, 5).map((m) => (
                        <React.Fragment key={m.id}><ListRow title={m.title} meta={`Published ${formatDate(m.published_at)}`} onClick={() => { setFocusedId(m.id); setActiveTab('QUEUE'); }} actionLabel="View →" /></React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'DOWNLOAD_REPORTS' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Download Reports</p>
                <p className="text-sm text-slate-500">Export the published-articles register as a CSV file.</p>
                <button
                  disabled={published.length === 0}
                  onClick={() => downloadPublishedCsv(published)}
                  className="inline-flex items-center gap-2 bg-[#008751] hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold px-5 py-2.5 rounded-xl"
                >
                  <Download className="w-4 h-4" /> Download Published Articles (CSV)
                </button>
                {published.length === 0 && <p className="text-xs text-slate-400">No published articles to export yet.</p>}
              </div>
            ) : activeTab === 'JOURNAL_SETTINGS' ? (
              <PlaceholderScreen title="Journal Settings" text="No journal configuration data is connected to this workspace yet." />
            ) : activeTab === 'EDITORIAL_BOARD' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Editorial Board</p>
                {editors.length === 0 ? (
                  <EmptyState text="No active editors found." />
                ) : (
                  <div className="space-y-2">
                    {editors.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{e.name || 'Unnamed editor'}</p>
                          <p className="text-xs text-slate-500 truncate">{e.email}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">{e.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'JOURNAL_POLICIES' ? (
              <PlaceholderScreen title="Journal Policies" text="No journal policy documents are connected to this workspace yet." />
            ) : activeTab === 'JOURNAL_SECTIONS' ? (
              <PlaceholderScreen title="Journal Sections" text="No journal section configuration is connected to this workspace yet." />
            ) : activeTab === 'ROLES' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Roles & Permissions</p>
                <p className="text-sm text-slate-500">Active accounts by role, pulled live from the profiles registry.</p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <StatCard label="Active Editors" value={editors.length} />
                  <StatCard label="Active Reviewers" value={reviewers.length} />
                  <StatCard label="Active Publishers" value={publishers.length} />
                </div>
              </div>
            ) : activeTab === 'BACKUP' ? (
              <PlaceholderScreen title="Backup & Restore" text="No backup system is connected to this workspace yet." />
            ) : !displayManuscript ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
                <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">No manuscripts waiting in the Publication Queue.</p>
                <p className="text-xs text-slate-400 mt-1">A Coordinator must send an accepted manuscript to Publishers before it appears here.</p>
              </div>
            ) : (
              <>
                {/* Queue picker, only when more than one item */}
                {queue.length > 1 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-3">Publication Queue ({queue.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {queue.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setFocusedId(m.id)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${displayManuscript.id === m.id ? 'bg-[#008751] border-[#008751] text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {m.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TITLE + STATUS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-400 font-bold">Publish Article</p>
                      <h1 className="mt-2 text-2xl font-black text-slate-900">{displayManuscript.title}</h1>
                      <p className="mt-1 text-xs text-slate-400">Manuscript ID: <span className="font-semibold text-slate-600">{displayManuscript.id}</span></p>
                    </div>
                    {displayManuscript.status === 'PUBLISHED' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Published Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-700">
                        Ready For Publication
                      </span>
                    )}
                  </div>

                  {/* WIZARD STEP INDICATOR */}
                  {displayManuscript.status !== 'PUBLISHED' && (
                    <div className="flex items-center pt-2">
                      {WIZARD_STEPS.map((label, idx) => {
                        const done = idx < wizardStep;
                        const current = idx === wizardStep;
                        return (
                          <React.Fragment key={label}>
                            <button
                              onClick={() => { if (idx <= wizardStep || wizardStepValid.slice(0, idx).every(Boolean)) setWizardStep(idx); }}
                              className="flex flex-col items-center gap-1.5"
                            >
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                                done ? 'bg-[#008751] border-[#008751] text-white' : current ? 'border-[#008751] text-[#008751] bg-emerald-50' : 'border-slate-200 text-slate-400 bg-white'
                              }`}>
                                {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                              </div>
                              <span className={`text-[10px] font-semibold text-center max-w-[100px] ${done || current ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                            </button>
                            {idx < WIZARD_STEPS.length - 1 && (
                              <div className={`flex-1 h-0.5 mx-1 mb-4 ${idx < wizardStep ? 'bg-[#008751]' : 'bg-slate-200'}`} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>

                {displayManuscript.status !== 'PUBLISHED' && (
                  <>
                    {/* STEP 1: FINAL PDF UPLOAD */}
                    {wizardStep === 0 && (
                      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[#008751] font-bold">Final Article PDF</p>
                        <p className="mt-1 text-sm text-slate-500">Upload the final manufactured PDF that will be made available to readers.</p>

                        {!uploadedFileMeta ? (
                          <div className="mt-4 space-y-3">
                            <div
                              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                              onDragLeave={() => setIsDragging(false)}
                              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleSelectFile(f); }}
                              onClick={() => document.getElementById('final-pdf-input')?.click()}
                              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-14 text-center cursor-pointer transition-colors ${isDragging ? 'border-[#008751] bg-emerald-50' : 'border-slate-300 hover:bg-slate-50'}`}
                            >
                              <input id="final-pdf-input" type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSelectFile(f); }} />
                              <FileText className="w-10 h-10 text-slate-300" />
                              <p className="text-sm font-semibold text-slate-700">Drop final PDF here</p>
                              <p className="text-xs text-slate-400">or click to browse</p>
                              <p className="text-[11px] text-slate-400 mt-2">Accepted format: PDF • Maximum file size: 20 MB</p>
                            </div>

                            {fileError && (
                              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                <XCircle className="w-4 h-4" /> {fileError}
                              </div>
                            )}

                            {pendingFile && (
                              <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <FileText className="w-5 h-5 text-[#008751] shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 truncate">{pendingFile.name}</p>
                                    <p className="text-[11px] text-slate-400">{formatBytes(pendingFile.size)}{analyzing ? ' • analyzing…' : ''}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={handleUploadPdf}
                                  disabled={uploading || analyzing}
                                  className="bg-[#008751] hover:bg-[#007043] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shrink-0"
                                >
                                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload PDF
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl p-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="p-2.5 rounded-xl bg-white border border-emerald-200"><FileText className="w-5 h-5 text-[#008751]" /></span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">{uploadedFileMeta.name}</p>
                                <p className="text-xs text-slate-500">{uploadedFileMeta.sizeLabel}</p>
                                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> PDF VALIDATED</span>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => window.open(uploadedUrl!, '_blank')} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-semibold px-3 py-2 rounded-xl">Preview PDF</button>
                              <button onClick={handleReplacePdf} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-semibold px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Replace PDF</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* STEP 2: PDF VALIDATION */}
                    {wizardStep === 1 && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4">PDF Validation</p>
                        {pdfAnalysis ? (
                          <div className="grid sm:grid-cols-2 gap-3 text-sm">
                            <ValidationRow ok={pdfUploaded} label="PDF file uploaded" failText="Upload the PDF to run validation." />
                            <ValidationRow ok={pdfAnalysis.header} label="PDF is readable" failText="File does not start with a valid PDF header." />
                            <ValidationRow ok={pdfAnalysis.pages} label="All pages detected" failText="No page objects were found in the file." />
                            <ValidationRow ok={pdfAnalysis.fonts} warn label="Fonts embedded" failText="No embedded fonts detected — consider re-exporting with fonts embedded." />
                            <ValidationRow ok={pdfAnalysis.eof} label="No corrupted pages" failText="End-of-file marker missing — the PDF may be truncated or corrupted." />
                            <ValidationRow ok={metadataComplete} label="PDF metadata validated" failText="DOI, volume, and issue must be set before publishing." />
                          </div>
                        ) : (
                          <div className="p-8 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">Go back and upload a PDF to run validation.</div>
                        )}
                      </div>
                    )}

                    {/* STEP 3: WEBSITE PREVIEW */}
                    {wizardStep === 2 && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Website Preview</p>
                        <p className="mt-1 text-sm text-slate-500">Preview how this article will appear to readers before publishing.</p>

                        <div className="mt-4 border border-slate-200 rounded-2xl p-6 bg-slate-50">
                          <p className="text-[11px] uppercase tracking-wide text-[#008751] font-bold">{JOURNAL_NAME}</p>
                          <h3 className="mt-2 text-lg font-black text-slate-900">{displayManuscript.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">{authorsLabel}</p>
                          <p className="mt-1 text-xs text-slate-400">Volume {leadingNumber(volume)} • Issue {leadingNumber(issue)} • 2026</p>
                          <p className="mt-1 text-xs text-slate-400">DOI: {doiValue || '--'}</p>
                          <p className="mt-3 text-xs text-slate-600 leading-relaxed line-clamp-3">{displayManuscript.abstract}</p>
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => setShowPreviewModal(true)} className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold px-4 py-2 rounded-xl">View Article Preview</button>
                            <button disabled={!uploadedUrl} onClick={() => window.open(uploadedUrl!, '_blank')} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-[11px] font-semibold px-4 py-2 rounded-xl">View PDF</button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP 4: FINAL PUBLICATION CHECK */}
                    {wizardStep === 3 && (
                      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Publication Details</p>
                            <button onClick={() => setEditingDetails((v) => !v)} className="text-[11px] font-semibold text-[#008751] hover:underline">
                              {editingDetails ? 'Done Editing' : 'Edit Details'}
                            </button>
                          </div>
                          {editingDetails ? (
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">Volume</label>
                                <input value={volume} onChange={(e) => setVolume(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#008751]" />
                              </div>
                              <div>
                                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">Issue</label>
                                <input value={issue} onChange={(e) => setIssue(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#008751]" />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-1">DOI</label>
                                <div className="flex gap-2">
                                  <input value={doiValue} onChange={(e) => setDoiValue(e.target.value)} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#008751]" />
                                  <button onClick={() => setDoiValue(suggestDoi(displayManuscript.id))} className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold px-3 py-2 rounded-lg flex items-center gap-1 shrink-0"><Hash className="w-3.5 h-3.5" /> Auto Generate</button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Volume</p><p className="font-semibold text-slate-800">{volume}</p></div>
                              <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Issue</p><p className="font-semibold text-slate-800">{issue}</p></div>
                              <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Article Type</p><p className="font-semibold text-slate-800">{displayManuscript.manuscript_type || 'Research Article'}</p></div>
                              <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Section</p><p className="font-semibold text-slate-800">{displayManuscript.section || '--'}</p></div>
                              <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">DOI</p><p className="font-semibold text-slate-800">{doiValue || '--'}</p></div>
                              <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Online Publication Date</p><p className="font-semibold text-slate-800">{formatDate(new Date().toISOString())} (on publish)</p></div>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4">Final Publication Check</p>
                          <div className="grid sm:grid-cols-2 gap-3 text-sm mb-4">
                            <CheckRow ok={pdfUploaded} label="Final PDF uploaded" />
                            <CheckRow ok={pdfStructureOk} label="PDF validation passed" />
                            <CheckRow ok={metadataComplete} label="Article metadata verified" />
                            <CheckRow ok={doiAssigned} label="DOI assigned" />
                            <CheckRow ok={volumeIssueAssigned} label="Volume and issue assigned" />
                            <CheckRow ok={websiteReady} label="Website article page ready" />
                          </div>

                          {readyToPublish ? (
                            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 font-semibold flex items-center gap-2 mb-4">
                              <CheckCircle2 className="w-4 h-4" /> All publication requirements have been completed.
                            </div>
                          ) : (
                            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 font-semibold flex items-center gap-2 mb-4">
                              <AlertTriangle className="w-4 h-4" /> Complete the remaining checks above before publishing.
                            </div>
                          )}

                          <div className="flex justify-end">
                            <button
                              disabled={!readyToPublish}
                              onClick={() => setShowConfirm(true)}
                              className="bg-[#008751] hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-wide px-8 py-3.5 rounded-xl shadow-md"
                            >
                              Publish Article Live
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* WIZARD NAV */}
                    {wizardStep < 3 && (
                      <div className="flex items-center justify-between">
                        <button
                          onClick={goBack}
                          disabled={wizardStep === 0}
                          className="inline-flex items-center gap-1.5 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold px-5 py-2.5 rounded-xl"
                        >
                          <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                        <button
                          onClick={goNext}
                          disabled={!wizardStepValid[wizardStep]}
                          className="inline-flex items-center gap-1.5 bg-[#008751] hover:bg-[#007043] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm"
                        >
                          Next <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* POST-PUBLICATION STATE */}
                {displayManuscript.status === 'PUBLISHED' && (
                  <div className="space-y-6">
                    <button
                      onClick={() => { setFocusedId(null); setActiveTab('PUBLISHED'); }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"
                    >
                      <ChevronLeft className="w-4 h-4" /> Back to Published Articles
                    </button>
                    <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5" /> Published Live
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4 text-sm">
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Published Date</p><p className="font-semibold text-slate-800">{formatDate(displayManuscript.published_at)}</p></div>
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Publication Timestamp</p><p className="font-semibold text-slate-800">{formatTimestamp(displayManuscript.published_at)}</p></div>
                        <div className="sm:col-span-2"><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Public Article URL</p><p className="font-semibold text-slate-800 break-all">{publicUrl}</p></div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button onClick={() => window.open(publicUrl, '_blank')} className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> View Live Article</button>
                        {displayManuscript.published_pdf_url && (
                          <button onClick={() => window.open(displayManuscript.published_pdf_url!, '_blank')} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-semibold px-4 py-2 rounded-xl">View Published PDF</button>
                        )}
                        <button onClick={() => handleCopyUrl(publicUrl)} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy Public URL'}</button>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4">Article Summary</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Article Type</p><p className="font-semibold text-slate-800">{displayManuscript.manuscript_type || 'Research Article'}</p></div>
                        <div className="col-span-2"><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Authors</p><p className="font-semibold text-slate-800">{authorsLabel}</p></div>
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Journal</p><p className="font-semibold text-slate-800">{JOURNAL_NAME}</p></div>
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Volume</p><p className="font-semibold text-slate-800">Volume {displayManuscript.volume}</p></div>
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Issue</p><p className="font-semibold text-slate-800">Issue {displayManuscript.issue}</p></div>
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Section</p><p className="font-semibold text-slate-800">{displayManuscript.section || '--'}</p></div>
                        <div><p className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">DOI</p><p className="font-semibold text-slate-800">{displayManuscript.doi}</p></div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4 flex items-center gap-2"><UserCheck className="w-3.5 h-3.5" /> Editor Details</p>
                      {loadingPublishedDetails ? (
                        <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
                      ) : !publishedDetails || publishedDetails.editors.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">No editor assignments recorded.</div>
                      ) : (
                        <div className="space-y-2">
                          {publishedDetails.editors.map((e) => (
                            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-xl px-4 py-2.5 text-sm">
                              <span className="font-semibold text-slate-800">{publishedDetails.profiles[e.editor_id]?.name || 'Unknown editor'}</span>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="uppercase font-semibold">{e.status}</span>
                                {e.recommendation && <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">{e.recommendation}</span>}
                                <span>{formatDate(e.assigned_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Reviewer Details</p>
                      {loadingPublishedDetails ? (
                        <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
                      ) : !publishedDetails || publishedDetails.reviewers.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">No reviewer assignments recorded.</div>
                      ) : (
                        <div className="space-y-2">
                          {publishedDetails.reviewers.map((r) => (
                            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-xl px-4 py-2.5 text-sm">
                              <span className="font-semibold text-slate-800">{publishedDetails.profiles[r.reviewer_id]?.name || 'Unknown reviewer'}</span>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="uppercase font-semibold">{r.status}</span>
                                {r.recommendation && <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">{r.recommendation}</span>}
                                <span>{r.submitted_at ? `Submitted ${formatDate(r.submitted_at)}` : r.due_date ? `Due ${formatDate(r.due_date)}` : formatDate(r.invited_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4 flex items-center gap-2"><FileClock className="w-3.5 h-3.5" /> Revision Details</p>
                      {loadingPublishedDetails ? (
                        <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
                      ) : !publishedDetails || publishedDetails.revisions.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">No revision rounds were requested for this manuscript.</div>
                      ) : (
                        <div className="space-y-2">
                          {publishedDetails.revisions.map((r) => (
                            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-xl px-4 py-2.5 text-sm">
                              <span className="font-semibold text-slate-800">Revision {r.revision_number}{r.decision_type ? ` • ${r.decision_type.replace('_', ' ')}` : ''}</span>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="uppercase font-semibold">{r.status}</span>
                                <span>Requested {formatDate(r.requested_at)}</span>
                                {r.submitted_at && <span>• Submitted {formatDate(r.submitted_at)}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* CONFIRM PUBLISH MODAL */}
      {showConfirm && displayManuscript && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900">Publish Article Live?</h2>
              <button onClick={() => setShowConfirm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-600">This action will make the article publicly available on the journal website together with its final PDF and publication metadata.</p>
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-1">
              <p><span className="text-slate-400">Article: </span><span className="font-semibold text-slate-800">{displayManuscript.title}</span></p>
              <p><span className="text-slate-400">DOI: </span><span className="font-semibold text-slate-800">{doiValue}</span></p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} className="border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2 rounded-xl">Cancel</button>
              <button
                onClick={handleConfirmPublish}
                disabled={publishing}
                className="bg-[#008751] hover:bg-[#007043] disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-xl flex items-center gap-2"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Publish Article
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARTICLE PREVIEW MODAL */}
      {showPreviewModal && displayManuscript && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] uppercase tracking-wide text-[#008751] font-bold">{JOURNAL_NAME}</span>
              <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <h1 className="text-2xl font-black text-slate-900">{displayManuscript.title}</h1>
            <p className="mt-2 text-sm text-slate-500">{authorsLabel}</p>
            <p className="mt-1 text-xs text-slate-400">Volume {leadingNumber(volume)} • Issue {leadingNumber(issue)} • 2026 &nbsp;|&nbsp; DOI: {doiValue}</p>
            <div className="mt-5 pt-5 border-t border-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-bold mb-2">Abstract</p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{displayManuscript.abstract}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ValidationRow({ ok, label, failText, warn }: { ok: boolean; label: string; failText: string; warn?: boolean }) {
  if (ok) {
    return (
      <div className="flex items-center gap-2 text-slate-700">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> {label}
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 ${warn ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
      {warn ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-[11px] opacity-80">{failText}</p>
      </div>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${ok ? 'text-slate-700' : 'text-slate-400'}`}>
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-slate-300 shrink-0" />}
      {label}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">{text}</div>;
}

function PlaceholderScreen({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
      <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-3" />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{text}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function ListRow({ title, meta, onClick, actionLabel }: { title: string; meta: string; onClick: () => void; actionLabel: string }) {
  return (
    <div onClick={onClick} className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-[#008751] hover:bg-emerald-50/20 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{meta}</p>
      </div>
      <span className="text-[11px] font-semibold text-[#008751] shrink-0">{actionLabel}</span>
    </div>
  );
}

function downloadPublishedCsv(published: ManuscriptRow[]) {
  const header = ['Manuscript ID', 'Title', 'DOI', 'Volume', 'Issue', 'Published Date'];
  const rows = published.map((m) => [m.id, m.title, m.doi || '', m.volume || '', m.issue || '', m.published_at || '']);
  const escapeCell = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `published-articles-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
