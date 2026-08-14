import { StatusHistoryRow, ProfileRow } from '../../../lib/workflow';
import { Clock } from 'lucide-react';

interface Props {
  statusHistory: StatusHistoryRow[];
  profiles: Record<string, ProfileRow>;
}

export function TimelineTab({ statusHistory, profiles }: Props) {
  if (statusHistory.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <p className="text-slate-600">No timeline events yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className="space-y-1">
        {statusHistory.map((event, idx) => (
          <div key={event.id} className="relative flex gap-4 py-4">
            {/* Timeline connector */}
            {idx < statusHistory.length - 1 && (
              <div className="absolute left-5 top-12 w-0.5 h-12 bg-slate-200"></div>
            )}

            {/* Timeline dot */}
            <div className="flex justify-center">
              <Clock className="w-5 h-5 text-emerald-600 relative z-10" />
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
              <p className="font-bold text-slate-900">{event.status.replace(/_/g, ' ')}</p>
              <p className="text-xs text-slate-600">
                {new Date(event.created_at).toLocaleString()}
              </p>
              {event.actor_id && profiles[event.actor_id] && (
                <p className="text-xs text-slate-600 mt-1">
                  by {profiles[event.actor_id].name}
                </p>
              )}
              {event.notes && (
                <p className="text-sm text-slate-700 mt-1">{event.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
