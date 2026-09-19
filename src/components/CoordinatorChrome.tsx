import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import TuliticsLogo from './TuliticsLogo';
import NotificationBell from './NotificationBell';

/**
 * Presentation-only pieces of the Coordinator shell (sidebar brand/nav and
 * top bar). Deliberately separate from SidebarNavGroup.tsx, which every other
 * role's sidebar still uses unchanged.
 */

export function CoordinatorBrand() {
  return (
    <div className="px-5 pt-6 pb-5">
      <TuliticsLogo iconSize={48} showText={false} usePng />
      <p className="mt-3 text-[13px] font-semibold leading-snug text-white/90">
        Journal of Artificial Intelligence<br />in Medicine &amp; Public Health
      </p>
    </div>
  );
}

export const CNavGroup: React.FC<{
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  /** True when the currently open page belongs to this group. */
  hasActive?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, expanded, hasActive, onToggle, children }) => (
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

export const CNavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}> = ({ icon, label, active, count, onClick }) => (
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
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-black/10 text-[#002815]' : 'bg-white/10 text-emerald-200'}`}>{count}</span>
    )}
  </button>
);

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function CoordinatorTopBar({ user, onSignOut }: { user?: { name: string; role: string } | null; onSignOut?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const roleLabel = user?.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase().replace(/_/g, ' ') : 'Coordinator';

  return (
    <header className="h-[60px] shrink-0 bg-white border-b border-[#d8e8e7] flex items-center justify-end gap-4 px-6">
      <NotificationBell dark={false} badgeClassName="bg-emerald-600" />
      <div ref={ref} className="relative">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-slate-50 cursor-pointer">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#103a2e] text-xs font-bold text-white">{initialsOf(user?.name || '')}</span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-bold text-slate-900">{user?.name || 'Coordinator'}</span>
            <span className="block text-xs text-slate-500">{roleLabel}</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-50">
            <button
              type="button"
              onClick={() => { setOpen(false); onSignOut?.(); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
