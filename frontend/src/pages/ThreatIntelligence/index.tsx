import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Database,
  Rss,
  UserX,
  RefreshCw,
  Globe,
  Shield,
  Search,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import api from '../../api/client';

interface IOC {
  id: string;
  type: 'IPv4' | 'Domain' | 'URL' | 'Hash' | 'Email';
  value: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  source: string;
  firstSeen: string;
  lastSeen: string;
}

interface Feed {
  id: string;
  name: string;
  status: string;
  lastSync: string;
  iocCount: number;
}

const IOC_TYPE_COLORS: Record<string, string> = {
  IPv4: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Domain: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  URL: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  Hash: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Email: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const FEED_STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-500/20 text-green-400 border-green-500/30',
  Syncing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}

function MetricCard({ icon: Icon, label, value, accent }: MetricCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4">
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
    </div>
  );
}

export default function ThreatIntelligencePage() {
  const [iocs, setIocs] = useState<IOC[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);

  const [iocLoading, setIocLoading] = useState(true);
  const [feedsLoading, setFeedsLoading] = useState(true);

  const [iocError, setIocError] = useState<string | null>(null);
  const [feedsError, setFeedsError] = useState<string | null>(null);

  const [iocTypeFilter, setIocTypeFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [syncingFeed, setSyncingFeed] = useState<string | null>(null);

  const fetchIOCs = useCallback(async () => {
    setIocLoading(true);
    setIocError(null);
    try {
      const { data } = await api.get('/siem/iocs', { params: { page: 1, page_size: 50 } });
      const items: IOC[] = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setIocs(items);
    } catch {
      setIocError('Failed to load IOCs');
    } finally {
      setIocLoading(false);
    }
  }, []);

  const fetchFeeds = useCallback(async () => {
    setFeedsLoading(true);
    setFeedsError(null);
    try {
      const { data } = await api.get('/threatintel/feeds');
      const items: Feed[] = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setFeeds(items);
    } catch {
      setFeedsError('Failed to load threat feeds');
    } finally {
      setFeedsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIOCs();
    fetchFeeds();
  }, [fetchIOCs, fetchFeeds]);

  const filteredIOCs = useMemo(() => {
    return iocs.filter((ioc) => {
      if (iocTypeFilter !== 'All' && ioc.type !== iocTypeFilter) return false;
      if (severityFilter !== 'All' && ioc.severity !== severityFilter.toLowerCase()) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          ioc.value.toLowerCase().includes(q) ||
          ioc.description.toLowerCase().includes(q) ||
          ioc.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [iocs, iocTypeFilter, severityFilter, search]);

  const totalIOCs = iocs.length;
  const activeFeeds = feeds.filter((f) => f.status === 'Active').length;
  const lastSyncTimes = feeds.map((f) => new Date(f.lastSync).getTime());
  const latestSync = lastSyncTimes.length > 0
    ? relativeTime(new Date(Math.max(...lastSyncTimes)).toISOString())
    : '—';

  const handleSyncFeed = async (feedId: string) => {
    setSyncingFeed(feedId);
    try {
      await api.post(`/siem/threat-feeds/${feedId}/sync`);
      await fetchFeeds();
    } catch {
      // ignore — feed status may update on next fetch
    } finally {
      setSyncingFeed(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Threat Intelligence</h1>
        <p className="text-sm text-gray-400 mt-1">IOC management and threat feed integration</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Database} label="Total IOCs" value={totalIOCs.toLocaleString()} accent="#3b82f6" />
        <MetricCard icon={Rss} label="Active Feeds" value={activeFeeds} accent="#22c55e" />
        <MetricCard icon={UserX} label="Threat Actors Tracked" value={47} accent="#f97316" />
        <MetricCard icon={RefreshCw} label="Last Sync" value={latestSync} accent="#8b5cf6" />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-200">Indicators of Compromise</h2>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-argus-600/20 text-argus-400 border border-argus-500/30">
            {filteredIOCs.length}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex items-center gap-2 bg-surface-light border border-surface-border rounded-lg px-3 py-2 flex-1 max-w-xs">
            <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search IOCs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none w-full"
            />
          </div>

          <select
            value={iocTypeFilter}
            onChange={(e) => setIocTypeFilter(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-argus-500 transition-colors cursor-pointer"
          >
            <option value="All">All Types</option>
            <option value="IPv4">IPv4</option>
            <option value="Domain">Domain</option>
            <option value="URL">URL</option>
            <option value="Hash">Hash</option>
            <option value="Email">Email</option>
          </select>

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
          </select>
        </div>

        {iocError && (
          <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {iocError}
            </div>
            <button onClick={fetchIOCs} className="text-red-400 hover:text-red-300 text-sm font-medium">
              Retry
            </button>
          </div>
        )}

        {iocLoading ? (
          <div className="flex items-center justify-center py-16 bg-surface-light rounded-xl border border-surface-border">
            <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
          </div>
        ) : filteredIOCs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-surface-light rounded-xl border border-surface-border text-gray-500">
            <Database className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">{iocs.length === 0 ? 'No IOCs found' : 'No IOCs match the current filters'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-light">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Value</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Confidence</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">First Seen</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredIOCs.map((ioc) => (
                  <tr key={ioc.id} className="hover:bg-surface-lighter/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${IOC_TYPE_COLORS[ioc.type] ?? ''}`}>
                        {ioc.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-200 font-mono text-xs">{ioc.value}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate" title={ioc.description}>{ioc.description}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${SEVERITY_COLORS[ioc.severity] ?? ''}`}>
                        {ioc.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-gray-700 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${ioc.confidence}%`,
                              backgroundColor:
                                ioc.confidence >= 90 ? '#22c55e' :
                                ioc.confidence >= 70 ? '#eab308' :
                                '#f97316',
                            }}
                          />
                        </div>
                        <span className="text-gray-400 text-xs">{ioc.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{ioc.source}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(ioc.firstSeen)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(ioc.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Threat Feeds</h2>

        {feedsError && (
          <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {feedsError}
            </div>
            <button onClick={fetchFeeds} className="text-red-400 hover:text-red-300 text-sm font-medium">
              Retry
            </button>
          </div>
        )}

        {feedsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
          </div>
        ) : feeds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Rss className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No threat feeds configured</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {feeds.map((feed) => (
              <div key={feed.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {feed.status === 'Syncing' ? (
                      <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />
                    ) : feed.status === 'Active' ? (
                      <Globe className="w-4 h-4 text-green-400" />
                    ) : (
                      <Shield className="w-4 h-4 text-gray-500" />
                    )}
                    <h3 className="font-semibold text-gray-200 text-sm">{feed.name}</h3>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full border ${FEED_STATUS_COLORS[feed.status] ?? FEED_STATUS_COLORS.Inactive}`}>
                    {feed.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Last sync</span>
                    <span className="text-gray-400">{relativeTime(feed.lastSync)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">IOC Count</span>
                    <span className="text-gray-300 font-mono">{feed.iocCount.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleSyncFeed(feed.id)}
                  disabled={syncingFeed === feed.id || feed.status === 'Syncing'}
                  className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border bg-surface-light text-gray-200 hover:bg-surface-lighter hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${syncingFeed === feed.id ? 'animate-spin' : ''}`} />
                  {syncingFeed === feed.id ? 'Syncing...' : 'Sync'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
