import { useState, useEffect, useCallback } from 'react';
import { Activity, GitBranch, HardDrive, Search, Filter, Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../../api/client';

interface Event {
  id: number;
  timestamp: string;
  eventType: string;
  eventId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;
  hostname: string;
  user: string;
  message: string;
  riskScore: number;
}

interface DetectionRule {
  id: number;
  name: string;
  type: 'Sigma' | 'YARA' | 'Correlation' | 'Threshold';
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitre: string;
  enabled: boolean;
}

const severityLabel: Record<string, string> = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
  info: 'badge-info',
};

export default function SIEM() {
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [rulesError, setRulesError] = useState('');

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const { data } = await api.get('/siem/events', { params: { page: 1, page_size: 50 } });
      setEvents(Array.isArray(data) ? data : data.items ?? []);
    } catch (err: any) {
      setEventsError(err.response?.data?.message || err.message || 'Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError('');
    try {
      const { data } = await api.get('/siem/rules', { params: { page: 1, page_size: 50 } });
      setRules(Array.isArray(data) ? data : data.items ?? []);
    } catch (err: any) {
      setRulesError(err.response?.data?.message || err.message || 'Failed to load rules');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchRules();
  }, [fetchEvents, fetchRules]);

  const filteredEvents = events.filter(
    (e) =>
      e.message.toLowerCase().includes(search.toLowerCase()) ||
      e.hostname.toLowerCase().includes(search.toLowerCase()) ||
      e.eventType.toLowerCase().includes(search.toLowerCase()) ||
      e.user.toLowerCase().includes(search.toLowerCase())
  );

  const filteredRules = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase()) ||
      r.mitre.toLowerCase().includes(search.toLowerCase())
  );

  const criticalCount = events.filter((e) => e.severity === 'critical').length;
  const highCount = events.filter((e) => e.severity === 'high').length;
  const rulesEnabled = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">SIEM</h1>
        <p className="text-gray-400 mt-1">Real-time security event monitoring and correlation</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Events Loaded</p>
              <p className="text-2xl font-bold text-gray-100">{events.length}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Critical / High</p>
              <p className="text-2xl font-bold text-gray-100">
                {criticalCount} / {highCount}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <GitBranch className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Rules Active</p>
              <p className="text-2xl font-bold text-gray-100">
                {rulesLoading ? '...' : rulesEnabled}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <HardDrive className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Storage Buffer</p>
              <p className="text-2xl font-bold text-gray-100">—</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search events by message, hostname, user, or event type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-argus-400" />
            <h2 className="text-lg font-semibold text-gray-100">Live Event Feed</h2>
            <span className="inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-green-900/30 border border-green-800 rounded-full text-xs text-green-400">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
          </div>
          <button className="btn-secondary flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>

        {eventsLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading events...
          </div>
        ) : eventsError ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
            <p>{eventsError}</p>
            <button onClick={fetchEvents} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            {search ? 'No events match your search.' : 'No events available.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="max-h-[500px] overflow-y-auto scroll-smooth">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-light z-10">
                  <tr className="text-left text-gray-400 border-b border-surface-border">
                    <th className="pb-3 pr-4 font-medium">Timestamp</th>
                    <th className="pb-3 pr-4 font-medium">Event Type</th>
                    <th className="pb-3 pr-4 font-medium">Severity</th>
                    <th className="pb-3 pr-4 font-medium">Source</th>
                    <th className="pb-3 pr-4 font-medium">Hostname</th>
                    <th className="pb-3 pr-4 font-medium">User</th>
                    <th className="pb-3 pr-4 font-medium">Message</th>
                    <th className="pb-3 pr-4 font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-surface-lighter/50 transition-colors">
                      <td className="py-3 pr-4 text-gray-300 font-mono text-xs whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span className="text-gray-200">{event.eventType}</span>
                        <span className="text-gray-500 ml-1.5">({event.eventId})</span>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span className={`badge capitalize ${severityLabel[event.severity]}`}>
                          {event.severity}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{event.source}</td>
                      <td className="py-3 pr-4 text-gray-300 font-mono whitespace-nowrap">{event.hostname}</td>
                      <td className="py-3 pr-4 text-gray-300 font-mono text-xs whitespace-nowrap">{event.user}</td>
                      <td className="py-3 pr-4 text-gray-400 max-w-xs truncate">{event.message}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-surface rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                event.riskScore >= 80
                                  ? 'bg-red-500'
                                  : event.riskScore >= 50
                                    ? 'bg-orange-500'
                                    : event.riskScore >= 30
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                              }`}
                              style={{ width: `${event.riskScore}%` }}
                            />
                          </div>
                          <span className="text-gray-400 text-xs">{event.riskScore}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Detection Rules</h2>

        {rulesLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading rules...
          </div>
        ) : rulesError ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
            <p>{rulesError}</p>
            <button onClick={fetchRules} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            {search ? 'No rules match your search.' : 'No detection rules available.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-surface-border">
                  <th className="pb-3 pr-4 font-medium">Rule Name</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 pr-4 font-medium">Severity</th>
                  <th className="pb-3 pr-4 font-medium">MITRE</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface-lighter/50 transition-colors">
                    <td className="py-3 pr-4 text-gray-200">{rule.name}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`badge ${
                          rule.type === 'Sigma'
                            ? 'badge-low'
                            : rule.type === 'YARA'
                              ? 'badge-critical'
                              : rule.type === 'Correlation'
                                ? 'badge-medium'
                                : 'badge-info'
                        }`}
                      >
                        {rule.type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span className={`badge capitalize ${severityLabel[rule.severity]}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-400 font-mono text-xs">{rule.mitre}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          rule.enabled ? 'bg-green-600' : 'bg-surface-lighter'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            rule.enabled ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
