import React from 'react';
import { ChevronDown } from 'lucide-react';

export const NavGroup: React.FC<{
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, expanded, onToggle, children }) => {
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full bg-white/5 hover:bg-white/10 px-4 py-3 flex items-center justify-between text-xs font-bold text-emerald-300 uppercase tracking-wider transition"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="p-1.5 space-y-1">{children}</div>}
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition cursor-pointer ${
        active ? 'bg-[#008751] text-white font-black' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className="flex items-center gap-2">{icon}<span>{label}</span></span>
      {typeof count === 'number' && count > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-white/10 text-emerald-200'}`}>{count}</span>
      )}
    </button>
  );
};
