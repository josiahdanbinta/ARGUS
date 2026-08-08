import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShieldAlert, Clock, Users, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../api/client';

interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  analyst: string;
  assigned_to?: string;
  status?: string;
  created_at?: string;
  closed_at?: string;
  sla: string;
  age: string;
}

interface TimelineEvent {
  type: string;
  desc: string;
  analyst: string;
  time: string;
}

const fallbackTimeline: TimelineEvent[] = [
  { type: 'alert', desc: 'Critical alert: Ransomware detected on WS-102', analyst: 'SIEM', time: '08:00' },
  { type: 'incident', desc: 'Incident INC-2026-145 created', analyst: 'System', time: '08:05' },
  { type: 'note', desc: 'Investigation started, endpoint isolated', analyst: 'J. Smith', time: '08:15' },
  { type: 'action', desc: 'Memory capture completed on WS-102', analyst: 'J. Smith', time: '08:45' },
  { type: 'note', desc: 'Malware sample submitted to sandbox', analyst: 'M. Williams', time: '09:00' },
  { type: 'action', desc: 'C2 IPs blocked at firewall', analyst: 'K. Brown', time: '09:30' },
  { type: 'note', desc: 'Preliminary analysis: Ryuk variant', analyst: 'J. Smith', time: '10:00' },
  { type: 'alert', desc: 'Secondary alert: similar patterns on DB01', analyst: 'SIEM', time: '10:30' },
];

const barColors = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

function mapIncident(raw: any): Incident {
  const created = raw.created_at ? new Date(raw.created_at).getTime() : Date.now();
  const ageMs = Date.now() - created;
  const closed = raw.closed_at && raw.status === 'closed' ? new Date(raw.closed_at).getTime() : null;
  const sla = raw.status === 'closed' ? 'closed' : ageMs > 86400000 ? 'breached' : ageMs > 43200000 ? 'warning' : 'ok';
  return {
    id: raw.id ?? '',
    title: raw.title ?? '',
    severity: raw.severity ?? 'medium',
    analyst: raw.assigned_to ?? '',
    assigned_to: raw.assigned_to ?? '',
    status: raw.status ?? '',
    created_at: raw.created_at ?? '',
    closed_at: raw.closed_at ?? '',
    sla,
    age: closed ? `${Math.max(1, Math.round((closed - created) / 3600000))}h` : ageMs > 86400000 ? `${Math.floor(ageMs / 86400000)}d` : `${Math.max(1, Math.round(ageMs / 3600000))}h`,
  };
}

function mapTimeline(raw: any): TimelineEvent {
  return {
    type: raw.event_type ?? raw.type ?? 'note',
    desc: raw.description ?? raw.title ?? '',
    analyst: raw.user ?? raw.analyst ?? '',
    time: raw.timestamp ? new Date(raw.timestamp).toLocaleTimeString() : (raw.time ?? ''),
  };
}

function formatDuration(ms: number): string {
  const hrs = ms / 3600000;
  if (hrs < 1) return `${Math.round(hrs * 60)}m`;
  return `${hrs.toFixed(1)}h`;
}

