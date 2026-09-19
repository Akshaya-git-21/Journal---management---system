import React from 'react';

export type StatTone = 'emerald' | 'amber' | 'sky' | 'violet';

const TONES: Record<StatTone, { card: string; tile: string; note: string; track: string; fill: string }> = {
  emerald: { card: 'border-emerald-300 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white', tile: 'bg-emerald-700', note: 'text-emerald-700', track: 'bg-emerald-200', fill: 'bg-emerald-700' },
  amber: { card: 'border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-white', tile: 'bg-amber-500', note: 'text-amber-700', track: 'bg-amber-200', fill: 'bg-[#e16e06]' },
  sky: { card: 'border-sky-300 bg-gradient-to-br from-sky-100 via-sky-50 to-white', tile: 'bg-sky-600', note: 'text-sky-700', track: 'bg-sky-200', fill: 'bg-sky-600' },
  violet: { card: 'border-violet-300 bg-gradient-to-br from-violet-100 via-violet-50 to-white', tile: 'bg-violet-600', note: 'text-violet-700', track: 'bg-violet-200', fill: 'bg-violet-600' },
};

/**
 * Status box shared by every role's dashboard: colored by its status, the
 * status name in bold beside the icon, then the count (and optionally a
 * one-line note and progress bar).
 */
export const StatusStatCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  tone: StatTone;
  note?: string;
  /** 0-100; omit to hide the bar. */
  progress?: number;
}> = ({ title, value, icon, tone, note, progress }) => {
  const t = TONES[tone];
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${t.card}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${t.tile}`}>{icon}</span>
        <h2 className="text-xl font-black leading-tight text-slate-900">{title}</h2>
      </div>
      <p className="mt-4 text-3xl font-black text-slate-900">{value}</p>
      {note && <p className={`mt-2 text-sm ${t.note}`}>{note}</p>}
      {progress !== undefined && (
        <div className={`mt-4 h-1.5 rounded-full ${t.track}`}>
          <div className={`h-1.5 rounded-full ${t.fill}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
};
