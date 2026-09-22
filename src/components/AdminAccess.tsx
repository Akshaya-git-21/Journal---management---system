import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { Role } from '../types';
import { supabase } from '../lib/supabase';
import { MODULE_CATALOG, ModuleAction } from '../lib/permissions';

interface Person {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: string;
}

interface RoleDefaultRow {
  module_key: string;
  action: ModuleAction;
  allowed: boolean;
}

interface PermissionRow {
  module_key: string;
  action: ModuleAction;
  role_default: boolean;
  override: boolean | null;
  effective: boolean;
}

const ROLE_ORDER: Role[] = ['ADMIN', 'COORDINATOR', 'EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER', 'AUTHOR'];
const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin', COORDINATOR: 'Coordinator', EDITOR: 'Editor', REVIEWER: 'Reviewer',
  PUBLISHER: 'Publisher', GD_MEMBER: 'GD Member', AUTHOR: 'Author',
};

const ALL_ACTIONS: ModuleAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'];
const ACTION_LABEL: Record<ModuleAction, string> = { VIEW: 'View', CREATE: 'Create', EDIT: 'Edit', DELETE: 'Delete', EXPORT: 'Export' };

/** A shared View/Create/Edit/Delete/Export grid. `applicable` and `checked`/`onToggle`
 * are per-cell so it can render either role defaults or one person's effective access. */