export default function SOC() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [unassignedAlerts, setUnassignedAlerts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeline, setTimeline] = useState<TimelineEvent[]>(fallbackTimeline);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [incidentsRes, alertsRes] = await Promise.all([
        api.get('/incidents'),
        api.get('/alerts', { params: { status: 'new' } }),
      ]);
      const incData = incidentsRes.data;
      setIncidents((Array.isArray(incData) ? incData : incData.items ?? []).map(mapIncident));
      const alertsData = alertsRes.data;
      const count = typeof alertsData === 'number'
        ? alertsData
        : Array.isArray(alertsData)
          ? alertsData.length
          : alertsData.total ?? alertsData.count ?? alertsData.items?.length ?? 0;
      setUnassignedAlerts(count);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load SOC data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const res = await api.get('/incidents/INC-2026-145/timeline');
      if (Array.isArray(res.data) && res.data.length > 0) {
        setTimeline(res.data.map(mapTimeline));
      }
    } catch {
      // Keep fallback timeline on error
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchTimeline();
  }, [fetchData, fetchTimeline]);

  const analystWorkload = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((inc) => {
      const key = inc.analyst || inc.assigned_to || 'Unassigned';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, cases]) => ({ name, cases }))
      .sort((a, b) => b.cases - a.cases);
  }, [incidents]);

  const mttrMs = useMemo(() => {
    const closed = incidents.filter(
      (inc) => inc.status === 'closed' && inc.created_at && inc.closed_at,
    );
    if (closed.length === 0) return null;
    const total = closed.reduce(
      (sum, inc) =>
        sum + (new Date(inc.closed_at!).getTime() - new Date(inc.created_at!).getTime()),
      0,
    );
    return total / closed.length;
  }, [incidents]);

  const activeAnalysts = useMemo(() => {
    const unique = new Set(
      incidents
        .map((inc) => inc.analyst || inc.assigned_to)
        .filter(Boolean),
    );
    return unique.size;
  }, [incidents]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SOC</h1>
        <p className="text-gray-400 mt-1">Security Operations Center Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-surface text-danger">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-gray-400 text-sm">Open Incidents</p>
            <p className="text-2xl font-bold">
              {loading ? '...' : incidents.length}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-surface text-orange-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-gray-400 text-sm">Unassigned Alerts</p>
            <p className="text-2xl font-bold">
              {loading ? '...' : unassignedAlerts}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-surface text-argus-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-gray-400 text-sm">MTTR</p>
            <p className="text-2xl font-bold">
              {loading ? '...' : mttrMs != null ? formatDuration(mttrMs) : 'N/A'}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-surface text-green-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-gray-400 text-sm">Analysts Active</p>
            <p className="text-2xl font-bold">
              {loading ? '...' : activeAnalysts}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Case Queue</h2>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading cases...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                <AlertTriangle className="w-8 h-8 text-orange-400" />
                <p>{error}</p>
                <button onClick={fetchData} className="btn-secondary flex items-center gap-2 text-sm">
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              </div>
            ) : incidents.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                No open cases.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-surface-border">
                      <th className="pb-2 font-medium">Case ID</th>
                      <th className="pb-2 font-medium">Title</th>
                      <th className="pb-2 font-medium">Severity</th>
                      <th className="pb-2 font-medium">Analyst</th>
                      <th className="pb-2 font-medium">SLA</th>
                      <th className="pb-2 font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((c) => (
                      <tr key={c.id} className="border-b border-surface-border/50">
                        <td className="py-2.5 font-mono text-xs text-argus-400">{c.id}</td>
                        <td className="py-2.5">{c.title}</td>
                        <td className="py-2.5">
                          <span className={`badge ${c.severity === 'critical' ? 'badge-critical' : c.severity === 'high' ? 'badge-high' : 'badge-medium'}`}>{c.severity}</span>
                        </td>
                        <td className="py-2.5 text-gray-400">{c.analyst || c.assigned_to || '-'}</td>
                        <td className="py-2.5">
                          <span className={`badge ${c.sla === 'breached' ? 'badge-critical' : c.sla === 'warning' ? 'badge-high' : 'badge-success'}`}>{c.sla}</span>
                        </td>
                        <td className="py-2.5 text-gray-400">{c.age}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-argus-400" />Analyst Workload</h2>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : analystWorkload.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
              No analyst data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analystWorkload} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={12} width={80} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                <Bar dataKey="cases" radius={[0, 4, 4, 0]}>
                  {analystWorkload.map((_, i) => <Cell key={i} fill={barColors[i % barColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-argus-400" />Investigation Timeline</h2>
        {timelineLoading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading timeline...
          </div>
        )}
        <div className="space-y-0">
          {timeline.map((event, i) => (
            <div key={i} className="flex gap-4 pb-4 relative">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full mt-1.5 ${event.type === 'alert' ? 'bg-red-500' : event.type === 'incident' ? 'bg-orange-400' : event.type === 'note' ? 'bg-argus-500' : 'bg-green-400'}`} />
                {i < timeline.length - 1 && <div className="w-0.5 flex-1 bg-surface-lighter mt-1" />}
              </div>
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className="badge badge-info text-xs">{event.type}</span>
                  <span className="text-gray-400 text-xs">{event.time}</span>
                </div>
                <p className="text-gray-200 text-sm mt-1">{event.desc}</p>
                <p className="text-gray-500 text-xs">{event.analyst}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
