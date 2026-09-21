import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Journal-wide configuration, stored as one JSON row (see 0114_journal_settings.sql).
 * Coordinators edit it in Settings; the rest of the app reads it through
 * getSettings() / useJournalSettings(). */
export interface JournalSettings {
  workflow: {
    /** Days a submission may wait in the unassigned queue before the dashboard raises an SLA warning. */
    screeningSlaDays: number;
    /** Default length of a review timeline, used to pre-fill the deadline when inviting reviewers. */
    reviewDeadlineDays: number;
  };
  profile: {
    name: string;
    shortName: string;
    issn: string;
    eIssn: string;
    publisher: string;
    contactEmail: string;
    website: string;
    doiPrefix: string;
    language: string;
  };
  access: {
    /** Minimum length for passwords a Coordinator sets when creating a team account. */
    minPasswordLength: number;
  };
}

export const DEFAULT_SETTINGS: JournalSettings = {
  workflow: { screeningSlaDays: 7, reviewDeadlineDays: 21 },
  profile: { name: '', shortName: '', issn: '', eIssn: '', publisher: '', contactEmail: '', website: '', doiPrefix: '', language: 'English' },
  access: { minPasswordLength: 8 },
};

/** Fills anything missing from a stored row with the defaults. */
function merge(stored: any): JournalSettings {
  return {
    workflow: { ...DEFAULT_SETTINGS.workflow, ...(stored?.workflow || {}) },
    profile: { ...DEFAULT_SETTINGS.profile, ...(stored?.profile || {}) },
    access: { ...DEFAULT_SETTINGS.access, ...(stored?.access || {}) },
  };
}

let current: JournalSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getSettings = () => current;

export async function loadSettings(): Promise<JournalSettings> {
  const { data, error } = await supabase.from('journal_settings').select('settings').eq('id', 'main').maybeSingle();
  if (error) throw new Error(error.message);
  current = merge(data?.settings);
  emit();
  return current;
}

export async function saveSettings(next: JournalSettings): Promise<JournalSettings> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('journal_settings').upsert({
    id: 'main',
    settings: next,
    updated_at: new Date().toISOString(),
    updated_by: auth.user?.id ?? null,
  });
  if (error) throw new Error(error.message);
  current = merge(next);
  emit();
  return current;
}

/** Current settings, kept in sync when they are loaded or saved anywhere in the app. */
export function useJournalSettings(): JournalSettings {
  const [settings, setSettings] = useState(current);
  useEffect(() => {
    const listener = () => setSettings(current);
    listeners.add(listener);
    listener();
    return () => { listeners.delete(listener); };
  }, []);
  return settings;
}

/** Start = today, end = today + the default review deadline (YYYY-MM-DD, local time). */
export function defaultReviewTimeline(): { start: string; end: string } {
  const iso = (d: Date) => d.toLocaleDateString('en-CA');
  const start = new Date();
  const end = new Date(start.getTime() + getSettings().workflow.reviewDeadlineDays * 86_400_000);
  return { start: iso(start), end: iso(end) };
}
