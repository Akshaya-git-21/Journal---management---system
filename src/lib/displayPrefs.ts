/** Per-browser display preferences (date format, time zone, table size). Kept in
 * localStorage -- they are personal to whoever is using this browser, unlike the
 * journal-wide settings in lib/settings.ts. */

export type DateFormat = 'MDY' | 'DMY' | 'ISO';

export interface DisplayPrefs {
  dateFormat: DateFormat;
  /** 'local' (the browser's own zone) or an IANA zone such as 'Asia/Kolkata'. */
  timeZone: string;
  rowsPerPage: number;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = { dateFormat: 'MDY', timeZone: 'local', rowsPerPage: 10 };

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string; example: string }[] = [
  { value: 'MDY', label: 'Month day, year', example: 'Sep 19, 2026' },
  { value: 'DMY', label: 'Day month year', example: '19 Sep 2026' },
  { value: 'ISO', label: 'Year-month-day', example: '2026-09-19' },
];

export const TIME_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'local', label: 'This device (automatic)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Central Europe' },
  { value: 'America/New_York', label: 'US Eastern' },
  { value: 'America/Los_Angeles', label: 'US Pacific' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

const KEY = 'jms.displayPrefs';
/** localStorage key for SLA alerts a Coordinator has swiped away on the dashboard. */
export const SLA_DISMISSED_KEY = 'jms.coordinator.dismissedSlaAlerts';

export function getDisplayPrefs(): DisplayPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      dateFormat: ['MDY', 'DMY', 'ISO'].includes(stored.dateFormat) ? stored.dateFormat : DEFAULT_DISPLAY_PREFS.dateFormat,
      timeZone: typeof stored.timeZone === 'string' && stored.timeZone ? stored.timeZone : DEFAULT_DISPLAY_PREFS.timeZone,
      rowsPerPage: ROWS_PER_PAGE_OPTIONS.includes(stored.rowsPerPage) ? stored.rowsPerPage : DEFAULT_DISPLAY_PREFS.rowsPerPage,
    };
  } catch {
    return DEFAULT_DISPLAY_PREFS;
  }
}

export function setDisplayPrefs(prefs: DisplayPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

/** Intl accepts only real zone names, so 'local' means "leave it out". */
export function zoneOptions(prefs: DisplayPrefs = getDisplayPrefs()): { timeZone?: string } {
  return prefs.timeZone === 'local' ? {} : { timeZone: prefs.timeZone };
}

export function formatDisplayDate(iso: string | null | undefined, prefs: DisplayPrefs = getDisplayPrefs()): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  const zone = zoneOptions(prefs);
  try {
    if (prefs.dateFormat === 'ISO') {
      const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...zone }).formatToParts(d);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      return `${get('year')}-${get('month')}-${get('day')}`;
    }
    if (prefs.dateFormat === 'DMY') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...zone });
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', ...zone });
  } catch {
    return d.toLocaleDateString();
  }
}
