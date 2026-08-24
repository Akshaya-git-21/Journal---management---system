import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X, Loader2, CheckCircle, ExternalLink, GripVertical } from 'lucide-react';
import { ReviewerAssignmentRow, ProfileRow, editorSelectReplacementReviewer, getReviewerNeedingReplacement, REPLACEMENT_WINDOW_MS } from '../lib/workflow';
import { supabase } from '../lib/supabase';

interface Props {
  manuscriptId: string;
  manuscriptTitle: string;
  manuscriptStatus: string;
  reviewerAssignments: ReviewerAssignmentRow[];
  onReplacementSelected: () => void;
  /** Opens this manuscript (e.g. from the dashboard, jump into its detail
   * page). When omitted -- e.g. the widget is already showing inside that
   * manuscript's own detail page -- the project name renders as plain
   * highlighted text instead of a link. */
  onOpenManuscript?: () => void;
  /** Index among other stacked alerts (dashboard can show one per manuscript
   * that needs a replacement) -- offsets the default position so they don't
   * overlap. Ignored once the user has dragged this particular widget. */
  stackIndex?: number;
  /** Default left-edge offset in px, before any dragging. The manuscript
   * detail page has a fixed 320px left sidebar the widget should clear by
   * default; the dashboard doesn't. */
  defaultLeftPx?: number;
  /** Reviewers the Editor has already selected as a replacement, awaiting a
   * Coordinator invitation -- once this covers the open slot(s), the alert
   * hides itself (the Editor's part is done). */
  pendingReplacementCount?: number;
}

function formatTimeRemaining(deadline: number): string {
  const ms = deadline - Date.now();
  if (ms <= 0) return 'Deadline expired';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 2) return `Time remaining: ${days} days`;
  if (days === 1) return '1 day remaining';
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return hours <= 6 ? 'Deadline approaching' : `${hours} hours remaining`;
}

const WIDGET_HEIGHT_PX = 260;

export const ReviewerReplacementAlert: React.FC<Props> = ({
  manuscriptId, manuscriptTitle, manuscriptStatus, reviewerAssignments, onReplacementSelected,
  onOpenManuscript, stackIndex = 0, defaultLeftPx = 24, pendingReplacementCount = 0,
}) => {
  const [dismissed, setDismissed] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [reviewers, setReviewers] = useState<ProfileRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [, forceTick] = useState(0);

  // Draggable anywhere on screen -- defaults to the left side, stacked
  // vertically by stackIndex. Once the user drags it, dragPos overrides the
  // default position permanently for this widget instance.
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const mostRecentDecline = getReviewerNeedingReplacement(reviewerAssignments, manuscriptStatus, pendingReplacementCount);
  const needsReplacement = !!mostRecentDecline;

  // Re-render every minute so the countdown stays accurate without a
  // frontend-only timer driving the actual deadline (that's still the DB
  // timestamp -- this just refreshes the display).
  useEffect(() => {
    if (!needsReplacement) return;
    const id = setInterval(() => forceTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, [needsReplacement]);

  useEffect(() => {
    if (mostRecentDecline) setDismissed(false);
  }, [mostRecentDecline?.id]);

  useEffect(() => {
    if (!choosing) return;
    supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('role', 'REVIEWER')
      .eq('status', 'ACTIVE')
      .order('name')
      .then(({ data }) => setReviewers(data || []));
  }, [choosing]);

  const handleDragStart = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      setDragPos({
        x: Math.max(0, Math.min(window.innerWidth - 320, dragState.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragState.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragState.current = null;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!needsReplacement || dismissed) return null;

  const deadline = new Date(mostRecentDecline.responded_at!).getTime() + REPLACEMENT_WINDOW_MS;
  const expired = Date.now() > deadline;

  const handleSubmit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError('');
    try {
      await editorSelectReplacementReviewer(mostRecentDecline.id, selectedId);
      setChoosing(false);
      setSelectedId(null);
      onReplacementSelected();
    } catch (e: any) {
      setError(e.message || 'Failed to select replacement reviewer');
    } finally {
      setSubmitting(false);
    }
  };

  const positionStyle: React.CSSProperties = dragPos
    ? { left: dragPos.x, top: dragPos.y }
    : { left: defaultLeftPx, bottom: 24 + stackIndex * WIDGET_HEIGHT_PX };

  return (
    <div
      ref={containerRef}
      className={`fixed z-40 w-80 bg-white border-2 border-amber-300 rounded-2xl shadow-2xl overflow-hidden ${isDragging ? '' : 'animate-[slideIn_0.3s_ease-out]'}`}
      style={positionStyle}
    >
      <div
        onMouseDown={handleDragStart}
        className="bg-amber-500 px-3 py-3 flex items-center justify-between cursor-move select-none"
        title="Drag to move"
      >
        <div className="flex items-center gap-2 text-white font-black text-sm">
          <GripVertical className="w-4 h-4 opacity-70 shrink-0" />
          <AlertTriangle className="w-4 h-4 shrink-0" /> Reviewer Replacement Required
        </div>
        <button onClick={() => setDismissed(true)} onMouseDown={(e) => e.stopPropagation()} className="text-white/80 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        {onOpenManuscript ? (
          <button
            type="button"
            onClick={onOpenManuscript}
            className="inline-flex items-center gap-1.5 max-w-full text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1.5 rounded-lg underline decoration-amber-500 decoration-2 underline-offset-2 transition"
            title={`Open ${manuscriptTitle}`}
          >
            <span className="truncate">{manuscriptTitle}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </button>
        ) : (
          <span
            className="inline-block max-w-full text-xs font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1.5 rounded-lg truncate"
            title={manuscriptTitle}
          >
            {manuscriptTitle}
          </span>
        )}
        <p className="text-sm text-slate-700">
          {expired
            ? 'The reviewer replacement deadline has expired. The Coordinator will assign a replacement reviewer from the approved Reviewer Board.'
            : 'A selected reviewer has declined the invitation. Please select another reviewer from the approved Reviewer Board.'}
        </p>
        {!expired && (
          <p className="text-xs font-bold text-amber-700">{formatTimeRemaining(deadline)}</p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {choosing ? (
          <div className="space-y-2">
            <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2">
              {reviewers.length === 0 ? (
                <p className="text-xs text-slate-500 py-2 text-center">Loading Reviewer Board...</p>
              ) : (
                reviewers.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition ${
                      selectedId === r.id ? 'bg-emerald-50 border border-emerald-400' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <span>
                      <span className="font-semibold text-slate-900 block">{r.name}</span>
                      <span className="text-slate-500">{r.email}</span>
                    </span>
                    {selectedId === r.id && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setChoosing(false); setSelectedId(null); }}
                disabled={submitting}
                className="flex-1 px-3 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedId || submitting}
                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        ) : (
          !expired && (
            <button
              onClick={() => setChoosing(true)}
              className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition"
            >
              Choose Another Reviewer
            </button>
          )
        )}
      </div>
    </div>
  );
};
