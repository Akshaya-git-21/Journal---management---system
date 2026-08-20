import React, { useState, useEffect } from 'react';
import {
  ChevronDown, Check, FileText, MessageSquare, SquarePen, Printer,
  Layers, Briefcase, AlertCircle, ExternalLink, Users, Clock,
  CheckCircle2, Circle, AlertTriangle, BookOpen, LayoutDashboard,
  BarChart3, Eye
} from 'lucide-react';
import { EditorManuscriptDetails } from '../lib/editorWorkspace';
import { supabase } from '../lib/supabase';

interface EditorEvaluationSidebarProps {
  details: EditorManuscriptDetails | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Map sidebar tab IDs to internal rendering logic
const TAB_MAP: Record<string, string> = {
  'dashboard': 'title',
  'evaluation_timeline': 'title',
  'title_abstract': 'title',
  'authors': 'contributors',
  'manuscript': 'files',
  'references': 'title',
  'supplementary': 'files',
  'cover_letter': 'title',
  'discussions': 'comments',
  'editor_evaluation': 'evaluation',
  'reviews': 'reviews',
  'decision': 'decision',
  'suggestions': 'title',
  'review_history': 'history',
  'metadata': 'title',
  'revisions': 'revisions',
  'production': 'title',
  'galley_files': 'title'
};

export default function EditorEvaluationSidebar({
  details,
  activeTab,
  onTabChange
}: EditorEvaluationSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [localDetails, setLocalDetails] = useState<EditorManuscriptDetails | null>(details);

  // Real-time subscriptions for manuscript data
  useEffect(() => {
    if (!details?.manuscript?.id) return;

    const manuscriptId = details.manuscript.id;

    // Subscribe to manuscript file changes
    const filesChannel = supabase
      .channel(`manuscript-files-${manuscriptId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'manuscript_files',
          filter: `manuscript_id=eq.${manuscriptId}`
        },
        () => {
          // Trigger update
          setLocalDetails(prev => prev ? { ...prev } : null);
        }
      )
      .subscribe();

    // Subscribe to discussions
    const discussionsChannel = supabase
      .channel(`discussions-${manuscriptId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discussion_messages',
          filter: `manuscript_id=eq.${manuscriptId}`
        },
        () => {
          setLocalDetails(prev => prev ? { ...prev } : null);
        }
      )
      .subscribe();

    // Subscribe to revisions
    const revisionsChannel = supabase
      .channel(`revisions-${manuscriptId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'manuscript_revisions',
          filter: `manuscript_id=eq.${manuscriptId}`
        },
        () => {
          setLocalDetails(prev => prev ? { ...prev } : null);
        }
      )
      .subscribe();

    // Subscribe to editor assignments
    const assignmentChannel = supabase
      .channel(`assignment-${manuscriptId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'editor_assignments',
          filter: `manuscript_id=eq.${manuscriptId}`
        },
        () => {
          setLocalDetails(prev => prev ? { ...prev } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(filesChannel);
      supabase.removeChannel(discussionsChannel);
      supabase.removeChannel(revisionsChannel);
      supabase.removeChannel(assignmentChannel);
    };
  }, [details?.manuscript?.id]);

  // Keep local details in sync with prop
  useEffect(() => {
    setLocalDetails(details);
  }, [details]);

  const displayDetails = localDetails || details;

  if (!displayDetails) {
    return (
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 p-5 space-y-6 text-left font-sans overflow-y-auto">
        <div className="text-center py-8 text-slate-500">Loading evaluation details...</div>
      </aside>
    );
  }

  const m = displayDetails.manuscript;
  const assignment = displayDetails.assignment;

  // Calculate badge values from actual data
  const titleAbstractBadge = (m?.title && m?.abstract) ? '✓' : '○';
  const authorsBadge = displayDetails.contributors?.length || 0;
  const manuscriptBadge = displayDetails.files?.filter(f => f.file_type?.toLowerCase().includes('manuscript')).length || 0;
  const referencesBadge = m?.references ? '✓' : '○';
  const supplementaryBadge = displayDetails.files?.filter(f =>
    f.file_type?.toLowerCase().includes('supplementary') ||
    f.file_type?.toLowerCase().includes('additional')
  ).length || 0;
  const coverLetterBadge = displayDetails.files?.some(f =>
    f.file_name?.toLowerCase().includes('cover') ||
    f.file_name?.toLowerCase().includes('letter')
  ) ? '✓' : '○';
  const discussionsBadge = displayDetails.discussions?.length || 0;

  // Evaluation section badges
  const evaluationBadge = assignment?.assessment_status === 'SUBMITTED' ? '✓' : '○';
  const reviewsBadge = displayDetails.reviewers?.length || 0;
  const decisionBadge = assignment?.recommendation ? '✓' : '○';
  const suggestionsBadge = displayDetails.suggestedReviewers?.length || 0;
  const reviewHistoryBadge = displayDetails.revisions?.length > 0 ? '✓' : '○';

  // Publication section badges
  const metadataBadge = '✓'; // Metadata is typically always present
  const revisionsBadge = displayDetails.revisions?.length || 0;
  const productionBadge = m?.production_stage ? '✓' : '○';
  const galleyFilesBadge = displayDetails.files?.filter(f =>
    f.file_type?.toLowerCase().includes('galley')
  ).length || 0;

  const SidebarSection = ({ title, items }: any) => (
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
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                item.badge === '✓'
                  ? 'bg-emerald-100 text-emerald-700'
                  : item.badge === '○'
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 p-5 space-y-8 text-left font-sans overflow-hidden">

      {/* OVERVIEW SECTION */}
      <SidebarSection
        title="OVERVIEW"
        items={[
          {
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard
          },
          {
            id: 'evaluation_timeline',
            label: 'Evaluation Timeline',
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
            icon: FileText,
            badge: titleAbstractBadge
          },
          {
            id: 'authors',
            label: 'Authors / Contributors',
            icon: Users,
            badge: authorsBadge
          },
          {
            id: 'manuscript',
            label: 'Manuscript',
            icon: FileText,
            badge: manuscriptBadge
          },
          {
            id: 'references',
            label: 'References',
            icon: Layers,
            badge: referencesBadge
          },
          {
            id: 'supplementary',
            label: 'Supplementary Files',
            icon: FileText,
            badge: supplementaryBadge
          },
          {
            id: 'cover_letter',
            label: 'Cover Letter',
            icon: SquarePen,
            badge: coverLetterBadge
          },
          {
            id: 'discussions',
            label: 'Discussions',
            icon: MessageSquare,
            badge: discussionsBadge
          }
        ]}
      />

      {/* EVALUATION SECTION */}
      <SidebarSection
        title="EVALUATION"
        items={[
          {
            id: 'editor_evaluation',
            label: 'Editor Evaluation',
            icon: BarChart3,
            badge: evaluationBadge
          },
          {
            id: 'reviews',
            label: 'Reviews',
            icon: Eye,
            badge: reviewsBadge
          },
          {
            id: 'decision',
            label: 'Decision',
            icon: CheckCircle2,
            badge: decisionBadge
          },
          {
            id: 'suggestions',
            label: 'Suggestions',
            icon: Users,
            badge: suggestionsBadge
          },
          {
            id: 'review_history',
            label: 'Review History',
            icon: Clock,
            badge: reviewHistoryBadge
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
            icon: Layers,
            badge: metadataBadge
          },
          {
            id: 'revisions',
            label: 'Revisions',
            icon: SquarePen,
            badge: revisionsBadge
          },
          {
            id: 'production',
            label: 'Production',
            icon: Printer,
            badge: productionBadge
          },
          {
            id: 'galley_files',
            label: 'Galley Files',
            icon: Briefcase,
            badge: galleyFilesBadge
          }
        ]}
      />

      {/* HELP SECTION */}
      <div className="mt-auto pt-4 border-t border-slate-200">
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#008751]" />
            <strong className="text-xs font-bold text-slate-800">Need Help?</strong>
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">
            Editor guidelines and support resources.
          </p>
          <button
            onClick={() => alert("Editor guidelines and support resources.")}
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
