import { StatusHistoryRow, ProfileRow } from '../../../lib/workflow';

interface Props {
  statusHistory: StatusHistoryRow[];
  profiles: Record<string, ProfileRow>;
}

export function HistoryTab({ statusHistory, profiles }: Props) {
  if (statusHistory.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <p className="text-slate-600">No history yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Date & Time</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Actor</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {statusHistory.map((event) => (
              <tr key={event.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-700">
                  {new Date(event.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded">
                    {event.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {event.actor_id ? profiles[event.actor_id]?.name || 'Unknown' : 'System'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {event.notes || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
