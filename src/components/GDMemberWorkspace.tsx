import { useState, ReactNode } from 'react';
import { Settings, Printer, Inbox, PackageCheck, FileCheck2, MessageSquareWarning, Send, CheckCircle2, FileText } from 'lucide-react';
import { Role } from '../types';
import { NavGroup, NavItem } from './SidebarNavGroup';
import GDMemberProductionSection, { GDMemberProductionView } from './production/GDMemberProductionSection';
import GDMemberProductionDetail from './production/GDMemberProductionDetail';
import JournalTemplateSection from './production/JournalTemplateSection';

interface GDMemberWorkspaceProps {
  currentUser?: { name: string; email: string; role: Role } | null;
}

/**
 * GD Member (production/copyediting staff) workspace -- Task 3: this role
 * sees ONLY the Production module. No Coordinator/Editor/Reviewer/User-
 * management/Admin nav groups exist here at all (contrast CoordinatorWorkspace,
 * which has Workspace/People/System/Production) -- there is nothing to
 * "restrict" via a route guard because this component never renders those
 * sections in the first place, and App.tsx's role switch (see RequireRole)
 * only ever mounts GDMemberWorkspace for role GD_MEMBER, never
 * CoordinatorWorkspace. Data access is independently enforced server-side:
 * every Production write RPC still hard-checks is_active_coordinator(), and
 * GD_MEMBER's table grants are SELECT-only (0050_gd_member_production_read_access.sql).
 */
export default function GDMemberWorkspace({ currentUser }: GDMemberWorkspaceProps) {
  const [activeView, setActiveView] = useState<GDMemberProductionView>('QUEUE');
  const [expanded, setExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);

  const NAV_ITEMS: { key: GDMemberProductionView; label: string; icon: ReactNode }[] = [
    { key: 'QUEUE', label: 'Production Queue', icon: <Inbox className="w-4 h-4" /> },
    { key: 'FORMATTING', label: 'Formatting', icon: <PackageCheck className="w-4 h-4" /> },
    { key: 'PROOF_PREPARATION', label: 'Proof Preparation', icon: <Send className="w-4 h-4" /> },
    { key: 'CORRECTIONS', label: 'Corrections', icon: <MessageSquareWarning className="w-4 h-4" /> },
    { key: 'FINAL_PROOF', label: 'Final Proof', icon: <FileCheck2 className="w-4 h-4" /> },
    { key: 'READY', label: 'Ready for Publication', icon: <CheckCircle2 className="w-4 h-4" /> },
    { key: 'PUBLISHED', label: 'Published', icon: <CheckCircle2 className="w-4 h-4" /> },
  ];

  return (
    <div id="gd-member-workspace" className="flex-1 min-h-0 bg-[#00170f] text-[#111827] flex flex-col font-sans">
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden min-h-0">
        <aside className="w-full md:w-64 bg-[#00170f] border-r border-[#002116] p-4 shrink-0 text-white overflow-y-auto">
          <div className="space-y-3">
            <div className="rounded-3xl border border-[#00311f] bg-[#001d14] p-4 text-sm text-emerald-100">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-emerald-300 font-bold">
                <Settings className="w-3.5 h-3.5" /> Production Team
              </div>
              <p className="mt-3 text-[12px] text-emerald-200 leading-relaxed">
                Welcome{currentUser?.name ? `, ${currentUser.name}` : ''}. This account is separate from Coordinator, Editor,
                Reviewer, and Publisher accounts and has no Coordinator permissions.
              </p>
            </div>

            <NavGroup title="Production" icon={<Printer className="w-4 h-4" />} expanded={expanded} onToggle={() => setExpanded((v) => !v)}>
              {NAV_ITEMS.map((item) => (
                <NavItem
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  active={activeView === item.key && !selectedId && !showTemplate}
                  onClick={() => { setActiveView(item.key); setSelectedId(null); setShowTemplate(false); }}
                />
              ))}
              <NavItem
                icon={<FileText className="w-4 h-4" />}
                label="PDF Template"
                active={showTemplate}
                onClick={() => { setShowTemplate(true); setSelectedId(null); }}
              />
            </NavGroup>
          </div>
        </aside>

        <div className="flex-1 bg-[#00170f] md:p-3 overflow-hidden flex flex-col min-h-0">
          <main className="flex-1 bg-slate-50 md:rounded-3xl border border-[#002b1d]/20 p-6 md:p-8 overflow-y-auto text-left flex flex-col gap-5">
            {showTemplate ? (
              <JournalTemplateSection canUpload={false} />
            ) : selectedId ? (
              <GDMemberProductionDetail manuscriptId={selectedId} onBack={() => setSelectedId(null)} />
            ) : (
              <GDMemberProductionSection view={activeView} onOpen={setSelectedId} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
