import { useEffect, useState, useMemo, useCallback } from 'react';
import { Bell, Filter, Search, AlertTriangle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../../api/client';
import type { Alert, PaginatedResponse } from '../../types';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  informational: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  acknowledged: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  escalated: 'bg-red-500/20 text-red-400 border-red-500/30',
  closed: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<Alert>>('/alerts', {
        params: { page: 1, page_size: 50 },
      });
      setAlerts(data.items ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load alerts';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const displayAlerts = useMemo(() => {
    return alerts
      .filter((a) => severityFilter === 'All' || a.severity === severityFilter.toLowerCase())
      .filter((a) => statusFilter === 'All' || a.status.toLowerCase().replace(' ', '_') === statusFilter.toLowerCase().replace(' ', '_') || a.status.toLowerCase() === statusFilter.toLowerCase())
      .filter((a) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return a.title.toLowerCase().includes(q)
          || (a.source ?? '').toLowerCase().includes(q)
          || (a.hostname ?? '').toLowerCase().includes(q)
          || (a.source_ip ?? '').toLowerCase().includes(q);
      });
  }, [alerts, severityFilter, statusFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-argus-400" />
          <h1 className="text-2xl font-bold text-gray-100">Alerts</h1>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-argus-600/20 text-argus-400 border border-argus-500/30">
            {displayAlerts.length}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-2 bg-surface-light border border-surface-border rounded-lg px-3 py-2 flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search alerts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-argus-500 transition-colors cursor-pointer"
          >
            <option value="All">All Severity</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="Informational">Informational</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-argus-500 transition-colors cursor-pointer"
          >
            <option value="All">All Status</option>
            <option value="New">New</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="Escalated">Escalated</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <AlertCircle className="w-12 h-12 mb-4 text-red-400" />
          <p className="text-lg text-gray-300 mb-1">Failed to load alerts</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchAlerts}
            className="btn-primary inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && displayAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <AlertTriangle className="w-12 h-12 mb-4 text-gray-600" />
          <p className="text-lg">No alerts found</p>
          <p className="text-sm">Try adjusting your filters</p>
        </div>
      ) : null}

      {!loading && !error && displayAlerts.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Hostname</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Source IP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Risk Score</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {displayAlerts.map((alert) => (
                <tr
                  key={alert.id}
                  className="hover:bg-surface-lighter/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${severityColors[alert.severity] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-200 font-medium max-w-xs truncate" title={alert.title}>
                    {alert.title}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{alert.source ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{alert.hostname ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{alert.source_ip ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded ${
                      alert.risk_score >= 80 ? 'bg-red-500/20 text-red-400' :
                      alert.risk_score >= 60 ? 'bg-orange-500/20 text-orange-400' :
                      alert.risk_score >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {alert.risk_score}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border capitalize ${statusColors[alert.status.toLowerCase()] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {alert.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(alert.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
