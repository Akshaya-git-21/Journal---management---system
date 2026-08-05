import { Role } from '../types';
import TuliticsLogo from './TuliticsLogo';
import { LogOut } from 'lucide-react';

interface RoleSelectorProps {
  activeRole: Role;
  unassignedCount: number;
  inReviewCount: number;
  inProductionCount: number;
  loggedInUser?: { name: string; email: string; role: Role } | null;
  onSignOut?: () => void;
}

export default function RoleSelector({ onSignOut }: RoleSelectorProps) {
  return (
    <div id="jms-role-selector-container" className="bg-[#00170f] sticky top-0 z-50">
      <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-8 lg:px-10 py-3 flex items-center justify-between">
        <TuliticsLogo iconSize={32} showText={true} textColorClass="text-white" usePng={true} />
        <button
          onClick={onSignOut}
          className="flex items-center gap-1.5 text-red-400 hover:text-red-300 font-sans text-xs font-bold transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Log Out
        </button>
      </div>
    </div>
  );
}
