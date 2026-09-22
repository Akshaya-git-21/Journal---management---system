import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, CheckCircle2, Copy, Eye, KeyRound, Loader2, Lock, Pencil, Power, Trash2, UserPlus, X, XCircle } from 'lucide-react';
import { Role } from '../types';
import { supabase } from '../lib/supabase';
import { getSettings } from '../lib/settings';
import { formatDisplayDate, getDisplayPrefs } from '../lib/displayPrefs';
import {
  AdminMetadata, adminCreateUser, adminDeleteUser, adminResetPassword, adminReviewSignup, adminUpdateUser, generateTemporaryPassword,
} from '../lib/adminUsers';

interface Person {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  requested_role: Role | null;
  status: string;
  created_at: string | null;
  metadata: Record<string, any> | null;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'COORDINATOR', label: 'Coordinator' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'AUTHOR', label: 'Author' },
  { value: 'PUBLISHER', label: 'Publisher' },
  { value: 'GD_MEMBER', label: 'GD Member' },
];
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));
// Mirrors SKIP_FIRST_LOGIN_PASSWORD_CHANGE in src/lib/adminUsersHandler.ts -- these
// roles sign in with the password the Admin set directly, no forced change.
const SKIP_FIRST_LOGIN_PASSWORD_CHANGE: Role[] = ['ADMIN', 'COORDINATOR', 'PUBLISHER', 'GD_MEMBER'];
const EDITORIAL_ROLES = ['Editorial Board', 'Editor-in-Chief', 'Associate Editor', 'Section Editor'];

const TABS: { key: 'ALL' | Role; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'COORDINATOR', label: 'Coordinators' },
  { key: 'EDITOR', label: 'Editors' },
  { key: 'REVIEWER', label: 'Reviewers' },
  { key: 'PUBLISHER', label: 'Publishers' },
  { key: 'GD_MEMBER', label: 'GD Members' },
  { key: 'AUTHOR', label: 'Authors' },
  { key: 'ADMIN', label: 'Admins' },
];

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'PENDING_APPROVAL', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DELETED', label: 'Closed' },
];
const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' },
  INACTIVE: { label: 'Inactive', cls: 'bg-slate-100 text-slate-600' },
  PENDING_APPROVAL: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  REJECTED: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700' },
  DELETED: { label: 'Closed', cls: 'bg-rose-100 text-rose-700' },
};

const effectiveRole = (p: Person): Role => (p.role ?? p.requested_role ?? 'AUTHOR') as Role;

const labelClass = 'block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold';
const fieldClass = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751] disabled:bg-slate-100 disabled:text-slate-500';

function ModalFrame({ eyebrow, title, onClose, busy, children }: { eyebrow: string; title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-[30px] bg-white shadow-2xl border border-slate-200">
        <div className="relative bg-slate-950 px-8 py-6">
          <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">{eyebrow}</div>
          <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
          <button type="button" onClick={busy ? undefined : onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-5 px-8 py-8 bg-slate-50">{children}</div>
      </div>
    </div>
  );
}

const ErrorBox = ({ text }: { text: string | null }) => (text ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{text}</div> : null);

function FormButtons({ busy, submitLabel, onCancel, danger }: { busy: boolean; submitLabel: string; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
      <button type="button" onClick={onCancel} disabled={busy} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
      <button type="submit" disabled={busy} className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white disabled:opacity-60 ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#008751] hover:bg-[#007043]'}`}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {submitLabel}
      </button>
    </div>
  );
}

function RoleDetailFields({ role, meta, setMeta }: { role: Role; meta: AdminMetadata; setMeta: (m: AdminMetadata) => void }) {
  if (role === 'EDITOR') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Editorial board role</label>
          <select className={`${fieldClass} mt-1.5`} value={meta.editorial_role || 'Editorial Board'} onChange={(e) => setMeta({ ...meta, editorial_role: e.target.value })}>
            {[...new Set([meta.editorial_role || 'Editorial Board', ...EDITORIAL_ROLES])].map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Speciality discipline</label>
          <input className={`${fieldClass} mt-1.5`} value={meta.specialization || ''} onChange={(e) => setMeta({ ...meta, specialization: e.target.value })} placeholder="AI in Radiology" />
        </div>
      </div>
    );
  }
  if (role === 'REVIEWER') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Specialty area</label>
        <input className={fieldClass} value={meta.specialization || ''} onChange={(e) => setMeta({ ...meta, specialization: e.target.value })} placeholder="Clinical AI / Machine Learning" />
      </div>
    );
  }
  if (role === 'PUBLISHER') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Organization</label>
        <input className={fieldClass} value={meta.organization || ''} onChange={(e) => setMeta({ ...meta, organization: e.target.value })} placeholder="Springer Nature" />
      </div>
    );
  }
  return null;
}

