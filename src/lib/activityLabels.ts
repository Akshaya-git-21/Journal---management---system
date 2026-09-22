/** Human wording for activity_log rows (see supabase/migrations/0117_activity_log.sql). */
import { MODULE_CATALOG } from './permissions';

/** module_key -> its label, e.g. AUDIT_TRAIL -> "Audit Trail" (see MODULE_CATALOG). */
const MODULE_LABELS: Record<string, string> = {};
Object.values(MODULE_CATALOG).forEach((modules) => modules.forEach((m) => { MODULE_LABELS[m.key] = m.label; }));
const moduleLabel = (key: string) => MODULE_LABELS[key] || humanize(key);

const PERMISSION_ACTION_WORDS: Record<string, string> = { VIEW: 'View', CREATE: 'Create', EDIT: 'Edit', DELETE: 'Delete', EXPORT: 'Export' };

export const CATEGORY_LABELS: Record<string, string> = {
  authentication: 'Authentication',
  user_management: 'User management',
  workflow: 'Workflow',
  system: 'System',
  access_control: 'Access control',
};

export const CATEGORY_STYLES: Record<string, string> = {
  authentication: 'bg-sky-100 text-sky-700',
  user_management: 'bg-violet-100 text-violet-700',
  workflow: 'bg-emerald-100 text-emerald-700',
  system: 'bg-amber-100 text-amber-700',
  access_control: 'bg-teal-100 text-teal-700',
};

/** Known actions, grouped by category (also feeds the Action filter). */
export const ACTIONS_BY_CATEGORY: Record<string, Record<string, string>> = {
  authentication: {
    sign_in: 'Signed in',
    sign_out: 'Signed out',
    sign_in_failed: 'Failed sign-in',
    password_changed: 'Password changed',
    password_reset_requested: 'Password reset requested',
  },
  user_management: {
    user_created: 'User created',
    user_updated: 'User edited',
    user_role_changed: 'Role changed',
    user_email_changed: 'Email changed',
    user_activated: 'User activated',
    user_deactivated: 'User deactivated',
    user_deleted: 'User deleted or closed',
    password_reset: 'Password reset',
    user_signed_up: 'Signed up',
    signup_approved: 'Sign-up approved',
    signup_rejected: 'Sign-up rejected',
  },
  workflow: {
    submit_manuscript: 'Manuscript submitted',
    editor_assigned: 'Editor assigned',
    editor_assignment_accepted: 'Editor accepted assignment',
    editor_assignment_declined: 'Editor declined assignment',
    submit_editor_screening: 'Editor screening submitted',
    submit_editor_assessment: 'Editor evaluation submitted',
    reviewer_invited: 'Reviewer invited',
    reviewer_accepted: 'Reviewer accepted',
    reviewer_declined: 'Reviewer declined',
    review_submitted: 'Review submitted',
    all_reviews_submitted: 'All reviews submitted',
    reviewer_replacement_requested: 'Reviewer replacement requested',
    coordinator_replace_reviewer: 'Reviewer replaced',
    reviewer_reminder_sent: 'Reviewer reminder sent',
    submit_editor_recommendation: 'Editor recommendation submitted',
    publish_decision: 'Editorial decision published',
    revision_requested: 'Revision requested',
    submit_revision: 'Revision submitted',
    start_production: 'Production started',
    send_to_publisher: 'Sent to publisher',
    publisher_accept_assignment: 'Publisher accepted assignment',
    mark_published: 'Marked as published',
    production_publish: 'Published',
    gd_member_publish_article: 'Published by GD member',
    manuscript_deleted: 'Manuscript deleted',
  },
  system: {
    settings_changed: 'Settings changed',
  },
  access_control: {
    role_permission_set: 'Role permission changed',
    permission_override_set: 'Individual permission changed',
    permission_override_cleared: 'Individual permission reset',
  },
};

const FLAT_ACTIONS: Record<string, string> = Object.assign({}, ...Object.values(ACTIONS_BY_CATEGORY));

const ROLE_WORDS: Record<string, string> = {
  ADMIN: 'Admin', COORDINATOR: 'Coordinator', EDITOR: 'Editor', REVIEWER: 'Reviewer', AUTHOR: 'Author', PUBLISHER: 'Publisher', GD_MEMBER: 'GD Member',
};
export const roleWord = (role: string | null | undefined) => (role ? ROLE_WORDS[role] || role : '');

