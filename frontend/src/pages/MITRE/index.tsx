import { useState, useEffect, useCallback } from 'react';
import { Eye, Box, ArrowRightCircle, Terminal, Pin, TrendingUp, ShieldOff, Key, Search, ArrowLeftRight, Archive, Radio, Download, Zap, Shield, Loader2 } from 'lucide-react';
import api from '../../api/client';

const tacticIcons: Record<string, any> = {
  'Reconnaissance': Eye, 'Resource Development': Box, 'Initial Access': ArrowRightCircle,
  'Execution': Terminal, 'Persistence': Pin, 'Privilege Escalation': TrendingUp,
  'Defense Evasion': ShieldOff, 'Credential Access': Key, 'Discovery': Search,
  'Lateral Movement': ArrowLeftRight, 'Collection': Archive, 'Command and Control': Radio,
  'Exfiltration': Download, 'Impact': Zap,
};

interface Tactic {
  name: string;
  id: string;
  count: number;
}

const techniques: Record<string, { id: string; name: string; desc: string; subs: number; coverage: string }[]> = {
  'Initial Access': [
    { id: 'T1566', name: 'Phishing', desc: 'Adversaries may send phishing messages to gain access to victim systems.', subs: 4, coverage: 'detected' },
    { id: 'T1190', name: 'Exploit Public-Facing Application', desc: 'Adversaries may exploit software vulnerabilities in internet-facing systems.', subs: 0, coverage: 'partial' },
    { id: 'T1078', name: 'Valid Accounts', desc: 'Adversaries may obtain and abuse credentials of existing accounts.', subs: 4, coverage: 'detected' },
    { id: 'T1133', name: 'External Remote Services', desc: 'Adversaries may leverage external-facing remote services.', subs: 0, coverage: 'no_coverage' },
    { id: 'T1189', name: 'Drive-by Compromise', desc: 'Adversaries may gain access through compromised websites.', subs: 0, coverage: 'no_coverage' },
  ],
  'Execution': [
    { id: 'T1059', name: 'Command and Scripting Interpreter', desc: 'Adversaries may abuse command and script interpreters.', subs: 10, coverage: 'detected' },
    { id: 'T1204', name: 'User Execution', desc: 'Adversaries may rely on user interaction for execution.', subs: 3, coverage: 'detected' },
    { id: 'T1047', name: 'Windows Management Instrumentation', desc: 'Adversaries may abuse WMI to execute malicious commands.', subs: 0, coverage: 'partial' },
    { id: 'T1053', name: 'Scheduled Task/Job', desc: 'Adversaries may abuse task scheduling for execution.', subs: 4, coverage: 'detected' },
    { id: 'T1203', name: 'Exploitation for Client Execution', desc: 'Adversaries may exploit software vulnerabilities in client apps.', subs: 0, coverage: 'no_coverage' },
  ],
  'Persistence': [
    { id: 'T1547', name: 'Boot or Logon Autostart Execution', desc: 'Adversaries may configure system settings to execute programs during boot or logon.', subs: 12, coverage: 'detected' },
    { id: 'T1543', name: 'Create or Modify System Process', desc: 'Adversaries may create or modify system-level processes.', subs: 4, coverage: 'partial' },
    { id: 'T1505', name: 'Server Software Component', desc: 'Adversaries may abuse server software for persistence.', subs: 3, coverage: 'no_coverage' },
    { id: 'T1546', name: 'Event Triggered Execution', desc: 'Adversaries may establish persistence using system events.', subs: 8, coverage: 'partial' },
    { id: 'T1136', name: 'Create Account', desc: 'Adversaries may create an account to maintain access.', subs: 3, coverage: 'detected' },
  ],
};

const coverageBorder = (c: string) => c === 'detected' ? 'border-success' : c === 'partial' ? 'border-warning' : 'border-gray-600';

export default function MITREPage() {
  const [tactics, setTactics] = useState<Tactic[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTactic, setActiveTactic] = useState('Initial Access');

  const fetchTactics = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/mitre/tactics');
      const items = Array.isArray(data) ? data : data.items ?? data.data ?? data.results ?? [];
      const mapped: Tactic[] = items.map((t: any) =>
        typeof t === 'string'
          ? { name: t, id: t, count: 0 }
          : {
              name: t.name ?? t.id ?? '',
              id: t.id ?? t.technique_id ?? '',
              count: t.count ?? t.techniques_count ?? 0,
            }
      );
      setTactics(mapped);
    } catch {
      setTactics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTactics();
  }, [fetchTactics]);

  const totalDetected = 68;
  const totalPartial = 45;
  const totalNoCoverage = 112;
  const total = totalDetected + totalPartial + totalNoCoverage;
  const coveragePct = Math.round((totalDetected / total) * 100);

  const displayTactics = tactics.length > 0 ? tactics : [];
  const activeTechniques = techniques[activeTactic] || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MITRE ATT&CK</h1>
        <p className="text-gray-400 mt-1">Adversary tactics, techniques, and procedures</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-400">Overall Coverage</p>
          <p className="text-3xl font-bold text-argus-400">{coveragePct}%</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Detected</p>
          <p className="text-3xl font-bold text-success">{totalDetected}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Partial</p>
          <p className="text-3xl font-bold text-warning">{totalPartial}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">No Coverage</p>
          <p className="text-3xl font-bold text-gray-500">{totalNoCoverage}</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-argus-400 animate-spin" />
          </div>
        ) : displayTactics.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto pb-2">
            {displayTactics.map((tactic) => {
              const Icon = tacticIcons[tactic.name] || Shield;
              const isActive = activeTactic === tactic.name;
              return (
                <button
                  key={tactic.id}
                  onClick={() => setActiveTactic(tactic.name)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg whitespace-nowrap transition-colors min-w-[100px] ${
                    isActive ? 'bg-argus-600/20 border border-argus-500/50 text-argus-400' : 'bg-surface hover:bg-surface-lighter text-gray-400 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{tactic.name}</span>
                  <span className={`text-xs ${isActive ? 'text-argus-400' : 'text-gray-500'}`}>{tactic.count} techniques</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-gray-500 text-sm">
            No tactics loaded. Using static MITRE technique data.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeTechniques.map((tech) => (
          <div key={tech.id} className={`card border-l-4 ${coverageBorder(tech.coverage)}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-argus-400">{tech.id}</span>
              {tech.coverage === 'detected' ? (
                <span className="badge badge-success text-xs">Detected</span>
              ) : tech.coverage === 'partial' ? (
                <span className="badge badge-high text-xs">Partial</span>
              ) : (
                <span className="badge badge-info text-xs">No Coverage</span>
              )}
            </div>
            <h3 className="font-semibold text-sm mb-1">{tech.name}</h3>
            <p className="text-gray-400 text-xs line-clamp-2">{tech.desc}</p>
            {tech.subs > 0 && (
              <p className="text-gray-500 text-xs mt-2">{tech.subs} sub-techniques</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
