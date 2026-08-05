import type { ReactNode } from 'react';
import { Role } from '../types';
import { ShieldAlert } from 'lucide-react';

interface RequireRoleProps {
  role: Role | null | undefined;
  allowed: Role[];
  children: ReactNode;
}

/**
 * Single choke point for workspace access. The workspace switch in App.tsx
 * already branches strictly on the authenticated user's own role, so this
 * mainly guards the edge case of a role that isn't ACTIVE for any workspace
 * (e.g. a stale render during sign-out, or a pending-approval account) --
 * rendering a clear message instead of a blank screen.
 */
export default function RequireRole({ role, allowed, children }: RequireRoleProps) {
  if (!role || !allowed.includes(role)) {
    return (
      <div className="flex-grow flex items-center justify-center p-10">
        <div className="max-w-md text-center bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-3">
          <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="font-sans font-black text-slate-900 text-lg">Access Unavailable</h2>
          <p className="text-sm text-slate-500 font-semibold">
            Your account doesn't currently have an active workspace to display. If you registered
            for an Editor, Reviewer, Coordinator, or Publisher role, a Coordinator must approve it first.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
