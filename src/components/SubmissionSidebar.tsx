import React from 'react';
import {
  ChevronUp, ChevronDown, Check, FileText, MessageSquare, SquarePen, Printer,
  Globe, Layers, Sliders, Briefcase, AlertCircle, HelpCircle, ExternalLink,
  Users, Clock, CheckCircle2, Circle, AlertTriangle, Plus, BookOpen, LayoutDashboard
} from 'lucide-react';
import { AuthorManuscriptDetails } from '../lib/authorManuscriptDetails';

interface SubmissionSidebarProps {
  manuscript: AuthorManuscriptDetails | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SubmissionSidebar({
  manuscript,
  activeTab,
  onTabChange
}: SubmissionSidebarProps) {

  if (!manuscript) {
    return (
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 p-5 space-y-6 text-left font-sans overflow-y-auto">
        <div className="text-center py-8 text-slate-500">Loading manuscript details...</div>
      </aside>
    );
  }

  const m = manuscript.manuscript;

  // Calculate real state indicators based on actual data
  const getStatus = (status: string | null | undefined) => {
    if (!status) return { label: 'Not started', color: 'bg-slate-100 text-slate-700' };
    const statusMap: Record<string, { label: string; color: string }> = {
      'DRAFT': { label: 'Draft', color: 'bg-yellow-100 text-yellow-700' },
      'SUBMITTED': { label: 'Submitted', color: 'bg-blue-100 text-blue-700' },
      'EDITOR_REVIEW': { label: 'In Review', color: 'bg-purple-100 text-purple-700' },
      'UNDER_REVIEW': { label: 'Under Review', color: 'bg-indigo-100 text-indigo-700' },
      'AWAITING_DECISION': { label: 'Awaiting Decision', color: 'bg-orange-100 text-orange-700' },
      'REVISION_REQUESTED': { label: 'Revision Requested', color: 'bg-amber-100 text-amber-700' },
      'ACCEPTED': { label: 'Accepted', color: 'bg-emerald-100 text-emerald-700' },
      'REJECTED': { label: 'Rejected', color: 'bg-red-100 text-red-700' },
      'PUBLISHED': { label: 'Published', color: 'bg-emerald-100 text-emerald-700' }
    };
    return statusMap[status] || { label: status, color: 'bg-slate-100 text-slate-700' };
  };

  const getStatusIcon = (status: string | null | undefined) => {
    if (!status) return <Circle className="w-3 h-3" />;
    if (['ACCEPTED', 'PUBLISHED'].includes(status)) return <CheckCircle2 className="w-3 h-3" />;
    if (['REVISION_REQUESTED', 'REJECTED'].includes(status)) return <AlertTriangle className="w-3 h-3" />;
    return <Clock className="w-3 h-3" />;
  };

  const currentStatus = getStatus(m?.status);
  const reviewCount = manuscript.reviewerAssignments?.length || 0;
  const editorCount = manuscript.editorAssignments?.filter(e => e.status === 'ACCEPTED').length || 0;

  // File counts - filter by file_type
  const manuscriptFiles = manuscript.files?.filter(f => f.file_type?.toLowerCase().includes('manuscript')) || [];
  const supplementaryFiles = manuscript.files?.filter(f => f.file_type?.toLowerCase().includes('supplementary') || f.file_type?.toLowerCase().includes('additional')) || [];
  const galleryFiles = manuscript.files?.filter(f => f.file_type?.toLowerCase().includes('galley')) || [];

  const SidebarSection = ({ title, icon: Icon, items }: any) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-[#004d2e] font-mono">
          {title}
        </span>
      </div>
      <nav className="flex flex-col space-y-1.5">
        {items.map((item: any) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 ${
              activeTab === item.id
                ? 'bg-emerald-100/75 text-[#005a36]'
                : 'text-slate-700 hover:bg-emerald-50/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {item.icon && <item.icon className="w-4 h-4" />}
              <span>{item.label}</span>
            </div>
            {item.badge !== undefined && (
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-200 text-slate-700">
                {item.badge}
              </span>
            )}
            {item.status && (
              <span className={`text-[10px] px-2 py-1 rounded-full text-center min-w-16 ${item.status.color}`}>
                {item.status.label}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 p-5 space-y-8 text-left font-sans overflow-y-auto">

      {/* OVERVIEW SECTION */}
      <SidebarSection
        title="OVERVIEW"
        items={[
          {
            id: 'overview',
            label: 'Dashboard',
            icon: LayoutDashboard
          },
          {
            id: 'submission_timeline',
            label: 'Submission Timeline',
            icon: Clock
          }
        ]}
      />

      {/* CONTENT SECTION */}
      <SidebarSection
        title="CONTENT"
        items={[
          {
            id: 'title_abstract',
            label: 'Title & Abstract',
            badge: (m?.title && m?.abstract) ? '✓' : '○',
            icon: FileText
          },
          {
            id: 'authors',
            label: 'Authors / Contributors',
            badge: manuscript.contributors?.length || 0,
            icon: Users
          },
          {
            id: 'manuscript',
            label: 'Manuscript',
            badge: manuscriptFiles.length,
            icon: FileText
          },
          {
            id: 'references',
            label: 'References',
            badge: m?.references ? '✓' : '○',
            icon: Sliders
          },
          {
            id: 'supplementary',
            label: 'Supplementary Files',
            badge: supplementaryFiles.length,
            icon: FileText
          },
          {
            id: 'cover_letter',
            label: 'Cover Letter',
            badge: manuscript.files?.some(f => f.file_name?.toLowerCase().includes('cover') || f.file_name?.toLowerCase().includes('letter')) ? '✓' : '○',
            icon: FileText
          },
          {
            id: 'discussions',
            label: 'Discussions',
            badge: manuscript.discussions?.length || 0,
            icon: MessageSquare
          }
        ]}
      />

      {/* PUBLICATION SECTION */}
      <SidebarSection
        title="PUBLICATION"
        items={[
          {
            id: 'metadata',
            label: 'Metadata',
            badge: '✓',
            icon: Layers
          },
          {
            id: 'copyediting',
            label: 'Copyediting',
            badge: m?.status === 'ACCEPTED' ? '→' : '○',
            icon: SquarePen
          },
          {
            id: 'production',
            label: 'Production',
            badge: m?.production_stage ? '✓' : '○',
            icon: Printer
          },
          {
            id: 'galleys',
            label: 'Galley Files',
            badge: galleryFiles.length,
            icon: Briefcase
          },
          {
            id: 'publication_details',
            label: 'Publication Details',
            badge: m?.published_at ? '✓' : '○',
            icon: BookOpen
          }
        ]}
      />

      {/* HELP SECTION */}
      <div className="mt-auto pt-4 border-t border-slate-200">
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#008751]" />
            <strong className="text-xs font-bold text-slate-800">Need Help?</strong>
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">
            View guidelines or contact support for assistance.
          </p>
          <button
            onClick={() => alert("Author guidelines and support resources.")}
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-white hover:bg-emerald-50 border border-slate-300 text-slate-700 text-[11px] font-bold rounded-lg transition"
          >
            <span>Guidelines</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

    </aside>
  );
}
