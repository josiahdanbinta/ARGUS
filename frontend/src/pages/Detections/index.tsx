import { useState, useCallback, useEffect } from 'react';
import {
  ShieldAlert, Flame, Globe, Loader2, AlertCircle, Search, RefreshCw,
  Radar, ServerCrash, Lock, FileWarning, CheckCircle2, ChevronRight,
} from 'lucide-react';
import api from '../../api/client';

interface RansomwareRule {
  id: string;
  name: string;
  description: string;
  severity: string;
  mitre_techniques: string[];
  event_type: string | null;
  patterns: string[];
  false_positives: string | null;
  enabled: boolean;
}

interface FindingEvent {
  id: string;
  timestamp: string | null;
  hostname: string | null;
  event_type: string;
  source: string | null;
  source_ip: string | null;
  message: string;
}

interface RansomwareFinding {
  rule_id: string;
  rule_name: string;
  severity: string;
  description: string;
  events: FindingEvent[];
  affected_hosts: string[];
  mitre_techniques: string[];
  recommended_actions: string[];
}

interface ScanResult {
  scanned_events: number;
  time_range: string;
  findings: RansomwareFinding[];
  total_findings: number;
  critical_findings: number;
  detected_at: string;
}

interface EnrichmentResult {
  provider: string;
  success: boolean;
  error: string | null;
  data: { score?: number; [key: string]: unknown } | null;
}

interface EnrichmentResponse {
  indicator: string;
  indicator_type: string;
  results: EnrichmentResult[];
  overall_score: number | null;
  verdict: string | null;
  enriched_at: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  low: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
};

const VERDICT_STYLE: Record<string, string> = {
  malicious: 'text-red-400 bg-red-500/10 border-red-500/30',
  suspicious: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  benign: 'text-green-400 bg-green-500/10 border-green-500/30',
  no_providers: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
};

const TIME_RANGES = ['24h', '7d', '30d'];

