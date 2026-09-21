import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { deleteTeamMember, updateTeamMember } from '../lib/auth';
import { ProfileRow } from '../lib/workflow';

const ROLE_LABELS: Record<string, string> = {
  EDITOR: 'Editor',
  REVIEWER: 'Reviewer',
  PUBLISHER: 'Publisher',
  GD_MEMBER: 'GD Member',
};
const EDITORIAL_ROLES = ['Editorial Board', 'Editor-in-Chief', 'Associate Editor', 'Section Editor'];

/** Edit / Delete icon buttons shared by the Editorial Board, Reviewers,
 * Publishers and GD Members tables. */
export function MemberRowActions({ profile, onEdit, onDelete }: { profile: ProfileRow; onEdit: (p: ProfileRow) => void; onDelete: (p: ProfileRow) => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(profile); }} title="Edit" aria-label={`Edit ${profile.name}`}
        className="rounded-full p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(profile); }} title="Delete" aria-label={`Delete ${profile.name}`}
        className="rounded-full p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}


/** Field labels / placeholders mirror the create ("Invite ...") modals in
 * CoordinatorWorkspace exactly, so Edit and the View page speak the same
 * language as account creation. */
export const MEMBER_FORM: Record<string, {
  eyebrow: string; title: string; nameLabel: string; namePh: string; emailLabel: string; emailPh: string;
  detailKey?: string; detailLabel?: string; detailPh?: string;
}> = {
  EDITOR: { eyebrow: "Board recruitment", title: "Edit editorial member", nameLabel: "Full name", namePh: "Dr. Sarah Lin", emailLabel: "Academic email address", emailPh: "s.lin@stanford.edu", detailKey: "specialization", detailLabel: "Speciality discipline", detailPh: "AI in Radiology" },
  REVIEWER: { eyebrow: "Reviewer outreach", title: "Edit reviewer account", nameLabel: "Reviewer name", namePh: "Dr. Maya Thompson", emailLabel: "Academic email address", emailPh: "reviewer@example.com", detailKey: "specialization", detailLabel: "Specialty area", detailPh: "Clinical AI / Machine Learning" },
  PUBLISHER: { eyebrow: "Publisher outreach", title: "Edit publisher account", nameLabel: "Publisher name", namePh: "Jordan Lee", emailLabel: "Email address", emailPh: "publisher@example.com", detailKey: "organization", detailLabel: "Organization", detailPh: "Springer Nature" },
  GD_MEMBER: { eyebrow: "Production team", title: "Edit GD Member account", nameLabel: "Name", namePh: "Jordan Lee", emailLabel: "Username / Email", emailPh: "gdmember@example.com" },
};
export const EDITORIAL_BOARD_ROLE_LABEL = "Editorial board role";

const labelClass = "block text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold";
const fieldClass = "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#008751]";

export function EditMemberModal({ member, onClose, onSaved }: { member: ProfileRow; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const role = member.role || "";
  const form = MEMBER_FORM[role] || MEMBER_FORM.GD_MEMBER;
  const [name, setName] = useState(member.name || "");
  const [email, setEmail] = useState(member.email || "");
  const [editorialRole, setEditorialRole] = useState<string>(member.metadata?.editorial_role || "Editorial Board");
  const [detail, setDetail] = useState<string>(form.detailKey ? member.metadata?.[form.detailKey] || "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    setSaving(true);
    setError(null);
    try {
      const metadata: Record<string, string> = {};
      if (role === "EDITOR") metadata.editorial_role = editorialRole;
      if (form.detailKey) metadata[form.detailKey] = detail;
      await updateTeamMember(member.id, { name, email, metadata });
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Unable to save changes.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-lg rounded-[30px] overflow-hidden bg-white shadow-2xl border border-slate-200">
        <div className="relative bg-slate-950 px-8 py-6">
          <div className="uppercase tracking-[0.35em] text-xs text-emerald-300 font-semibold">{form.eyebrow}</div>
          <h2 className="mt-3 text-2xl font-black text-white">{form.title}</h2>
          <button type="button" onClick={saving ? undefined : onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-5 px-8 py-8 bg-slate-50">
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>{form.nameLabel}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={form.namePh} disabled={saving} className={fieldClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>{form.emailLabel}</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={form.emailPh} disabled={saving} className={fieldClass} />
          </div>
          {role === "EDITOR" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{EDITORIAL_BOARD_ROLE_LABEL}</label>
                <select value={editorialRole} onChange={(e) => setEditorialRole(e.target.value)} disabled={saving} className={fieldClass}>
                  {[...new Set([editorialRole, ...EDITORIAL_ROLES])].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>{form.detailLabel}</label>
                <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={form.detailPh} disabled={saving} className={fieldClass} />
              </div>
            </div>
          ) : form.detailKey ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>{form.detailLabel}</label>
              <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={form.detailPh} disabled={saving} className={fieldClass} />
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#008751] px-5 py-3 text-sm font-bold text-white hover:bg-[#007043] disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function DeleteMemberModal({ member, onClose, onDeleted }: { member: ProfileRow; onClose: () => void; onDeleted: (mode: 'deleted' | 'deactivated') => void | Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleLabel = ROLE_LABELS[member.role || ''] || 'member';

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      const mode = await deleteTeamMember(member.id);
      await onDeleted(mode);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Unable to delete this member.');
      setDeleting(false);
    }
  };

  return (
    <ModalShell title={`Delete ${roleLabel}`} onClose={deleting ? () => {} : onClose}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl bg-rose-50 border border-rose-100 p-4">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700">
            <p>Delete <strong>{member.name || member.email}</strong> ({member.email})? They will lose access immediately.</p>
            <p className="mt-2 text-xs text-slate-500">If this person already appears in manuscripts, assignments or messages, the account is deactivated instead of erased so that history stays intact. Reassign any work in progress first.</p>
          </div>
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={confirm} disabled={deleting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
          </button>
          <button type="button" onClick={onClose} disabled={deleting} className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
