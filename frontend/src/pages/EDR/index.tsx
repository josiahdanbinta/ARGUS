import { useState, useEffect, useCallback } from 'react';
import {
  Radio, Wifi, ShieldOff, ShieldCheck, Monitor, Cpu, HardDrive,
  Terminal, Download, Search, RefreshCw, AlertTriangle, X,
} from 'lucide-react';
import api from '../../api/client';

interface Endpoint {
  id: number;
  hostname: string;
  os: string;
  ipAddress: string;
  agentStatus: 'online' | 'offline';
  isolationStatus: 'normal' | 'isolated';
  cpu: number;
  memory: number;
  lastHeartbeat: string;
}

interface ResponseAction {
  title: string;
  description: string;
  icon: typeof Terminal;
  color: string;
  bgColor: string;
}

const responseActions: ResponseAction[] = [
  {
    title: 'Kill Process',
    description: 'Terminate a malicious process across one or more endpoints',
    icon: Terminal,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  {
    title: 'Quarantine File',
    description: 'Isolate a suspicious file and prevent execution',
    icon: ShieldOff,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  {
    title: 'Collect Evidence',
    description: 'Gather forensic artifacts: memory dump, logs, registry',
    icon: Download,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    title: 'Remote Shell',
    description: 'Open an interactive shell session on the target host',
    icon: Monitor,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
];

export default function EDR() {
  const [search, setSearch] = useState('');
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isolating, setIsolating] = useState<number | null>(null);
  const [isolateError, setIsolateError] = useState('');

  const [killModalOpen, setKillModalOpen] = useState(false);
  const [killTarget, setKillTarget] = useState<Endpoint | null>(null);
  const [processName, setProcessName] = useState('');
  const [killing, setKilling] = useState(false);
  const [killError, setKillError] = useState('');

  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/edr/endpoints');
      setEndpoints(Array.isArray(data) ? data : data.items ?? []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load endpoints');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  const handleIsolate = async (endpointId: number) => {
    setIsolating(endpointId);
    setIsolateError('');
    try {
      await api.post(`/edr/endpoints/${endpointId}/isolate`);
      setEndpoints((prev) =>
        prev.map((ep) =>
          ep.id === endpointId ? { ...ep, isolationStatus: 'isolated' } : ep
        )
      );
    } catch (err: any) {
      setIsolateError(err.response?.data?.message || err.message || 'Isolation failed');
    } finally {
      setIsolating(null);
    }
  };

  const openKillModal = (ep: Endpoint) => {
    setKillTarget(ep);
    setProcessName('');
    setKillError('');
    setKillModalOpen(true);
  };

  const handleKillProcess = async () => {
    if (!killTarget || !processName.trim()) return;
    setKilling(true);
    setKillError('');
    try {
      await api.post(`/edr/endpoints/${killTarget.id}/kill-process`, {
        process_name: processName.trim(),
      });
      setKillModalOpen(false);
      setKillTarget(null);
      setProcessName('');
    } catch (err: any) {
      setKillError(err.response?.data?.message || err.message || 'Kill process failed');
    } finally {
      setKilling(false);
    }
  };

  const handleInvestigate = (hostname: string) => {
    window.location.hash = `#/edr/${hostname}`;
  };

  const filteredEndpoints = endpoints.filter(
    (e) =>
      e.hostname.toLowerCase().includes(search.toLowerCase()) ||
      e.os.toLowerCase().includes(search.toLowerCase()) ||
      e.ipAddress.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = endpoints.filter((e) => e.agentStatus === 'online').length;
  const isolatedCount = endpoints.filter((e) => e.isolationStatus === 'isolated').length;
  const onlinePercent = endpoints.length > 0 ? Math.round((onlineCount / endpoints.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Endpoint Detection &amp; Response</h1>
        <p className="text-gray-400 mt-1">Monitor, investigate, and respond to endpoint threats</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Radio className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Endpoints</p>
              <p className="text-2xl font-bold text-gray-100">
                {loading ? '...' : endpoints.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Wifi className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Agents Online</p>
              <p className="text-2xl font-bold text-gray-100">
                {loading ? '...' : onlineCount}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <ShieldOff className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Isolated</p>
              <p className="text-2xl font-bold text-gray-100">
                {loading ? '...' : isolatedCount}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Threats Blocked</p>
              <p className="text-2xl font-bold text-gray-100">12,847</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Agent Health</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{onlinePercent}% Online</span>
          <div className="flex-1 bg-surface rounded-full h-3 overflow-hidden">
            <div
              className="h-3 bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${onlinePercent}%` }}
            />
          </div>
          <span className="text-sm text-gray-400">
            {onlineCount}/{endpoints.length}
          </span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search endpoints by hostname, OS, or IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      {isolateError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{isolateError}</span>
          <button onClick={() => setIsolateError('')} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Endpoints</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading endpoints...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
            <p>{error}</p>
            <button onClick={fetchEndpoints} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : filteredEndpoints.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            {search ? 'No endpoints match your search.' : 'No endpoints available.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-surface-border">
                  <th className="pb-3 pr-4 font-medium">Hostname</th>
                  <th className="pb-3 pr-4 font-medium">OS</th>
                  <th className="pb-3 pr-4 font-medium">IP Address</th>
                  <th className="pb-3 pr-4 font-medium">Agent Status</th>
                  <th className="pb-3 pr-4 font-medium">Isolation</th>
                  <th className="pb-3 pr-4 font-medium">CPU</th>
                  <th className="pb-3 pr-4 font-medium">Memory</th>
                  <th className="pb-3 pr-4 font-medium">Last Heartbeat</th>
                  <th className="pb-3 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredEndpoints.map((ep) => (
                  <tr key={ep.id} className="hover:bg-surface-lighter/50 transition-colors">
                    <td className="py-3 pr-4 text-gray-200 font-mono font-medium">{ep.hostname}</td>
                    <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{ep.os}</td>
                    <td className="py-3 pr-4 text-gray-300 font-mono text-xs">{ep.ipAddress}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`badge ${ep.agentStatus === 'online' ? 'badge-success' : 'badge-info'}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            ep.agentStatus === 'online' ? 'bg-green-400' : 'bg-gray-500'
                          }`}
                        />
                        {ep.agentStatus}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`badge ${ep.isolationStatus === 'isolated' ? 'badge-high' : 'badge-success'}`}
                      >
                        {ep.isolationStatus}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-gray-300">{ep.cpu}%</span>
                        <div className="w-10 bg-surface rounded-full h-1">
                          <div
                            className={`h-1 rounded-full ${
                              ep.cpu > 60 ? 'bg-red-500' : ep.cpu > 30 ? 'bg-orange-400' : 'bg-green-500'
                            }`}
                            style={{ width: `${ep.cpu}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-gray-300">{ep.memory}%</span>
                        <div className="w-10 bg-surface rounded-full h-1">
                          <div
                            className={`h-1 rounded-full ${
                              ep.memory > 60 ? 'bg-red-500' : ep.memory > 30 ? 'bg-orange-400' : 'bg-green-500'
                            }`}
                            style={{ width: `${ep.memory}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{ep.lastHeartbeat}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleIsolate(ep.id)}
                          disabled={isolating === ep.id || ep.isolationStatus === 'isolated'}
                          className="px-2 py-1 text-xs font-medium rounded bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isolating === ep.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : ep.isolationStatus === 'isolated' ? (
                            'Isolated'
                          ) : (
                            'Isolate'
                          )}
                        </button>
                        <button
                          onClick={() => handleInvestigate(ep.hostname)}
                          className="px-2 py-1 text-xs font-medium rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                        >
                          Investigate
                        </button>
                        <button
                          onClick={() => openKillModal(ep)}
                          className="px-2 py-1 text-xs font-medium rounded bg-surface-lighter text-gray-300 border border-surface-border hover:bg-surface-border transition-colors"
                        >
                          Kill Process
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {killModalOpen && killTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100">Kill Process</h3>
              <button
                onClick={() => { setKillModalOpen(false); setKillTarget(null); }}
                className="text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Terminate a process on <span className="text-gray-200 font-mono">{killTarget.hostname}</span>
            </p>
            <label className="block text-sm text-gray-400 mb-1.5">Process Name</label>
            <input
              type="text"
              placeholder="e.g. powershell.exe"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              className="input mb-3"
            />
            {killError && (
              <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs mb-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {killError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => { setKillModalOpen(false); setKillTarget(null); }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleKillProcess}
                disabled={!processName.trim() || killing}
                className="btn-danger text-sm inline-flex items-center gap-2"
              >
                {killing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Kill Process
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Response Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {responseActions.map((action) => (
            <button
              key={action.title}
              className="flex flex-col items-start gap-3 p-4 rounded-lg bg-surface hover:bg-surface-lighter border border-surface-border transition-colors text-left"
            >
              <div className={`p-2 rounded-lg ${action.bgColor}`}>
                <action.icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <div>
                <p className="font-medium text-gray-200 text-sm">{action.title}</p>
                <p className="text-xs text-gray-500 mt-1">{action.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
