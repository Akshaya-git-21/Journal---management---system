import React, { useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import TuliticsLogo from './TuliticsLogo';
import NotificationBell from './NotificationBell';
import { SidebarThemeContext } from './sidebarTheme';

/**
 * Presentation-only pieces of the shared workspace shell (sidebar brand and
 * top bar) used by every role. The sidebar group/item styling lives in
 * SidebarNavGroup.tsx.
 */

export function SidebarBrand() {
  const theme = useContext(SidebarThemeContext);
  if (theme === 'light') {
    return (
      <div className="px-5 pt-6 pb-4">
        {/* The original logo image (its white backdrop is multiplied away so it
            sits cleanly on the tinted sidebar), at its natural 200x60 size. */}
        <TuliticsLogo iconSize={53} showText={false} usePng className="-ml-4 [&_img]:mix-blend-multiply" />
      </div>
    );
  }
  return (
    <div className="px-5 pt-6 pb-4">
      <TuliticsLogo iconSize={48} showText={false} usePng />
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  AUTHOR: 'Author',
  EDITOR: 'Editor',
  REVIEWER: 'Reviewer',
  PUBLISHER: 'Publisher',
  COORDINATOR: 'Coordinator',
  GD_MEMBER: 'GD Member',
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function TopBar({ user, onSignOut, left, leading, tinted }: {
  user?: { name: string; role: string } | null;
  onSignOut?: () => void;
  /** Content at the start (left) of the bar, e.g. a page title. */
  left?: React.ReactNode;
  /** Extra controls placed before the bell (e.g. a primary action button). */
  leading?: React.ReactNode;
  /** Soft mint/cream bar (matches the light sidebar) instead of plain white. */
  tinted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const roleLabel = (user?.role && ROLE_LABELS[user.role]) || 'User';

  return (
    <header className={`h-[56px] shrink-0 border-b flex items-center justify-between gap-4 px-6 sticky top-0 z-30 ${tinted ? 'bg-[#e9f4ee]/95 border-[#d9dccb]' : 'bg-white border-[#d8e8e7]'}`}>
      <div className="min-w-0">{left}</div>
      <div className="flex items-center gap-4">
        {leading}
        <NotificationBell dark={false} badgeClassName="bg-emerald-600" />
        <div ref={ref} className="relative">
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-slate-50 cursor-pointer">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#103a2e] text-xs font-bold text-white">{initialsOf(user?.name || '')}</span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-bold text-slate-900">{user?.name || roleLabel}</span>
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
      </div>
    </header>
  );
}

/** Decorative roofline shapes pinned to the bottom of the light sidebar. */
export function SidebarDecoration() {
  return (
    <svg viewBox="0 0 270 120" preserveAspectRatio="xMidYMax slice" className="pointer-events-none mt-auto block h-[110px] w-full shrink-0" aria-hidden="true">
      <polygon points="0,120 0,52 68,12 138,52 138,120" fill="#c3dcc6" />
      <polygon points="150,120 150,56 210,22 270,56 270,120" fill="#a8cbb0" />
      <polygon points="78,120 134,54 192,120" fill="#4b8b62" />
      <polygon points="40,120 92,80 140,120" fill="#8db894" opacity="0.85" />
      <path d="M246 96 l3.5 8 8 3.5 -8 3.5 -3.5 8 -3.5 -8 -8 -3.5 8 -3.5z" fill="#ffffff" opacity="0.75" />
    </svg>
  );
}
