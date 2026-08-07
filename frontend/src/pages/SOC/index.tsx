import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Clock, Users, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../api/client';

interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  analyst: string;
  sla: string;
  age: string;
}

const analystData = [
  { name: 'J. Smith', cases: 15 },
  { name: 'A. Jones', cases: 8 },
  { name: 'M. Williams', cases: 12 },
  { name: 'K. Brown', cases: 5 },
  { name: 'T. Davis', cases: 3 },
].sort((a, b) => b.cases - a.cases);

const timeline = [
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

export default function SOC() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [unassignedAlerts, setUnassignedAlerts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [incidentsRes, alertsRes] = await Promise.all([
        api.get('/incidents'),
        api.get('/alerts', { params: { status: 'new' } }),
      ]);
      const incData = incidentsRes.data;
      setIncidents(Array.isArray(incData) ? incData : incData.items ?? []);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
            <p className="text-2xl font-bold">3.2h</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-lg bg-surface text-green-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-gray-400 text-sm">Analysts Active</p>
            <p className="text-2xl font-bold">5</p>
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
                        <td className="py-2.5 text-gray-400">{c.analyst}</td>
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
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analystData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" stroke="#64748b" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={12} width={80} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
              <Bar dataKey="cases" radius={[0, 4, 4, 0]}>
                {analystData.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-argus-400" />Investigation Timeline</h2>
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
