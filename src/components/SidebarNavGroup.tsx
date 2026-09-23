import React, { useContext } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { SidebarThemeContext } from './sidebarTheme';

export const NavGroup: React.FC<{
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  /** True when the currently open page belongs to this group. */
  hasActive?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, expanded, hasActive, onToggle, children }) => {
  const light = useContext(SidebarThemeContext) === 'light';

  if (light) {
    return (
      <div className="border-t border-[#d9dccb] first:border-t-0 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between rounded-xl bg-[#dcebe0] hover:bg-[#d2e5d7] px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#1f4d3a] transition"
        >
          <span className="flex items-center gap-2.5">
            <span>{icon}</span>
            {title}
          </span>
          <ChevronDown className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && <div className="mt-2 space-y-1">{children}</div>}
      </div>
    );
  }

  return (
    <div className="border-t border-[#074235] first:border-t-0 py-3">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-emerald-300 transition ${hasActive ? 'bg-[#0a3f31]' : 'hover:bg-white/5'}`}
      >
        <span className="flex items-center gap-2.5">
          <span className="text-emerald-400">{icon}</span>
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="mt-2 space-y-1">{children}</div>}
    </div>
  );
};

export const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}> = ({ icon, label, active, count, onClick }) => {
  const light = useContext(SidebarThemeContext) === 'light';

  if (light) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition cursor-pointer ${
          active ? 'bg-[#4b8b62] text-white font-bold' : 'text-[#1f3b30] font-medium hover:bg-[#dcebe0]/70'
        }`}
      >
        <span className="flex items-center gap-3">
          <span className={active ? 'text-white' : 'text-[#2d4a3c]'}>{icon}</span>
          <span>{label}</span>
        </span>
        {typeof count === 'number' && count > 0 && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>
            <AlertTriangle className="w-3 h-3" /> {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition cursor-pointer ${
        active ? 'bg-[#a4deb6] text-[#002815] font-bold' : 'text-white/90 font-medium hover:bg-white/5'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={active ? 'text-[#002815]' : 'text-emerald-100/80'}>{icon}</span>
        <span>{label}</span>
      </span>
      {typeof count === 'number' && count > 0 && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-black/10 text-[#002815]' : 'bg-amber-400/20 text-amber-300'}`}>
          <AlertTriangle className="w-3 h-3" /> {count}
        </span>
      )}
    </button>
  );
};
