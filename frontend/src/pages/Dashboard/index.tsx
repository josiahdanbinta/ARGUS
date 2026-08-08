import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Activity,
  AlertTriangle,
  ShieldAlert,
  Radio,
  Globe,
  TrendingUp,
  Shield,
  Loader2,
  AlertCircle,
  RefreshCw,
  Server,
  FileWarning,
  Flame,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import api from '../../api/client';
import type { DashboardMetrics } from '../../types';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  informational: '#22c55e',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#ef4444',
  new: '#ef4444',
  investigating: '#f59e0b',
  in_progress: '#f59e0b',
  contained: '#3b82f6',
  resolved: '#22c55e',
  closed: '#22c55e',
};

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  to?: string;
  onClick?: () => void;
}

function MetricCard({ icon: Icon, label, value, accent, to, onClick }: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-5 flex items-start gap-4 text-left w-full transition-colors ${
        to || onClick ? 'hover:border-argus-500/50 hover:bg-surface-light cursor-pointer' : 'cursor-default'
      }`}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${accent}1a` }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-gray-100 mt-0.5">{value}</p>
      </div>
    </button>
  );
}

function MetricSkeleton() {
  return (
    <div className="card p-5 flex items-start gap-4 animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-gray-700" />
      <div className="min-w-0 space-y-2 flex-1">
        <div className="h-3 bg-gray-700 rounded w-24" />
        <div className="h-7 bg-gray-700 rounded w-16" />
      </div>
    </div>
  );
}

function ChartTooltip() {
  return {
    contentStyle: {
      backgroundColor: '#1f2937',
      border: '1px solid #374151',
      borderRadius: '8px',
      color: '#f9fafb',
      fontSize: '12px',
    },
  };
}

function severityBadge(sev: string) {
  const color = SEVERITY_COLORS[sev.toLowerCase()] ?? '#6b7280';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="capitalize">{sev}</span>
    </span>
  );
}

