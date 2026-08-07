import { useState } from 'react';
import {
  Crosshair, Search, Play, ArrowRight,
  Target, Shield, Terminal, Globe,
  UserCheck, FileSearch, Activity, AlertTriangle,
  AlertCircle, Loader2,
} from 'lucide-react';
import api from '../../api/client';

interface HuntTemplate {
  id: number;
  title: string;
  description: string;
  icon: typeof Crosshair;
  iconColor: string;
  iconBg: string;
  mitreTechnique: string;
}

interface HuntResult {
  id: number;
  timestamp: string;
  eventType: string;
  hostname: string;
  user: string;
  description: string;
  riskScore: number;
  mitreTechnique: string;
}

const processExamples = [
  { icon: Terminal, text: 'Encoded PowerShell execution' },
  { icon: Terminal, text: 'Suspicious process creation' },
  { icon: Terminal, text: 'Mimikatz detection' },
];

const networkExamples = [
  { icon: Globe, text: 'Beaconing detection' },
  { icon: Globe, text: 'DNS tunneling' },
  { icon: Globe, text: 'Lateral movement via SMB' },
];

const userExamples = [
  { icon: UserCheck, text: 'Impossible travel' },
  { icon: UserCheck, text: 'Privilege escalation' },
  { icon: UserCheck, text: 'Dormant account activation' },
];

const huntTemplates: HuntTemplate[] = [
  {
    id: 1,
    title: 'Brute Force Detection',
    description: 'Identify repeated authentication failures followed by success across endpoints',
    icon: Shield,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    mitreTechnique: 'T1110',
  },
  {
    id: 2,
    title: 'Ransomware Behaviors',
    description: 'Detect mass file encryption, shadow copy deletion, and ransom note creation',
    icon: AlertTriangle,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
    mitreTechnique: 'T1486',
  },
  {
    id: 3,
    title: 'Credential Dumping',
    description: 'Hunt for LSASS access, SAM hive reads, and credential harvesting tools',
    icon: FileSearch,
    iconColor: 'text-yellow-400',
    iconBg: 'bg-yellow-500/10',
    mitreTechnique: 'T1003',
  },
  {
    id: 4,
    title: 'Persistence Mechanisms',
    description: 'Scan for scheduled tasks, registry run keys, WMI subscriptions, and startup folder changes',
    icon: Activity,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10',
    mitreTechnique: 'T1547',
  },
  {
    id: 5,
    title: 'C2 Communication',
    description: 'Search for beaconing patterns, unusual outbound connections, and known C2 frameworks',
    icon: Globe,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    mitreTechnique: 'T1071',
  },
  {
    id: 6,
    title: 'Data Exfiltration',
    description: 'Monitor large outbound data transfers, archive creation, and cloud storage uploads',
    icon: ArrowRight,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    mitreTechnique: 'T1048',
  },
];

const riskColor = (score: number) => {
  if (score >= 90) return 'text-red-400';
  if (score >= 70) return 'text-orange-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-gray-400';
};

export default function ThreatHuntingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<HuntResult[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runHunt = async (template: HuntTemplate) => {
    const query = template.title;
    setSearchQuery(query);
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/ai/threat-hunt', { query });
      const items: HuntResult[] = Array.isArray(data) ? data : data.items ?? data.data ?? data.results ?? [];
      setResults(items);
    } catch {
      setError('Threat hunt failed. Please try again.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/ai/threat-hunt', { query });
      const items: HuntResult[] = Array.isArray(data) ? data : data.items ?? data.data ?? data.results ?? [];
      setResults(items);
    } catch {
      setError('Threat hunt failed. Please try again.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
          <Crosshair className="w-6 h-6 text-argus-400" />
          Threat Hunting
        </h1>
        <p className="text-gray-400 mt-1">Proactive threat discovery and investigation</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Show endpoints with encoded PowerShell execution in last 24 hours"
          className="input pl-12 pr-20 py-3 text-sm"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !searchQuery.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Hunt
        </button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Try These Searches
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card space-y-2">
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <Terminal className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">Process</span>
            </div>
            {processExamples.map((ex) => (
              <button
                key={ex.text}
                onClick={() => setSearchQuery(ex.text)}
                className="w-full text-left text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-lighter px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <ex.icon className="w-3.5 h-3.5 text-gray-500" />
                {ex.text}
              </button>
            ))}
          </div>

          <div className="card space-y-2">
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">Network</span>
            </div>
            {networkExamples.map((ex) => (
              <button
                key={ex.text}
                onClick={() => setSearchQuery(ex.text)}
                className="w-full text-left text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-lighter px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <ex.icon className="w-3.5 h-3.5 text-gray-500" />
                {ex.text}
              </button>
            ))}
          </div>

          <div className="card space-y-2">
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <UserCheck className="w-4 h-4 text-green-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">User</span>
            </div>
            {userExamples.map((ex) => (
              <button
                key={ex.text}
                onClick={() => setSearchQuery(ex.text)}
                className="w-full text-left text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-lighter px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <ex.icon className="w-3.5 h-3.5 text-gray-500" />
                {ex.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Quick Hunt
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {huntTemplates.map((ht) => (
            <div key={ht.id} className="card group hover:border-argus-500/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className={`${ht.iconBg} p-2 rounded-lg`}>
                  <ht.icon className={`w-5 h-5 ${ht.iconColor}`} />
                </div>
                <span className="badge badge-info text-[10px]">{ht.mitreTechnique}</span>
              </div>
              <h3 className="text-gray-200 font-semibold text-sm mb-1">{ht.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed mb-4">{ht.description}</p>
              <button
                onClick={() => runHunt(ht)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-argus-600/20 hover:bg-argus-600/30 text-argus-400 font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                Run
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2 mb-5">
          <Target className="w-5 h-5 text-argus-400" />
          Results
        </h2>

        {error && (
          <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
            <button onClick={handleSearch} className="text-red-400 hover:text-red-300 text-sm font-medium">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-8 h-8 text-argus-400 animate-spin mb-4" />
            <p className="text-sm">Running threat hunt...</p>
          </div>
        ) : !results ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Crosshair className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">Run a hunt query to see results</p>
            <p className="text-xs text-gray-600 mt-1">
              Select a quick hunt above or enter a natural language search query
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Target className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No results found for this hunt</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-gray-400">
                  <th className="text-left py-3 px-4 font-medium">Timestamp</th>
                  <th className="text-left py-3 px-4 font-medium">Event Type</th>
                  <th className="text-left py-3 px-4 font-medium">Hostname</th>
                  <th className="text-left py-3 px-4 font-medium">User</th>
                  <th className="text-left py-3 px-4 font-medium">Description</th>
                  <th className="text-right py-3 px-4 font-medium">Risk Score</th>
                  <th className="text-right py-3 px-4 font-medium">MITRE</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-surface-border hover:bg-surface-lighter/50 transition-colors">
                    <td className="py-3 px-4 text-gray-400 font-mono text-xs">{r.timestamp}</td>
                    <td className="py-3 px-4 text-gray-300">{r.eventType}</td>
                    <td className="py-3 px-4 text-gray-200 font-mono text-xs">{r.hostname}</td>
                    <td className="py-3 px-4 text-gray-300">{r.user}</td>
                    <td className="py-3 px-4 text-gray-300 text-xs">{r.description}</td>
                    <td className={`py-3 px-4 text-right font-mono font-semibold ${riskColor(r.riskScore)}`}>
                      {r.riskScore}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="badge badge-info text-[10px]">{r.mitreTechnique}</span>
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
