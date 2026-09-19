import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMyNotifications, markNotificationRead, markAllNotificationsRead, NotificationRow } from '../lib/workflow';

/** Fired on `window` when a notification naming a manuscript is clicked --
 * EditorWorkspace/CoordinatorWorkspace listen for this to jump straight to
 * that manuscript (and, where the notification type implies one, a specific
 * tab) instead of leaving the user to hunt for it in their queue. Kept as a
 * plain window event rather than prop-drilling because NotificationBell is
 * mounted by each workspace's top bar, not by a shared parent
 * -- there's no shared state to lift this into without a larger refactor. */
export const JMS_OPEN_MANUSCRIPT_EVENT = 'jms:open-manuscript';
export interface JmsOpenManuscriptDetail { manuscriptId: string; notificationType: string }

/**
 * Minimal read/mark-read UI for the existing workflow_notifications backend.
 * Does not change when/how notifications are generated -- it only surfaces
 * what getMyNotifications()/markNotificationRead() already expose, scoped by
 * the existing RLS (recipient_id = auth.uid()).
 */
// Each mounted bell gets its own realtime channel: a workspace that switches
// between views remounts its bell, and reusing one topic name while the old
// channel is still closing makes supabase-js throw on `.on()` after subscribe.
let bellChannelSeq = 0;

export default function NotificationBell({ dark = true, badgeClassName = 'bg-red-500' }: { dark?: boolean; badgeClassName?: string }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only the most recently started fetch may write state -- marking N
  // notifications read fires N realtime events, and an older, slower fetch
  // finishing last would otherwise put already-read items (and the unread
  // badge) back.
  const loadSeq = useRef(0);
  const load = () => {
    const seq = ++loadSeq.current;
    getMyNotifications()
      .then((rows) => { if (seq === loadSeq.current) setNotifications(rows); })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // Realtime events for one action arrive in a burst -- refetch once.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 150);
    };
    const channel = supabase
      .channel(`workflow-notifications-bell-${++bellChannelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_notifications' }, scheduleLoad)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const handleOpen = async (n: NotificationRow) => {
    if (!n.read_at) {
      try {
        await markNotificationRead(n.id);
        setNotifications((prev) => prev.map((row) => (row.id === n.id ? { ...row, read_at: new Date().toISOString() } : row)));
      } catch {
        // Non-fatal -- leave it unread rather than mislead the user.
      }
    }
    if (n.manuscript_id) {
      window.dispatchEvent(new CustomEvent<JmsOpenManuscriptDetail>(JMS_OPEN_MANUSCRIPT_EVENT, {
        detail: { manuscriptId: n.manuscript_id, notificationType: n.type },
      }));
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            // Opening the panel is "viewing" the notifications -- clear the
            // unread badge immediately (optimistic) instead of requiring
            // the user to click through each one individually.
            if (next && unreadCount > 0) {
              const seenAt = new Date().toISOString();
              setNotifications((prev) => prev.map((row) => (row.read_at ? row : { ...row, read_at: seenAt })));
              markAllNotificationsRead().catch(() => {});
            }
            return next;
          });
        }}
        className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition ${dark ? 'text-emerald-100/80 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full ${badgeClassName} text-white text-[10px] font-bold flex items-center justify-center`}>
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50 text-left">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Notifications</p>
            {unreadCount > 0 && <span className="text-[11px] text-slate-400">{unreadCount} unread</span>}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleOpen(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${!n.read_at ? 'bg-emerald-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className={`text-xs ${!n.read_at ? 'font-bold text-slate-900' : 'font-semibold text-slate-600'}`}>{n.title}</p>
                      {n.body && <p className="text-[11px] text-slate-500 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
