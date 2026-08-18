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

  // Real-time updates: parent component (EditorWorkspace) handles Supabase subscriptions
  // and passes updated details prop. Badges and counts recalculate automatically when
  // details changes, ensuring all data stays in sync with database state without
  // requiring additional subscriptions in this component.
  useEffect(() => {
    // Badge calculations run automatically when details prop changes
    // This happens when EditorWorkspace receives real-time updates from Supabase
  }, [details]);

  if (!details) {
    return (
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 p-5 space-y-6 text-left font-sans overflow-y-auto">
        <div className="text-center py-8 text-slate-500">Loading evaluation details...</div>
      </aside>
    );
  }

  const m = details.manuscript;
  const assignment = details.assignment;

  // Calculate badge values from actual data
  const titleAbstractBadge = (m?.title && m?.abstract) ? '✓' : '○';
  const authorsBadge = details.contributors?.length || 0;
  const manuscriptBadge = details.files?.filter(f => f.file_type?.toLowerCase().includes('manuscript')).length || 0;
  const referencesBadge = m?.references ? '✓' : '○';
  const supplementaryBadge = details.files?.filter(f =>
    f.file_type?.toLowerCase().includes('supplementary') ||
    f.file_type?.toLowerCase().includes('additional')
  ).length || 0;
  const coverLetterBadge = details.files?.some(f =>
    f.file_name?.toLowerCase().includes('cover') ||
    f.file_name?.toLowerCase().includes('letter')
  ) ? '✓' : '○';
  const discussionsBadge = details.discussions?.length || 0;

  // Evaluation section badges
  const evaluationBadge = assignment?.assessment_status === 'SUBMITTED' ? '✓' : '○';
  const reviewsBadge = details.reviewers?.length || 0;
  const decisionBadge = assignment?.recommendation ? '✓' : '○';
  const suggestionsBadge = details.suggestedReviewers?.length || 0;
  const reviewHistoryBadge = details.revisions?.length > 0 ? '✓' : '○';

  // Publication section badges
  const metadataBadge = '✓'; // Metadata is typically always present
  const revisionsBadge = details.revisions?.length || 0;
  const productionBadge = m?.production_stage ? '✓' : '○';
  const galleyFilesBadge = details.files?.filter(f =>
    f.file_type?.toLowerCase().includes('galley')
  ).length || 0;

  const SidebarSection = ({ title, items }: any) => (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-[#004d2e] font-mono">
          {title}
        </span>
      </div>
      <nav className="flex flex-col space-y-1">
        {items.map((item: any) => {
          const mappedTab = TAB_MAP[item.id] || item.id;
          const isActive = activeTab === item.id || TAB_MAP[activeTab] === mappedTab;
          return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 ${
              isActive
                ? 'bg-emerald-100/75 text-[#005a36] border-l-[3px] border-[#008751]'
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
        );
        })}
      </nav>
    </div>
  );

  return (
    <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 p-5 space-y-6 text-left font-sans overflow-y-auto">

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
