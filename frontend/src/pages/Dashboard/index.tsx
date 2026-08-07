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
} from 'recharts';
import api from '../../api/client';
import type { DashboardMetrics } from '../../types';

const ALERT_SEVERITY_DATA = [
  { severity: 'Critical', count: 42 },
  { severity: 'High', count: 156 },
  { severity: 'Medium', count: 389 },
  { severity: 'Low', count: 612 },
  { severity: 'Informational', count: 1204 },
];

const INCIDENT_STATUS_DATA = [
  { name: 'Open', value: 23, color: '#ef4444' },
  { name: 'Investigating', value: 41, color: '#f59e0b' },
  { name: 'Contained', value: 17, color: '#3b82f6' },
  { name: 'Resolved', value: 89, color: '#22c55e' },
];

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#3b82f6',
  Informational: '#22c55e',
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
      setMetrics(data);
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

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard icon={Zap} label="Total Events" value={metrics?.total_events?.toLocaleString() ?? '--'} accent="#3b82f6" onClick={() => navigate('/siem')} />
          <MetricCard icon={Activity} label="Events/sec" value={metrics?.events_per_second ?? '--'} accent="#22c55e" onClick={() => navigate('/siem')} />
          <MetricCard icon={AlertTriangle} label="Critical Alerts" value={metrics?.critical_alerts ?? '--'} accent="#ef4444" onClick={() => navigate('/alerts')} />
          <MetricCard icon={ShieldAlert} label="Active Incidents" value={metrics?.active_incidents ?? '--'} accent="#f97316" onClick={() => navigate('/incidents')} />
          <MetricCard icon={Radio} label="Endpoints Online" value={metrics?.endpoint_count ?? '--'} accent="#3b82f6" onClick={() => navigate('/assets')} />
          <MetricCard icon={Globe} label="Threat Feeds" value={metrics?.threat_feed_status ?? '--'} accent="#22c55e" onClick={() => navigate('/threat-intelligence')} />
          <MetricCard icon={TrendingUp} label="Risk Score" value={metrics?.risk_score?.toFixed(1) ?? '--'} accent="#eab308" onClick={() => navigate('/incidents')} />
          <MetricCard icon={Shield} label="MITRE Coverage" value="87%" accent="#8b5cf6" onClick={() => navigate('/mitre')} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Analytics</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Alert Severity Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={ALERT_SEVERITY_DATA}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="severity"
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f9fafb',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {ALERT_SEVERITY_DATA.map((entry) => (
                    <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Incident Status Overview</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={INCIDENT_STATUS_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {INCIDENT_STATUS_DATA.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f9fafb',
                    fontSize: '12px',
                  }}
                  formatter={(value: number, name: string) => [`${value} incidents`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