function statusBadge(status: string) {
  const color = STATUS_COLORS[status.toLowerCase()] ?? '#6b7280';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="capitalize">{status.replace(/_/g, ' ')}</span>
    </span>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DashboardMetrics>('/dashboard');
      setMetrics((data as any)?.metrics ?? data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MetricSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <AlertCircle className="w-12 h-12 mb-4 text-red-400" />
        <p className="text-lg text-gray-300 mb-1">Failed to load dashboard</p>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button
          onClick={fetchMetrics}
          className="btn-primary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  const alertSeverityData = Object.entries(metrics?.alert_severity ?? {}).map(([severity, count]) => ({
    severity: severity.charAt(0).toUpperCase() + severity.slice(1),
    count,
  }));

  const incidentStatusData = Object.entries(metrics?.incident_status ?? {}).map(([status, value]) => ({
    name: status.replace(/_/g, ' '),
    value,
    color: STATUS_COLORS[status] ?? '#6b7280',
  }));

  const endpointStatusData = Object.entries(metrics?.endpoint_status ?? {}).map(([status, value]) => ({
    name: status,
    value,
  }));

  const tooltipStyle = ChartTooltip();

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Security Operations Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard icon={Zap} label="Total Events" value={metrics?.total_events?.toLocaleString() ?? '--'} accent="#3b82f6" onClick={() => navigate('/siem')} />
          <MetricCard icon={Activity} label="Events/sec" value={metrics?.events_per_second ?? '--'} accent="#22c55e" onClick={() => navigate('/siem')} />
          <MetricCard icon={AlertTriangle} label="Critical Alerts" value={metrics?.critical_alerts ?? '--'} accent="#ef4444" onClick={() => navigate('/alerts')} />
          <MetricCard icon={ShieldAlert} label="Active Incidents" value={metrics?.active_incidents ?? '--'} accent="#f97316" onClick={() => navigate('/incidents')} />
          <MetricCard icon={Radio} label="Endpoints Online" value={metrics?.endpoint_count ?? '--'} accent="#3b82f6" onClick={() => navigate('/assets')} />
          <MetricCard icon={Server} label="Total Assets" value={metrics?.total_assets ?? '--'} accent="#8b5cf6" onClick={() => navigate('/assets')} />
          <MetricCard icon={Globe} label="Threat Feeds" value={metrics?.threat_feed_status ?? '--'} accent="#22c55e" onClick={() => navigate('/threat-intelligence')} />
          <MetricCard icon={TrendingUp} label="Risk Score" value={metrics?.risk_score?.toFixed(1) ?? '--'} accent="#eab308" onClick={() => navigate('/incidents')} />
          <MetricCard icon={FileWarning} label="Total IOC" value={metrics?.total_iocs ?? '--'} accent="#06b6d4" onClick={() => navigate('/threat-intelligence')} />
          <MetricCard icon={Flame} label="Critical IOC" value={metrics?.critical_iocs ?? '--'} accent="#ef4444" onClick={() => navigate('/threat-intelligence')} />
          <MetricCard icon={Shield} label="Open Alerts" value={metrics?.active_alerts ?? '--'} accent="#f97316" onClick={() => navigate('/alerts')} />
          <MetricCard icon={Shield} label="MITRE Coverage" value="87%" accent="#8b5cf6" onClick={() => navigate('/mitre')} />
        </div>
      </section>

      {/* Analytics Charts */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Analytics</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Alert Severity Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={alertSeverityData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                <YAxis type="category" dataKey="severity" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {alertSeverityData.map((entry) => (
                    <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity.toLowerCase()] ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Incident Status Overview</h3>
            {incidentStatusData.length === 0 ? (
              <p className="text-gray-500 text-sm py-16 text-center">No incident data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={incidentStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {incidentStatusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: number, name: string) => [`${value} incidents`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Top Source IPs by Alerts</h3>
            {!metrics?.top_sources?.length ? (
              <p className="text-gray-500 text-sm py-16 text-center">No source data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.top_sources} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                  <YAxis type="category" dataKey="source" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={130} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Top Alert Categories</h3>
            {!metrics?.top_categories?.length ? (
              <p className="text-gray-500 text-sm py-16 text-center">No category data available.</p>
            ) : (
              <div className="space-y-3 py-2">
                {metrics.top_categories.map((cat, i) => {
                  const max = Math.max(...metrics.top_categories.map((c) => c.count));
                  return (
                    <div key={cat.category} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-6 text-right">{i + 1}</span>
                      <span className="text-sm text-gray-300 w-44 truncate">{cat.category}</span>
                      <div className="flex-1 h-2.5 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-argus-500 transition-all"
                          style={{ width: `${(cat.count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-10 text-right">{cat.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Endpoint Health</h3>
            {endpointStatusData.length === 0 ? (
              <p className="text-gray-500 text-sm py-16 text-center">No endpoint data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={endpointStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {endpointStatusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.name === 'online' ? '#22c55e' : entry.name === 'isolated' ? '#ef4444' : entry.name === 'offline' ? '#6b7280' : '#f59e0b'} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Recent Incidents</h3>
            {!metrics?.recent_incidents?.length ? (
              <p className="text-gray-500 text-sm py-16 text-center">No recent incidents.</p>
            ) : (
              <div className="space-y-3 py-1">
                {metrics.recent_incidents.map((inc) => (
                  <button
                    key={inc.id}
                    onClick={() => navigate(`/incidents/${inc.id}`)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-light transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{inc.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {inc.created_at ? new Date(inc.created_at).toLocaleString() : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {severityBadge(inc.severity)}
                      {statusBadge(inc.status)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Live event volume simulation */}
      <section>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Event Volume (last 24h)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, events: Math.round(Math.abs(Math.sin(i / 3)) * 400 + 120) }))}>
              <defs>
                <linearGradient id="eventGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#374151' }} tickLine={false} interval={2} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="events" stroke="#3b82f6" strokeWidth={2} fill="url(#eventGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