export default function Detections() {
  const [rules, setRules] = useState<RansomwareRule[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [loadingRules, setLoadingRules] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [timeRange, setTimeRange] = useState('24h');
  const [error, setError] = useState<string | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  const [indicator, setIndicator] = useState('');
  const [indicatorType, setIndicatorType] = useState('ip');
  const [enrichResult, setEnrichResult] = useState<EnrichmentResponse | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const { data } = await api.get('/detections/ransomware/rules');
      setRules(Array.isArray(data) ? data : data.items ?? []);
    } catch {
      setRules([]);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const { data } = await api.post('/detections/ransomware/scan', { time_range: timeRange });
      setScanResult(data);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? err.message ?? 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const runEnrich = async () => {
    if (!indicator.trim() || enriching) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const { data } = await api.post('/detections/enrich', {
        indicator: indicator.trim(),
        indicator_type: indicatorType,
      });
      setEnrichResult(data);
    } catch (err: any) {
      setEnrichError(err.response?.data?.detail ?? err.message ?? 'Enrichment failed');
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Detections & Threat Enrichment</h1>
        <p className="text-gray-400 mt-1">Ransomware detection scanning and IOC enrichment against external threat intelligence providers</p>
      </div>

      {/* Ransomware Scan Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-400" />
            Ransomware Detection
          </h2>
          <div className="flex items-center gap-3">
            <select className="input w-32" value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              {TIME_RANGES.map((t) => (
                <option key={t} value={t}>Last {t}</option>
              ))}
            </select>
            <button className="btn-primary flex items-center gap-2" onClick={runScan} disabled={scanning}>
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
              Run Scan
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {scanResult && (
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Scanned Events</p>
              <p className="text-2xl font-bold mt-1">{scanResult.scanned_events.toLocaleString()}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Detections</p>
              <p className="text-2xl font-bold text-orange-400 mt-1">{scanResult.total_findings}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Critical</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{scanResult.critical_findings}</p>
            </div>
          </div>
        )}

        {scanResult?.findings?.map((finding) => (
          <div key={finding.rule_id} className="card">
            <button
              className="w-full flex items-center justify-between gap-4"
              onClick={() => setExpandedFinding(expandedFinding === finding.rule_id ? null : finding.rule_id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <ServerCrash className={`w-5 h-5 flex-shrink-0 ${finding.severity === 'critical' ? 'text-red-400' : 'text-orange-400'}`} />
                <div className="min-w-0 text-left">
                  <p className="font-semibold truncate">{finding.rule_name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {finding.affected_hosts.length} host(s) affected · {finding.events.length} event(s)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {finding.mitre_techniques.map((t) => (
                  <span key={t} className="badge badge-info">{t}</span>
                ))}
                <span className={`badge ${finding.severity === 'critical' ? 'badge-critical' : 'badge-high'}`}>
                  {finding.severity}
                </span>
                <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expandedFinding === finding.rule_id ? 'rotate-90' : ''}`} />
              </div>
            </button>

            {expandedFinding === finding.rule_id && (
              <div className="mt-4 pt-4 border-t border-surface-border space-y-4">
                <p className="text-sm text-gray-400">{finding.description}</p>

                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Affected Hosts</h4>
                  <div className="flex flex-wrap gap-2">
                    {finding.affected_hosts.length === 0 ? (
                      <span className="text-xs text-gray-500">No hostnames identified</span>
                    ) : (
                      finding.affected_hosts.map((h) => (
                        <span key={h} className="px-2.5 py-1 text-xs rounded-lg bg-surface-lighter text-gray-300 font-mono">{h}</span>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Matching Events</h4>
                  <div className="space-y-2">
                    {finding.events.map((e) => (
                      <div key={e.id} className="p-3 rounded-lg bg-surface-lighter">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="text-gray-500 font-mono">{e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</span>
                          <span className="text-argus-400 font-mono">{e.hostname || '-'}</span>
                          <span className="badge badge-info">{e.event_type}</span>
                          <span className="text-gray-500">{e.source_ip || ''}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1 truncate">{e.message}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Recommended Actions</h4>
                  <ul className="space-y-1.5">
                    {finding.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}

        {scanResult && scanResult.total_findings === 0 && (
          <div className="card p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-gray-300 font-medium">No ransomware indicators detected</p>
            <p className="text-sm text-gray-500 mt-1">
              Scanned {scanResult.scanned_events.toLocaleString()} events over the last {scanResult.time_range}
            </p>
          </div>
        )}

        {/* Rules Reference */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Detection Rules ({rules.length})
          </h3>
          {loadingRules ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-argus-400 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rules.map((rule) => (
                <div key={rule.id} className="card">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-medium text-sm truncate">{rule.name}</p>
                    <span className={`badge shrink-0 ${rule.severity === 'critical' ? 'badge-critical' : rule.severity === 'high' ? 'badge-high' : 'badge-medium'}`}>
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{rule.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {rule.mitre_techniques.map((t) => (
                      <span key={t} className="badge badge-low">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Threat Enrichment Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            IOC Threat Enrichment
          </h2>
        </div>

        <div className="card">
          <div className="flex flex-col sm:flex-row gap-3">
            <select className="input sm:w-40" value={indicatorType} onChange={(e) => setIndicatorType(e.target.value)}>
              <option value="ip">IP Address</option>
              <option value="domain">Domain</option>
              <option value="url">URL</option>
              <option value="hash">File Hash</option>
            </select>
            <input
              type="text"
              className="input flex-1"
              placeholder={
                indicatorType === 'ip' ? 'e.g. 185.220.101.34' :
                indicatorType === 'domain' ? 'e.g. evil-domain.example.com' :
                indicatorType === 'hash' ? 'e.g. SHA256 / MD5 hash' :
                'e.g. https://malicious.example.com/payload'
              }
              value={indicator}
              onChange={(e) => setIndicator(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runEnrich()}
            />
            <button className="btn-primary flex items-center gap-2" onClick={runEnrich} disabled={enriching || !indicator.trim()}>
              {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Enrich
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Checks the indicator against VirusTotal, AbuseIPDB, GreyNoise, and Shodan when API keys are configured.
            Set VIRUSTOTAL_API_KEY, ABUSEIPDB_API_KEY, GREYNOISE_API_KEY, SHODAN_API_KEY in backend env.
          </p>
        </div>

        {enrichError && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" /> {enrichError}
          </div>
        )}

        {enrichResult && (
          <div className="card">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${enrichResult.verdict === 'malicious' ? 'bg-red-500/10' : enrichResult.verdict === 'suspicious' ? 'bg-orange-500/10' : 'bg-green-500/10'}`}>
                  <Lock className={`w-5 h-5 ${enrichResult.verdict === 'malicious' ? 'text-red-400' : enrichResult.verdict === 'suspicious' ? 'text-orange-400' : 'text-green-400'}`} />
                </div>
                <div>
                  <p className="font-mono text-sm">{enrichResult.indicator}</p>
                  <p className="text-xs text-gray-500">Type: {enrichResult.indicator_type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {enrichResult.overall_score !== null && (
                  <div className="text-right">
                    <p className="text-2xl font-bold">{enrichResult.overall_score}</p>
                    <p className="text-xs text-gray-500 uppercase">Risk Score</p>
                  </div>
                )}
                <span className={`badge ${VERDICT_STYLE[enrichResult.verdict ?? 'no_providers']}`}>
                  {enrichResult.verdict ?? 'not evaluated'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
              {enrichResult.results.map((r) => (
                <div key={r.provider} className="p-3 rounded-lg bg-surface-lighter">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold capitalize">{r.provider.replace('_', ' ')}</span>
                    {r.success ? (
                      r.data?.score !== undefined && (
                        <span className={`text-sm font-bold ${(r.data.score as number) >= 75 ? 'text-red-400' : (r.data.score as number) >= 40 ? 'text-orange-400' : 'text-green-400'}`}>
                          {r.data.score}/100
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-gray-500">not configured</span>
                    )}
                  </div>
                  {r.success ? (
                    <pre className="text-xs text-gray-500 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {JSON.stringify(r.data, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-gray-500">{r.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