/** "some_snake_case" or "SOME_STATUS" -> "Some snake case". */
export function humanize(code: string): string {
  const text = String(code || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const actionLabel = (code: string) => FLAT_ACTIONS[code] || humanize(code);

/** Best-effort "which module were they last in" -- inferred from their most
 * recent logged action, not a real navigation trail. user_management actions
 * (editing/creating/deleting a team member) go by the target's role; every
 * other action goes by a fixed guess below. Returns null when an action has
 * no clear module (e.g. signing in). */
const ROLE_TO_ROSTER_MODULE: Record<string, string> = {
  EDITOR: 'Editorial Board', REVIEWER: 'Reviewers', PUBLISHER: 'Publishers', GD_MEMBER: 'GD Members',
};
const ACTION_TO_MODULE: Record<string, string> = {
  submit_manuscript: 'Manuscript Queue',
  revision_requested: 'Manuscript Queue',
  submit_revision: 'Manuscript Queue',
  manuscript_deleted: 'Manuscript Queue',
  publish_decision: 'Manuscript Queue',
  editor_assigned: 'Editorial Board',
  editor_assignment_accepted: 'Editorial Board',
  editor_assignment_declined: 'Editorial Board',
  submit_editor_screening: 'Editorial Board',
  submit_editor_assessment: 'Editorial Board',
  submit_editor_recommendation: 'Editorial Board',
  reviewer_invited: 'Reviewers',
  reviewer_accepted: 'Reviewers',
  reviewer_declined: 'Reviewers',
  review_submitted: 'Reviewers',
  all_reviews_submitted: 'Reviewers',
  reviewer_replacement_requested: 'Reviewers',
  coordinator_replace_reviewer: 'Reviewers',
  reviewer_reminder_sent: 'Reviewers',
  send_to_publisher: 'Publishers',
  publisher_accept_assignment: 'Publishers',
  mark_published: 'Publishers',
  start_production: 'GD Members',
  production_publish: 'GD Members',
  gd_member_publish_article: 'GD Members',
  settings_changed: 'Settings',
};

export function inferModule(row: { category?: string | null; action?: string | null; target_role?: string | null }): string | null {
  if (!row.action) return null;
  if (row.category === 'user_management' && row.target_role) return ROLE_TO_ROSTER_MODULE[row.target_role] || null;
  return ACTION_TO_MODULE[row.action] || null;
}

/** True for the access-control detail shape { module, action: VIEW|CREATE|..., allowed?, role? }. */
const isPermissionDetails = (d: Record<string, any> | null | undefined) =>
  !!d && typeof d.module === 'string' && typeof d.action === 'string' && d.action in PERMISSION_ACTION_WORDS;

/** A one-line, human summary for an access-control row, e.g. "Turned off View
 * access to Audit Trail for all Coordinators" -- used in place of the static
 * actionLabel() for the 'access_control' category. Returns null for anything
 * it doesn't recognize, so callers can fall back to actionLabel(). */
export function accessControlHeadline(code: string, details: Record<string, any> | null | undefined): string | null {
  if (!isPermissionDetails(details)) return null;
  const perm = `${PERMISSION_ACTION_WORDS[details!.action]} access to ${moduleLabel(details!.module)}`;
  if (code === 'role_permission_set') {
    return `${details!.allowed ? 'Turned on' : 'Turned off'} ${perm} for all ${roleWord(details!.role)}s`;
  }
  if (code === 'permission_override_set') {
    return `${details!.allowed ? 'Turned on' : 'Turned off'} ${perm} for this person`;
  }
  if (code === 'permission_override_cleared') {
    return `Reset ${perm} to the role default`;
  }
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  role: 'Role',
  status: 'Status',
  specialization: 'Speciality / specialty',
  editorial_role: 'Editorial board role',
  organization: 'Organization',
  'workflow.screeningSlaDays': 'Desk screening SLA (days)',
  'workflow.reviewDeadlineDays': 'Default review deadline (days)',
  'access.minPasswordLength': 'Minimum password length',
  'profile.name': 'Journal name',
  'profile.shortName': 'Short name',
  'profile.issn': 'ISSN',
  'profile.eIssn': 'eISSN',
  'profile.publisher': 'Publisher name',
  'profile.contactEmail': 'Contact email',
  'profile.website': 'Website',
  'profile.doiPrefix': 'DOI prefix',
  'profile.language': 'Default language',
};

const fieldLabel = (key: string) => FIELD_LABELS[key] || humanize(key.split('.').pop() || key);

function valueText(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (key === 'role' || key === 'requested_role') return roleWord(text);
  if (key === 'status' || key === 'from_status' || key === 'to_status' || key === 'recommendation' || key === 'decision_type') return humanize(text);
  return text;
}

export interface DetailLine {
  label: string;
  value: string;
}

/** Turns a row's details JSON into readable lines, old -> new for edits. */
export function detailLines(details: Record<string, any> | null | undefined): DetailLine[] {
  const lines: DetailLine[] = [];
  if (!details) return lines;
  if (isPermissionDetails(details)) {
    if (details.role) lines.push({ label: 'Role', value: roleWord(details.role) });
    lines.push({ label: 'Module', value: moduleLabel(details.module) });
    lines.push({ label: 'Permission', value: PERMISSION_ACTION_WORDS[details.action] });
    if ('allowed' in details) lines.push({ label: 'Access', value: details.allowed ? 'Allowed' : 'Not allowed' });
    return lines;
  }
  const { changes, from_status, to_status, ...rest } = details;
  if (changes && typeof changes === 'object') {
    for (const [key, change] of Object.entries<any>(changes)) {
      const bare = key.split('.').pop() || key;
      lines.push({ label: fieldLabel(key), value: `${valueText(bare, change?.from)} → ${valueText(bare, change?.to)}` });
    }
  }
  if (from_status || to_status) lines.push({ label: 'Status', value: `${from_status ? humanize(from_status) : '(none)'} → ${to_status ? humanize(to_status) : '(none)'}` });
  for (const [key, value] of Object.entries(rest)) {
    if (value === null || value === undefined || value === '' || key === 'title') continue;
    lines.push({ label: humanize(key), value: valueText(key, value) });
  }
  return lines;
}

export const detailSummary = (details: Record<string, any> | null | undefined) =>
  detailLines(details).map((l) => `${l.label}: ${l.value}`).join('; ');
