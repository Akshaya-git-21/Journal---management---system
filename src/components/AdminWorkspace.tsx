import { useEffect, useState } from 'react';
import { Activity, KeyRound, LayoutDashboard, Settings, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadSettings } from '../lib/settings';
import { SidebarBrand, TopBar } from './RoleChrome';
import { SidebarThemeContext } from './sidebarTheme';
import { NavGroup, NavItem } from './SidebarNavGroup';
import AdminPeople from './AdminPeople';
import AdminPendingApprovals from './AdminPendingApprovals';
import AdminActivity from './AdminActivity';
import AdminAccess from './AdminAccess';
import AdminDashboard from './AdminDashboard';
import AdminSettings from './AdminSettings';

type Section = 'DASHBOARD' | 'PEOPLE' | 'APPROVALS' | 'ACTIVITY' | 'ACCESS' | 'SETTINGS';

interface AdminWorkspaceProps {
  currentUser?: { name: string; email: string; role: string } | null;
  onSignOut?: () => void;
}

export default function AdminWorkspace({ currentUser, onSignOut }: AdminWorkspaceProps) {
  const [section, setSection] = useState<Section>('DASHBOARD');
  const [expanded, setExpanded] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Journal-wide settings (e.g. minimum password length) are used by the forms here.
  useEffect(() => { loadSettings().catch(() => {}); }, []);

  // Live count for the Pending Approvals badge in the sidebar.
  useEffect(() => {
    const refresh = async () => {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL');
      setPendingCount(count ?? 0);
    };
    refresh();
    const channel = supabase.channel('admin-pending-count-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { refresh(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Set by the Dashboard's "Create User" quick action; AdminPeople opens its
  // create modal on mount when this is true, then this clears it so
  // navigating back to People later doesn't reopen it.
  const [peopleAutoCreate, setPeopleAutoCreate] = useState(false);
  const openPeople = (autoCreate?: boolean) => { setPeopleAutoCreate(!!autoCreate); setSection('PEOPLE'); };

  return (
    <div id="admin-workspace" className="flex-1 min-h-0 bg-[#f6fbf9] text-[#111827] flex flex-col font-sans">
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden min-h-0">
        <aside className="w-full md:w-[220px] xl:w-[270px] bg-gradient-to-b from-[#def2ec] via-[#f4f3e8] to-[#e4eedd] border-r border-[#d9dccb] shrink-0 text-[#1f3b30] overflow-y-auto overflow-x-hidden flex flex-col">
          <SidebarThemeContext.Provider value="light">
            <SidebarBrand />
            <div className="px-5 pb-6">
              <NavGroup title="Admin" icon={<ShieldCheck className="w-4 h-4" />} hasActive expanded={expanded} onToggle={() => setExpanded((v) => !v)}>
                <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active={section === 'DASHBOARD'} onClick={() => setSection('DASHBOARD')} />
                <NavItem icon={<Users className="w-4 h-4" />} label="People" active={section === 'PEOPLE'} onClick={() => setSection('PEOPLE')} />
                <NavItem icon={<ShieldCheck className="w-4 h-4" />} label="Pending Approvals" count={pendingCount} alert active={section === 'APPROVALS'} onClick={() => setSection('APPROVALS')} />
                <NavItem icon={<Activity className="w-4 h-4" />} label="Activity" active={section === 'ACTIVITY'} onClick={() => setSection('ACTIVITY')} />
                <NavItem icon={<KeyRound className="w-4 h-4" />} label="Access" active={section === 'ACCESS'} onClick={() => setSection('ACCESS')} />
                <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" active={section === 'SETTINGS'} onClick={() => setSection('SETTINGS')} />
              </NavGroup>
            </div>
          </SidebarThemeContext.Provider>
        </aside>

        <div className="flex-1 min-w-0 bg-gradient-to-b from-[#eaf6f1] via-[#f7f6ec] to-[#eaf2e3] overflow-hidden flex flex-col min-h-0">
          <TopBar user={currentUser} onSignOut={onSignOut} tinted />
          <main className="role-tint flex-1 p-6 md:p-8 overflow-y-auto text-left flex flex-col gap-5">
            {section === 'DASHBOARD' && <AdminDashboard onOpenPeople={openPeople} onOpenApprovals={() => setSection('APPROVALS')} onOpenActivity={() => setSection('ACTIVITY')} onOpenAccess={() => setSection('ACCESS')} />}
            {section === 'PEOPLE' && <AdminPeople autoOpenCreate={peopleAutoCreate} onAutoOpenCreateHandled={() => setPeopleAutoCreate(false)} />}
            {section === 'APPROVALS' && <AdminPendingApprovals />}
            {section === 'ACTIVITY' && <AdminActivity />}
            {section === 'ACCESS' && <AdminAccess />}
            {section === 'SETTINGS' && <AdminSettings />}
          </main>
        </div>
      </div>
    </div>
  );
}
