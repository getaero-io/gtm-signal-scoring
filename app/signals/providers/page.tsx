import { writeQuery } from '@/lib/db-write';

interface ProviderStat {
  source: string;
  total_events: string;
  processed: string;
  failed: string;
  skipped: string;
  rate_limited: string;
  avg_processing_seconds: string | null;
  last_event_at: string;
}

interface ConversationFunnel {
  total: string;
  approved: string;
  sent: string;
  pending: string;
  rejected: string;
  avg_time_to_send_seconds: string | null;
}

interface FailedEvent {
  id: string;
  source: string;
  event_type: string;
  error_message: string | null;
  created_at: string;
}

export const dynamic = 'force-dynamic';

export default async function ProvidersPage() {
  const [providers, funnelRows, recentFailures] = await Promise.all([
    writeQuery<ProviderStat>(`SELECT source,
      COUNT(*) as total_events,
      COUNT(*) FILTER (WHERE status = 'processed') as processed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
      COUNT(*) FILTER (WHERE status = 'rate_limited') as rate_limited,
      ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))
        FILTER (WHERE processed_at IS NOT NULL)::numeric, 2) as avg_processing_seconds,
      MAX(created_at) as last_event_at
    FROM inbound.webhook_events
    GROUP BY source
    ORDER BY total_events DESC`),

    writeQuery<ConversationFunnel>(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status IN ('approved', 'approved_queued')) as approved,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))
        FILTER (WHERE status = 'sent')::numeric, 1) as avg_time_to_send_seconds
    FROM inbound.conversations`),

    writeQuery<FailedEvent>(`SELECT id, source, event_type, error_message, created_at
      FROM inbound.webhook_events
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT 15`),
  ]);

  const funnel = funnelRows[0] ?? {
    total: '0', approved: '0', sent: '0', pending: '0', rejected: '0',
    avg_time_to_send_seconds: null,
  };

  const totalConversations = Number(funnel.total);
  const rejectionRate = totalConversations > 0
    ? ((Number(funnel.rejected) / totalConversations) * 100).toFixed(1)
    : '0';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 -mx-4 -my-6 px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Provider Performance</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Webhook event processing and conversation funnel metrics
          </p>
        </div>

        {/* Provider Stats Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold">Webhook Events by Provider</h2>
          </div>
          {providers.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">
              No webhook events recorded yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="text-right px-4 py-2">Processed</th>
                  <th className="text-right px-4 py-2">Failed</th>
                  <th className="text-right px-4 py-2">Skipped</th>
                  <th className="text-right px-4 py-2">Rate Limited</th>
                  <th className="text-right px-4 py-2">Avg Time (s)</th>
                  <th className="text-right px-4 py-2">Last Event</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const total = Number(p.total_events);
                  const successRate = total > 0
                    ? ((Number(p.processed) / total) * 100).toFixed(0)
                    : '—';
                  const lastEvent = p.last_event_at
                    ? new Date(p.last_event_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })
                    : '—';

                  return (
                    <tr key={p.source} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-4 py-2.5 font-mono text-zinc-300">{p.source}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{p.total_events}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-400">
                        {p.processed} <span className="text-zinc-600 text-xs">({successRate}%)</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-400">{p.failed}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-500">{p.skipped}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-400">{p.rate_limited}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-400">
                        {p.avg_processing_seconds ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">{lastEvent}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Conversation Funnel */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold">Conversation Funnel</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <FunnelCard label="Total" value={funnel.total} />
              <FunnelCard label="Pending" value={funnel.pending} color="amber" />
              <FunnelCard label="Approved" value={funnel.approved} color="emerald" />
              <FunnelCard label="Sent" value={funnel.sent} color="emerald" />
              <FunnelCard label="Rejected" value={funnel.rejected} color="red" />
            </div>
            <div className="mt-4 flex items-center gap-6 text-xs text-zinc-500">
              <span>
                Rejection rate:{' '}
                <span className={Number(rejectionRate) > 20 ? 'text-red-400' : 'text-zinc-300'}>
                  {rejectionRate}%
                </span>
              </span>
              {funnel.avg_time_to_send_seconds && (
                <span>
                  Avg time to send:{' '}
                  <span className="text-zinc-300">
                    {formatDuration(Number(funnel.avg_time_to_send_seconds))}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Recent Failed Events */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold">Recent Failed Events</h2>
          </div>
          {recentFailures.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">
              No failed events. All clear.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-left px-4 py-2">Event Type</th>
                  <th className="text-left px-4 py-2">Error</th>
                  <th className="text-right px-4 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentFailures.map((e) => (
                  <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2.5 font-mono text-zinc-300">{e.source}</td>
                    <td className="px-4 py-2.5 font-mono text-zinc-400">{e.event_type}</td>
                    <td className="px-4 py-2.5 text-red-400 text-xs truncate max-w-xs">
                      {e.error_message ?? '(no message)'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">
                      {new Date(e.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'emerald'
    ? 'text-emerald-400'
    : color === 'red'
    ? 'text-red-400'
    : color === 'amber'
    ? 'text-amber-400'
    : 'text-zinc-100';

  return (
    <div className="bg-zinc-800/50 rounded-lg px-4 py-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-mono font-bold mt-1 ${colorClass}`}>{value}</div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