function PasswordField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const min = Math.max(8, getSettings().access.minPasswordLength);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Temporary password</label>
      <div>
        <div className="flex gap-2">
          <input className={fieldClass} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder="Enter or generate a password" />
          <button type="button" disabled={disabled} onClick={() => onChange(generateTemporaryPassword(min))} className="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Generate</button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">At least {min} characters. They will be asked to choose their own at first sign-in.</p>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: { name: string; email: string; password: string; role: Role }) => void }) {
  const [role, setRole] = useState<Role>('EDITOR');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [meta, setMeta] = useState<AdminMetadata>({});
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Enter a name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    const min = Math.max(8, getSettings().access.minPasswordLength);
    if (password.length < min) { setError(`Password must be at least ${min} characters.`); return; }
    setBusy(true);
    try {
      const { user } = await adminCreateUser({ role, name, email, password, metadata: meta });
      onCreated({ name: user.name, email: user.email, password, role: user.role });
    } catch (err: any) {
      setError(err.message || 'Unable to create the account.');
      setBusy(false);
    }
  };

  return (
    <ModalFrame eyebrow="People" title="Create user" onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-5">
        <ErrorBox text={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Role</label>
          <select className={fieldClass} value={role} onChange={(e) => { setRole(e.target.value as Role); setMeta({}); }} disabled={busy}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Full name</label>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="Dr. Sarah Lin" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Email address</label>
          <input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} placeholder="name@example.com" />
        </div>
        <RoleDetailFields role={role} meta={meta} setMeta={setMeta} />
        <PasswordField value={password} onChange={setPassword} disabled={busy} />
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          No email is sent. The login details are shown once on this dashboard after the account is created.
        </div>
        <FormButtons busy={busy} submitLabel="Create user" onCancel={onClose} />
      </form>
    </ModalFrame>
  );
}

