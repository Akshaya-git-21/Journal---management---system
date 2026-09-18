/** "12 Sep 2026" style formatting for a Review/Editorial Timeline date.
 * Accepts either a bare 'YYYY-MM-DD' (the `date` column type these columns
 * were originally migrated as) or a full timestamp (some environments have
 * this column as `timestamptz` instead, e.g. "2026-09-18 00:00:00+00" --
 * schema drift from what the migrations declare) -- blindly appending
 * 'T00:00:00' to an already-full timestamp produces an unparseable string,
 * so only do that for a bare date. */
export function formatTimelineDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
