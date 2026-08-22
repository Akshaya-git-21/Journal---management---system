import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMyNotifications, markNotificationRead, NotificationRow } from '../lib/workflow';

/**
 * Minimal read/mark-read UI for the existing workflow_notifications backend.
 * Does not change when/how notifications are generated -- it only surfaces
 * what getMyNotifications()/markNotificationRead() already expose, scoped by
 * the existing RLS (recipient_id = auth.uid()).
 */
export default function NotificationBell({ dark = true }: { dark?: boolean }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = () => {
    getMyNotifications().then(setNotifications).catch(() => {});
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('workflow-notifications-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_notifications' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  const handleMarkRead = async (n: NotificationRow) => {
    if (n.read_at) return;
    try {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((row) => (row.id === n.id ? { ...row, read_at: new Date().toISOString() } : row)));
    } catch {
      // Non-fatal -- leave it unread rather than mislead the user.
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition ${dark ? 'text-emerald-100/80 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
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
                  onClick={() => handleMarkRead(n)}
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
