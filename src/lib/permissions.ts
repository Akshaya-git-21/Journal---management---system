import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { Role } from '../types';

export type ModuleAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'EXPORT';

export interface ModuleDef {
  key: string;
  label: string;
  actions: ModuleAction[];
}

/**
 * Each role's modules, matching that role's existing nav/sections exactly (no
 * screen was renamed or restructured for this) -- and only the actions that
 * module actually has today. See supabase/migrations/0118_module_access_control.sql
 * for the matching seeded defaults.
 */
export const MODULE_CATALOG: Record<Role, ModuleDef[]> = {
  COORDINATOR: [
    { key: 'DASHBOARD', label: 'Dashboard', actions: ['VIEW'] },
    { key: 'MANUSCRIPT_QUEUE', label: 'Manuscript Queue', actions: ['VIEW', 'DELETE'] },
    { key: 'EDITORIAL_BOARD', label: 'Editorial Board', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'] },
    { key: 'REVIEWERS', label: 'Reviewers', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
    { key: 'PUBLISHERS', label: 'Publishers', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
    { key: 'GD_MEMBERS', label: 'GD Members', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
    { key: 'REPORTS', label: 'Reports & Analytics', actions: ['VIEW'] },
    { key: 'SETTINGS', label: 'Settings', actions: ['VIEW', 'EXPORT'] },
    { key: 'AUDIT_TRAIL', label: 'Audit Trail', actions: ['VIEW'] },
  ],
  ADMIN: [
    { key: 'DASHBOARD', label: 'Dashboard', actions: ['VIEW'] },
    { key: 'PEOPLE', label: 'People', actions: ['VIEW'] },
    { key: 'APPROVALS', label: 'Pending Approvals', actions: ['VIEW'] },
    { key: 'ACTIVITY', label: 'Activity', actions: ['VIEW'] },
    { key: 'ACCESS', label: 'Access', actions: ['VIEW'] },
    { key: 'SETTINGS', label: 'Settings', actions: ['VIEW'] },
  ],
  EDITOR: [
    { key: 'SUBMISSIONS', label: 'Submissions', actions: ['VIEW', 'EDIT'] },
    { key: 'REVIEW_STAGES', label: 'Review Stages', actions: ['VIEW', 'EDIT'] },
    { key: 'COPYEDIT_PRODUCTION', label: 'Copyedit & Production', actions: ['VIEW', 'EDIT'] },
  ],
  REVIEWER: [
    { key: 'MY_ASSIGNMENTS', label: 'My Active Assignments', actions: ['VIEW', 'EDIT', 'DELETE'] },
    { key: 'REVIEW_STATUS', label: 'Review Status', actions: ['VIEW'] },
    { key: 'ADDITIONAL_MODULES', label: 'Additional Modules', actions: ['VIEW'] },
  ],
  PUBLISHER: [
    { key: 'SCHEDULED_PUBLICATIONS', label: 'Scheduled Publications', actions: ['VIEW', 'EDIT'] },
    { key: 'PUBLICATION_QUEUE', label: 'Publication Queue', actions: ['VIEW', 'EDIT'] },
    { key: 'PUBLISHED_ARTICLES', label: 'Published Articles', actions: ['VIEW', 'EXPORT'] },
  ],
  GD_MEMBER: [
    { key: 'PRODUCTION', label: 'Production', actions: ['VIEW', 'EDIT'] },
    { key: 'PUBLICATION', label: 'Publication', actions: ['VIEW', 'EDIT'] },
  ],
  AUTHOR: [
    { key: 'MY_SUBMISSIONS', label: 'My Submissions', actions: ['VIEW', 'CREATE', 'EDIT'] },
  ],
};

export type PermissionMatrix = Record<string, Partial<Record<ModuleAction, boolean>>>;

/** Calls the get_my_permissions() RPC and shapes it into a { module: { action: bool } } matrix. */
export async function fetchMyPermissions(): Promise<PermissionMatrix> {
  const { data, error } = await supabase.rpc('get_my_permissions');
  if (error) throw new Error(error.message);
  const matrix: PermissionMatrix = {};
  for (const row of (data ?? []) as { module_key: string; action: ModuleAction; allowed: boolean }[]) {
    if (!matrix[row.module_key]) matrix[row.module_key] = {};
    matrix[row.module_key][row.action] = row.allowed;
  }
  return matrix;
}

interface PermissionsContextValue {
  loading: boolean;
  can: (moduleKey: string, action: ModuleAction) => boolean;
  refresh: () => void;
}

// Admin is exempt (always full access) and unauthenticated screens never
// render permission-gated UI, so `can()` defaults to true until the matrix
// loads for anyone else -- avoids a flash of hidden nav while it fetches.
const PermissionsContext = createContext<PermissionsContextValue>({ loading: false, can: () => true, refresh: () => {} });

export function PermissionsProvider({ role, children }: { role: Role | null | undefined; children: React.ReactNode }) {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!role) { setMatrix(null); setLoading(false); return; }
    setLoading(true);
    try {
      setMatrix(await fetchMyPermissions());
    } catch {
      setMatrix(null); // fall back to "allow" below rather than locking someone out on a transient error
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!role || role === 'ADMIN') return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (cancelled || !uid) return;
      channel = supabase
        .channel(`my-permissions-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_module_permission_overrides', filter: `user_id=eq.${uid}` }, () => { load(); })
        .subscribe();
    });
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [role, load]);

  const can = useCallback((moduleKey: string, action: ModuleAction) => {
    if (role === 'ADMIN') return true;
    if (!matrix) return true; // still loading or failed to load -- don't hide UI on a fetch error
    return matrix[moduleKey]?.[action] === true;
  }, [matrix, role]);

  const value = useMemo(() => ({ loading, can, refresh: load }), [loading, can, load]);

  return React.createElement(PermissionsContext.Provider, { value }, children);
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