function EditUserModal({ person, isSelf, onClose, onSaved }: { person: Person; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const currentRole = effectiveRole(person);
  const [role, setRole] = useState<Role>(currentRole);
  const [name, setName] = useState(person.name || '');
  const [email, setEmail] = useState(person.email || '');
  const [meta, setMeta] = useState<AdminMetadata>({
    editorial_role: person.metadata?.editorial_role, specialization: person.metadata?.specialization, organization: person.metadata?.organization,
  });
  const manageable = person.status === 'ACTIVE' || person.status === 'INACTIVE';
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(person.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Enter a name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      await adminUpdateUser(person.id, {
        name, email, metadata: meta,
        ...(manageable ? { role, status } : {}),
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Unable to save the changes.');
      setBusy(false);
    }
  };

  return (
    <ModalFrame eyebrow="People" title="Edit user" onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-5">
        <ErrorBox text={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Full name</label>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Email address</label>
          <input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Role</label>
          <div>
            <select className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={busy || isSelf || !manageable}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {isSelf ? 'You cannot change your own role.' : 'A role can only be changed for users with no manuscripts, assignments or reviews.'}
            </p>
          </div>
        </div>
        <RoleDetailFields role={role} meta={meta} setMeta={setMeta} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Status</label>
          <div>
            <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')} disabled={busy || isSelf || !manageable}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            {status === 'INACTIVE' && <p className="mt-1.5 text-[11px] text-rose-600">Inactive users cannot sign in.</p>}
            {isSelf && <p className="mt-1.5 text-[11px] text-slate-400">You cannot deactivate your own account.</p>}
          </div>
        </div>
        <FormButtons busy={busy} submitLabel="Save changes" onCancel={onClose} />
      </form>
    </ModalFrame>
  );
}

/** "Profile" view -- matches the Coordinator's EditorDetailsModal layout
 * (profile summary, contact, account/status, credentials) but covers every
 * Admin-manageable role and hands password reset off to onResetPassword
 * rather than calling the Coordinator-only reset endpoint directly. */
function ProfileModal({ person, onClose, onResetPassword }: { person: Person; onClose: () => void; onResetPassword: () => void }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const role = effectiveRole(person);
  const detailKey = role === 'EDITOR' || role === 'REVIEWER' ? 'specialization' : role === 'PUBLISHER' ? 'organization' : null;
  const detailLabel = role === 'EDITOR' ? 'Speciality discipline' : role === 'REVIEWER' ? 'Specialty area' : role === 'PUBLISHER' ? 'Organization' : null;
  const initials = (person.name || 'UN').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-[#2f7d55] to-[#4b8b62] text-white px-6 py-4 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">{ROLE_LABEL[role]} Details</h2>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-1 rounded transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 font-bold flex items-center justify-center">{initials}</div>
            <div className="flex-1">
              <p className="font-bold text-slate-900">{person.name || 'Unknown'}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">{ROLE_LABEL[role]}</p>
            </div>
          </div>

          <hr className="border-slate-200" />

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest font-bold text-slate-600">Profile</p>
            <div className="bg-slate-50 rounded-xl p-3 space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Name</p>
                <p className="text-sm font-medium text-slate-900 break-words">{person.name || '—'}</p>
              </div>
              {role === 'EDITOR' && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Editorial board role</p>
                  <p className="text-sm font-medium text-slate-900 break-words">{person.metadata?.editorial_role || 'Editorial Board'}</p>
                </div>
              )}
              {detailKey && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{detailLabel}</p>
                  <p className="text-sm font-medium text-slate-900 break-words">{person.metadata?.[detailKey] || '—'}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest font-bold text-slate-600">Contact</p>
            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Email</p>
                  <p className="text-sm font-medium text-slate-900 break-all">{person.email}</p>
                </div>
                <button onClick={() => copyToClipboard(person.email, 'email')} className="ml-2 p-2 hover:bg-slate-100 rounded-lg transition shrink-0" title="Copy email">
                  <Copy className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              {copiedField === 'email' && <p className="text-[10px] text-emerald-600 font-semibold">✓ Copied</p>}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest font-bold text-slate-600">Account</p>
            <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Status:</span>
                <span className={`font-semibold px-2 py-1 rounded-full text-[11px] ${(STATUS_STYLE[person.status] || STATUS_STYLE.ACTIVE).cls}`}>{(STATUS_STYLE[person.status] || { label: person.status }).label}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">User ID:</span>
                <span className="font-mono text-slate-800 truncate">{person.id.slice(0, 8)}...</span>
              </div>
              {person.created_at && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">Joined:</span>
                  <span className="text-slate-800">{formatDisplayDate(person.created_at)}</span>
                </div>
              )}
            </div>
          </div>

          {person.status !== 'DELETED' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-600" />
                <p className="text-xs uppercase tracking-widest font-bold text-slate-600">Login Credentials</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <p className="text-[11px] text-slate-600">Password: <span className="font-mono">••••••••</span></p>
                <p className="text-[10px] text-slate-500">For security reasons, existing passwords cannot be retrieved. You can set a new temporary password for testing access.</p>
              </div>
              <button onClick={onResetPassword} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition">
                Set Temporary Password
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordModal({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: (c: { name: string; email: string; password: string }) => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const min = Math.max(8, getSettings().access.minPasswordLength);
    if (password.length < min) { setError(`Password must be at least ${min} characters.`); return; }
    setBusy(true);
    try {
      await adminResetPassword(person.id, password);
      onDone({ name: person.name, email: person.email, password });
    } catch (err: any) {
      setError(err.message || 'Unable to reset the password.');
      setBusy(false);
    }
  };

  return (
    <ModalFrame eyebrow="People" title="Reset password" onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-5">
        <p className="text-sm text-slate-600">Set a new temporary password for <strong>{person.name || person.email}</strong> ({person.email}). Their old password stops working immediately.</p>
        <ErrorBox text={error} />
        <PasswordField value={password} onChange={setPassword} disabled={busy} />
        <FormButtons busy={busy} submitLabel="Set password" onCancel={onClose} />
      </form>
    </ModalFrame>
  );
}

function ConfirmModal({ title, eyebrow = 'People', children, confirmLabel, danger, onConfirm, onClose }: {
  title: string; eyebrow?: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };
  return (
    <ModalFrame eyebrow={eyebrow} title={title} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-5">
        <div className="text-sm text-slate-600 space-y-2">{children}</div>
        <ErrorBox text={error} />
        <FormButtons busy={busy} submitLabel={confirmLabel} onCancel={onClose} danger={danger} />
      </form>
    </ModalFrame>
  );
}

type SortKey = 'name' | 'email' | 'role' | 'status' | 'created_at';

export default function AdminPeople({ autoOpenCreate, onAutoOpenCreateHandled }: { autoOpenCreate?: boolean; onAutoOpenCreateHandled?: () => void } = {}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [tab, setTab] = useState<'ALL' | Role>('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string; role?: Role; reset?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (autoOpenCreate) { setCreating(true); onAutoOpenCreateHandled?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate]);
  const [viewing, setViewing] = useState<Person | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [resetting, setResetting] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [toggling, setToggling] = useState<Person | null>(null);
  const [rejecting, setRejecting] = useState<Person | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, requested_role, status, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) setLoadError(error.message);
    else { setPeople((data ?? []) as Person[]); setLoadError(null); }
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSelfId(data.user?.id ?? null));
    load();
    const channel = supabase.channel('admin-people-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { load(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: people.length };
    people.forEach((p) => { const r = effectiveRole(p); c[r] = (c[r] || 0) + 1; });
    return c;
  }, [people]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = people.filter((p) => {
      if (tab !== 'ALL' && effectiveRole(p) !== tab) return false;
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      return !q || `${p.name} ${p.email} ${ROLE_LABEL[effectiveRole(p)]}`.toLowerCase().includes(q);
    });
    const value = (p: Person) => sort.key === 'role' ? ROLE_LABEL[effectiveRole(p)] : sort.key === 'created_at' ? (p.created_at || '') : String((p as any)[sort.key] || '').toLowerCase();
    list.sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1));
    return list;
  }, [people, tab, statusFilter, search, sort]);

  const pageSize = getDisplayPrefs().rowsPerPage;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const activePage = Math.min(page, pages);
  const visible = rows.slice((activePage - 1) * pageSize, activePage * pageSize);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'created_at' ? 'desc' : 'asc' }));
  const SortHead = ({ k, children }: { k: SortKey; children: ReactNode }) => (
    <th className="px-4 py-3">
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wider font-bold hover:text-slate-800">
        {children}{sort.key === k && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const flash = (kind: 'ok' | 'error', text: string) => { setNotice({ kind, text }); };
  const copyPassword = async () => {
    if (!credentials) return;
    try { await navigator.clipboard.writeText(credentials.password); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  const approve = async (p: Person, decision: 'APPROVE' | 'REJECT') => {
    setApprovingId(p.id);
    try {
      await adminReviewSignup(p.id, decision);
      flash('ok', decision === 'APPROVE' ? `${p.name || p.email} was approved as ${ROLE_LABEL[effectiveRole(p)]}.` : `${p.name || p.email}'s request was rejected.`);
      await load();
    } catch (err: any) {
      flash('error', err.message || 'Unable to update the request.');
    } finally {
      setApprovingId(null);
    }
  };

  const iconBtn = 'rounded-full p-2 text-slate-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#008751] font-bold">Administration</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">People</h1>
          <p className="text-sm text-slate-500 mt-1">Create, edit, deactivate and remove every account in the journal.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#007043] shrink-0"><UserPlus className="w-4 h-4" /> Create user</button>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      {credentials && (
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black text-slate-900">{credentials.reset ? 'New temporary password' : 'Temporary login'} for {credentials.name || credentials.email}</p>
              <p className="mt-1 text-sm text-slate-600">
                Shown once. Share it securely — {credentials.role && SKIP_FIRST_LOGIN_PASSWORD_CHANGE.includes(credentials.role)
                  ? 'they sign in with this password directly.'
                  : 'they will be asked to choose their own password at first sign-in.'}
              </p>
            </div>
            <button onClick={() => setCredentials(null)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Dismiss</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Email</p>
              <p className="mt-2 font-semibold text-slate-900 break-words">{credentials.email}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Password</p>
                <button onClick={copyPassword} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}</button>
              </div>
              <p className="mt-2 font-semibold text-slate-900 break-words font-mono">{credentials.password}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-3xl px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }} className={`rounded-full px-4 py-2 text-xs font-semibold ${tab === t.key ? 'bg-[#0f766e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t.label} ({counts[t.key] || 0})
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, email or role..." className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 focus:border-[#008751] focus:outline-none" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 focus:border-[#008751] focus:outline-none">
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loadError && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Could not load people: {loadError}. If this is a new setup, run the 0116 SQL in Supabase.</div>}

      <div className="bg-white border border-slate-200 rounded-3xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500">
            <tr>
              <SortHead k="name">Name</SortHead>
              <SortHead k="email">Email</SortHead>
              <SortHead k="role">Role</SortHead>
              <SortHead k="status">Status</SortHead>
              <SortHead k="created_at">Joined</SortHead>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading people...</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No people match these filters.</td></tr>
            ) : visible.map((p) => {
              const role = effectiveRole(p);
              const style = STATUS_STYLE[p.status] || { label: p.status, cls: 'bg-slate-100 text-slate-600' };
              const isSelf = p.id === selfId;
              const closed = p.status === 'DELETED';
              const manageable = p.status === 'ACTIVE' || p.status === 'INACTIVE';
              const adminRequest = p.status === 'PENDING_APPROVAL' && !!p.requested_role;
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3.5 font-semibold text-slate-900">{p.name || '—'}{isSelf && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">You</span>}</td>
                  <td className="px-4 py-3.5 text-slate-600">{p.email}</td>
                  <td className="px-4 py-3.5"><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">{ROLE_LABEL[role]}{p.status === 'PENDING_APPROVAL' && !p.role ? ' (requested)' : ''}</span></td>
                  <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${style.cls}`}>{style.label}</span></td>
                  <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{formatDisplayDate(p.created_at)}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    {adminRequest ? (
                      <span className="inline-flex items-center gap-2">
                        <button onClick={() => approve(p, 'APPROVE')} disabled={approvingId === p.id} className="inline-flex items-center gap-1 rounded-full bg-[#008751] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#007043] disabled:opacity-60"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
                        <button onClick={() => setRejecting(p)} disabled={approvingId === p.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                      </span>
                    ) : closed ? (
                      <span className="text-xs text-slate-400">Closed</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5">
                        <button title="Profile" aria-label={`View ${p.name}`} onClick={() => setViewing(p)} className={`${iconBtn} hover:bg-slate-100 hover:text-slate-900`}><Eye className="h-4 w-4" /></button>
                        <button title="Edit" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)} className={`${iconBtn} hover:bg-emerald-50 hover:text-emerald-700`}><Pencil className="h-4 w-4" /></button>
                        <button title={isSelf ? "You can't delete yourself" : 'Delete'} disabled={isSelf} aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)} className={`${iconBtn} hover:bg-rose-50 hover:text-rose-600`}><Trash2 className="h-4 w-4" /></button>
                        {manageable && (
                          <button title={isSelf ? "You can't deactivate yourself" : p.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} disabled={isSelf} aria-label={p.status === 'ACTIVE' ? `Deactivate ${p.name}` : `Activate ${p.name}`} onClick={() => setToggling(p)} className={`${iconBtn} hover:bg-amber-50 hover:text-amber-700`}><Power className="h-4 w-4" /></button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-600">
            <span>Showing {(activePage - 1) * pageSize + 1} to {Math.min(activePage * pageSize, rows.length)} of {rows.length}</span>
            <span className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(1, activePage - 1))} disabled={activePage === 1} className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium disabled:opacity-50">← Previous</button>
              <span>Page {activePage} of {pages}</span>
              <button onClick={() => setPage(Math.min(pages, activePage + 1))} disabled={activePage === pages} className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium disabled:opacity-50">Next →</button>
            </span>
          </div>
        )}
      </div>

      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); setCredentials(c); flash('ok', `${c.name} was added as ${ROLE_LABEL[c.role]}.`); load(); }} />}
      {viewing && <ProfileModal person={viewing} onClose={() => setViewing(null)} onResetPassword={() => { setResetting(viewing); setViewing(null); }} />}
      {editing && <EditUserModal person={editing} isSelf={editing.id === selfId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); flash('ok', 'Changes saved.'); load(); }} />}
      {resetting && <PasswordModal person={resetting} onClose={() => setResetting(null)} onDone={(c) => { setResetting(null); setCredentials({ ...c, reset: true }); flash('ok', `Password reset for ${c.name || c.email}.`); }} />}
      {toggling && (
        <ConfirmModal
          title={toggling.status === 'ACTIVE' ? 'Deactivate user' : 'Activate user'}
          confirmLabel={toggling.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          danger={toggling.status === 'ACTIVE'}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            await adminUpdateUser(toggling.id, { name: toggling.name, email: toggling.email, status: toggling.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', metadata: {} });
            flash('ok', toggling.status === 'ACTIVE' ? `${toggling.name || toggling.email} was deactivated.` : `${toggling.name || toggling.email} was activated.`);
            setToggling(null);
            await load();
          }}
        >
          <p><strong>{toggling.name || toggling.email}</strong> ({toggling.email})</p>
          <p>{toggling.status === 'ACTIVE' ? 'They will no longer be able to sign in and will see "Account is deactivated". You can reactivate them at any time.' : 'They will be able to sign in again.'}</p>
        </ConfirmModal>
      )}
      {rejecting && (
        <ConfirmModal title="Reject sign-up request" confirmLabel="Reject" danger onClose={() => setRejecting(null)}
          onConfirm={async () => { await adminReviewSignup(rejecting.id, 'REJECT'); flash('ok', `${rejecting.name || rejecting.email}'s request was rejected.`); setRejecting(null); await load(); }}>
          <p><strong>{rejecting.name || rejecting.email}</strong> ({rejecting.email}) asked for {ROLE_LABEL[effectiveRole(rejecting)]} access.</p>
          <p>Rejecting means they cannot sign in.</p>
        </ConfirmModal>
      )}
      {deleting && (
        <ConfirmModal title="Delete user" confirmLabel="Delete" danger onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const { mode } = await adminDeleteUser(deleting.id);
            flash('ok', mode === 'deleted'
              ? `${deleting.name || deleting.email} was deleted.`
              : `${deleting.name || deleting.email} has records in the journal, so the account was closed instead of erased. They can no longer sign in and all their records are kept.`);
            setDeleting(null);
            await load();
          }}>
          <p><strong>{deleting.name || deleting.email}</strong> ({deleting.email}) — {ROLE_LABEL[effectiveRole(deleting)]}</p>
          <p>They will lose access immediately. If they have manuscripts, assignments, reviews or other records, the account is closed instead of erased so those records stay intact; the login then shows "Account not exists".</p>
        </ConfirmModal>
      )}
    </div>
  );
}