function PermissionGrid({ modules, applicable, checked, custom, saving, onToggle, onReset }: {
  modules: { key: string; label: string; actions: ModuleAction[] }[];
  applicable: (moduleKey: string, action: ModuleAction) => boolean;
  checked: (moduleKey: string, action: ModuleAction) => boolean;
  custom?: (moduleKey: string, action: ModuleAction) => boolean;
  saving: (moduleKey: string, action: ModuleAction) => boolean;
  onToggle: (moduleKey: string, action: ModuleAction, next: boolean) => void;
  onReset?: (moduleKey: string, action: ModuleAction) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm border-separate border-spacing-y-1">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-400">
            <th className="px-3 py-2">Module</th>
            {ALL_ACTIONS.map((a) => <th key={a} className="px-3 py-2 text-center">{ACTION_LABEL[a]}</th>)}
          </tr>
        </thead>
        <tbody>
          {modules.map((mod) => (
            <tr key={mod.key} className="bg-slate-50">
              <td className="px-3 py-2.5 rounded-l-xl font-semibold text-slate-800 whitespace-nowrap">{mod.label}</td>
              {ALL_ACTIONS.map((action, i) => {
                const isApplicable = applicable(mod.key, action);
                const isSaving = saving(mod.key, action);
                const isCustom = custom?.(mod.key, action) ?? false;
                return (
                  <td key={action} className={`px-3 py-2.5 text-center ${i === ALL_ACTIONS.length - 1 ? 'rounded-r-xl' : ''}`}>
                    {!isApplicable ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <div className="inline-flex flex-col items-center gap-0.5">
                        <input
                          type="checkbox"
                          checked={checked(mod.key, action)}
                          disabled={isSaving}
                          onChange={(e) => onToggle(mod.key, action, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-emerald-600 cursor-pointer disabled:opacity-50"
                          aria-label={`${mod.label} ${ACTION_LABEL[action]}`}
                        />
                        {isCustom && onReset && (
                          <button
                            type="button"
                            onClick={() => onReset(mod.key, action)}
                            disabled={isSaving}
                            title="Reset to role default"
                            className="text-[9px] text-amber-600 hover:text-amber-800 inline-flex items-center gap-0.5 disabled:opacity-50"
                          >
                            <RotateCcw className="w-2.5 h-2.5" /> custom
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminAccess() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('COORDINATOR');

  const [roleDefaults, setRoleDefaults] = useState<RoleDefaultRow[] | null>(null);
  const [roleDefaultsLoading, setRoleDefaultsLoading] = useState(false);
  const [roleDefaultsError, setRoleDefaultsError] = useState<string | null>(null);

  const [showPeople, setShowPeople] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Person | null>(null);
  const [rows, setRows] = useState<PermissionRow[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .in('status', ['ACTIVE', 'INACTIVE'])
      .not('role', 'is', null)
      .order('name')
      .limit(5000);
    if (error) setLoadError(error.message);
    else { setPeople((data ?? []) as Person[]); setLoadError(null); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase.channel('admin-access-people-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { load(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadRoleDefaults = async (r: Role) => {
    setRoleDefaultsLoading(true);
    setRoleDefaultsError(null);
    const { data, error } = await supabase.from('role_module_permissions').select('module_key, action, allowed').eq('role', r);
    if (error) setRoleDefaultsError(error.message);
    else setRoleDefaults((data ?? []) as RoleDefaultRow[]);
    setRoleDefaultsLoading(false);
  };

  useEffect(() => {
    if (role === 'ADMIN') { setRoleDefaults(null); return; }
    loadRoleDefaults(role);
    const channel = supabase
      .channel(`admin-access-role-defaults-${role}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_module_permissions', filter: `role=eq.${role}` }, () => { loadRoleDefaults(role); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const loadPermissions = async (person: Person) => {
    setRowsLoading(true);
    setRowsError(null);
    setRows(null);
    const { data, error } = await supabase.rpc('admin_get_user_permissions', { p_user_id: person.id });
    if (error) setRowsError(error.message);
    else setRows((data ?? []) as PermissionRow[]);
    setRowsLoading(false);
  };

  const chooseRole = (r: Role) => { setRole(r); setSearch(''); setSelected(null); setRows(null); setShowPeople(false); };

  const selectPerson = (person: Person) => {
    setSelected(person);
    if (person.role !== 'ADMIN') loadPermissions(person);
    else setRows(null);
  };

  useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`admin-access-overrides-${selected.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_module_permission_overrides', filter: `user_id=eq.${selected.id}` }, () => { loadPermissions(selected); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    people.forEach((p) => { const r = p.role || ''; c[r] = (c[r] || 0) + 1; });
    return c;
  }, [people]);

  const roleMembers = useMemo(() => people.filter((p) => p.role === role), [people, role]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roleMembers;
    return roleMembers.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q));
  }, [roleMembers, search]);

  const roleDefaultFor = (moduleKey: string, action: ModuleAction) => roleDefaults?.find((r) => r.module_key === moduleKey && r.action === action) ?? null;

  const setRoleDefaultCell = async (moduleKey: string, action: ModuleAction, allowed: boolean) => {
    const key = `role:${moduleKey}:${action}`;
    setSavingCell(key);
    try {
      const { error } = await supabase.rpc('admin_set_role_permission', { p_role: role, p_module: moduleKey, p_action: action, p_allowed: allowed });
      if (error) throw new Error(error.message);
      await loadRoleDefaults(role);
    } catch (err: any) {
      setRoleDefaultsError(err.message || 'Unable to save the change.');
    } finally {
      setSavingCell(null);
    }
  };

  const rowFor = (moduleKey: string, action: ModuleAction) => rows?.find((r) => r.module_key === moduleKey && r.action === action) ?? null;

  const setCell = async (moduleKey: string, action: ModuleAction, allowed: boolean) => {
    if (!selected) return;
    const key = `user:${moduleKey}:${action}`;
    setSavingCell(key);
    try {
      const { error } = await supabase.rpc('admin_set_user_permission_override', { p_user_id: selected.id, p_module: moduleKey, p_action: action, p_allowed: allowed });
      if (error) throw new Error(error.message);
      await loadPermissions(selected);
    } catch (err: any) {
      setRowsError(err.message || 'Unable to save the change.');
    } finally {
      setSavingCell(null);
    }
  };

  const clearCell = async (moduleKey: string, action: ModuleAction) => {
    if (!selected) return;
    const key = `user:${moduleKey}:${action}`;
    setSavingCell(key);
    try {
      const { error } = await supabase.rpc('admin_clear_user_permission_override', { p_user_id: selected.id, p_module: moduleKey, p_action: action });
      if (error) throw new Error(error.message);
      await loadPermissions(selected);
    } catch (err: any) {
      setRowsError(err.message || 'Unable to reset the permission.');
    } finally {
      setSavingCell(null);
    }
  };

  const roleModules = MODULE_CATALOG[role] ?? [];
  const personModules = selected ? MODULE_CATALOG[(selected.role || 'AUTHOR') as Role] : [];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Administration</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">Access</h1>
        <p className="mt-1 text-sm text-slate-500">Pick a role and set what everyone with that role can View, Create, Edit, Delete or Export. Only go person-by-person if one specific account needs to be different from the rest of their role.</p>
      </div>

      {loadError && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Could not load people: {loadError}.</div>}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] items-start">
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm divide-y divide-slate-100">
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              onClick={() => chooseRole(r)}
              className={`w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold transition ${role === r ? 'bg-emerald-50 text-[#0a2e22]' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <span>{ROLE_LABEL[r]}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${role === r ? 'bg-[#008751] text-white' : 'bg-slate-100 text-slate-500'}`}>{counts[r] || 0}</span>
            </button>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full py-16 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading...</div>
          ) : selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelected(null); setRows(null); }} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Back">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-lg font-black text-slate-900">{selected.name || selected.email}</h2>
                  <p className="text-xs text-slate-500">{ROLE_LABEL[selected.role || ''] || selected.role} · {selected.email}</p>
                </div>
              </div>

              {selected.role === 'ADMIN' ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                  <ShieldCheck className="w-8 h-8 mb-3 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-700">{selected.name || selected.email} has full access.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">Admin accounts always have full access to every module and cannot be restricted, so the last Admin can never be locked out.</p>
                </div>
              ) : (
                <>
                  {rowsError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{rowsError}</div>}
                  {rowsLoading || !rows ? (
                    <div className="py-10 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading permissions...</div>
                  ) : (
                    <>
                      <PermissionGrid
                        modules={personModules}
                        applicable={(m, a) => personModules.find((x) => x.key === m)?.actions.includes(a) ?? false}
                        checked={(m, a) => rowFor(m, a)?.effective ?? false}
                        custom={(m, a) => rowFor(m, a)?.override !== null && rowFor(m, a)?.override !== undefined}
                        saving={(m, a) => savingCell === `user:${m}:${a}`}
                        onToggle={setCell}
                        onReset={clearCell}
                      />
                      <p className="mt-3 text-[11px] text-slate-400">Checked cells marked "custom" have been changed from {ROLE_LABEL[selected.role || ''] || selected.role}'s normal access for this person only. Click "custom" to reset that cell back to the role default.</p>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-slate-900">{ROLE_LABEL[role]} — default access</h2>
                <p className="text-xs text-slate-500 mt-0.5">Applies to every {ROLE_LABEL[role].toLowerCase()} unless a specific person has an individual override below.</p>
              </div>

              {role === 'ADMIN' ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                  <ShieldCheck className="w-8 h-8 mb-3 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-700">Admins always have full access.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">This role cannot be restricted, so the last Admin can never be locked out.</p>
                </div>
              ) : (
                <>
                  {roleDefaultsError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{roleDefaultsError}</div>}
                  {roleDefaultsLoading || !roleDefaults ? (
                    <div className="py-10 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading role defaults...</div>
                  ) : (
                    <PermissionGrid
                      modules={roleModules}
                      applicable={(m, a) => roleModules.find((x) => x.key === m)?.actions.includes(a) ?? false}
                      checked={(m, a) => roleDefaultFor(m, a)?.allowed ?? false}
                      saving={(m, a) => savingCell === `role:${m}:${a}`}
                      onToggle={setRoleDefaultCell}
                    />
                  )}
                </>
              )}

              {role !== 'ADMIN' && (
                <div className="border-t border-slate-100 pt-5">
                  {!showPeople ? (
                    <button onClick={() => setShowPeople(true)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Users className="w-3.5 h-3.5" /> Set individual access for one person instead
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-900">Individual overrides</p>
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search by name or email..."
                          className="w-full max-w-xs rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 focus:border-[#008751] focus:outline-none"
                        />
                      </div>
                      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden">
                        {filteredMembers.length === 0 ? (
                          <div className="px-4 py-10 text-center text-sm text-slate-400">No {ROLE_LABEL[role].toLowerCase()}s match.</div>
                        ) : filteredMembers.map((p) => (
                          <button key={p.id} onClick={() => selectPerson(p)} className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{p.name || p.email}</p>
                              <p className="text-[11px] text-slate-500">{p.email}</p>
                            </div>
                            {p.status === 'INACTIVE' && <span className="shrink-0 text-[10px] uppercase font-bold text-slate-400">Inactive</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
