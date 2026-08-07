import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FileText,
  BarChart3,
  Shield,
  Globe,
  Bug,
  ClipboardCheck,
  Download,
  Eye,
  Clock,
  Loader,
} from 'lucide-react';
import api from '../../api/client';

const REPORT_TYPES = [
  {
    id: 'incident',
    icon: Shield,
    title: 'Incident Report',
    description: 'Summary of security incidents with response metrics and trends over time',
    accent: '#ef4444',
  },
  {
    id: 'executive',
    icon: BarChart3,
    title: 'Executive Report',
    description: 'High-level security posture metrics and KPIs for leadership review',
    accent: '#3b82f6',
  },
  {
    id: 'compliance',
    icon: ClipboardCheck,
    title: 'Compliance Report',
    description: 'Framework compliance status against SOC2, ISO 27001, PCI DSS, and NIST',
    accent: '#22c55e',
  },
  {
    id: 'threat-intel',
    icon: Globe,
    title: 'Threat Intelligence Report',
    description: 'Threat landscape overview with emerging threats and IOC analysis',
    accent: '#8b5cf6',
  },
  {
    id: 'vulnerability',
    icon: Bug,
    title: 'Vulnerability Report',
    description: 'Discovered vulnerabilities with severity breakdown and remediation status',
    accent: '#f59e0b',
  },
  {
    id: 'audit',
    icon: FileText,
    title: 'Audit Report',
    description: 'System audit trail summary with user activity and configuration changes',
    accent: '#06b6d4',
  },
];

interface RecentReport {
  id: string;
  name: string;
  type: string;
  generatedBy: string;
  created: string;
}

const TIME_RANGES = ['Last 7 days', 'Last 30 days', 'This Quarter', 'Custom'] as const;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function ReportsPage() {
  const [timeRange, setTimeRange] = useState<string>('Last 7 days');
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generatedType, setGeneratedType] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);

  const fetchInitialReports = useCallback(async () => {
    setPageLoading(true);
    try {
      await Promise.all([
        api.get('/reporting/incidents', { params: { incident_id: 'INC-2026-145' } }),
        api.get('/reporting/executive', { params: { time_range: '7d' } }),
      ]);
    } catch {
      // Initial fetch is optional prefetch
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialReports();
  }, [fetchInitialReports]);

  const filteredReports = useMemo(() => {
    if (recentReports.length === 0) return [];
    const now = Date.now();
    let cutoff = 0;
    switch (timeRange) {
      case 'Last 7 days':
        cutoff = now - 7 * 86400000;
        break;
      case 'Last 30 days':
        cutoff = now - 30 * 86400000;
        break;
      case 'This Quarter':
        cutoff = now - 90 * 86400000;
        break;
      default:
        return recentReports;
    }
    return recentReports.filter((r) => new Date(r.created).getTime() >= cutoff);
  }, [timeRange, recentReports]);

  const reportTypeLabel = (id: string) =>
    REPORT_TYPES.find((r) => r.id === id)?.title ?? id;

  async function handleGenerate(typeId: string) {
    setGenerating(typeId);
    setReportError(null);
    setGeneratedContent(null);

    try {
      let response;
      switch (typeId) {
        case 'incident':
          response = await api.get('/reporting/incidents', {
            params: { incident_id: 'INC-2026-145' },
          });
          break;
        case 'executive':
          response = await api.get('/reporting/executive', {
            params: { time_range: '7d' },
          });
          break;
        default:
          response = await api.get(`/reporting/${typeId}`);
          break;
      }
      const content =
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data, null, 2);
      setGeneratedContent(content);
      setGeneratedType(typeId);

      const newReport: RecentReport = {
        id: crypto.randomUUID(),
        name: `${reportTypeLabel(typeId)} - ${new Date().toLocaleDateString()}`,
        type: reportTypeLabel(typeId),
        generatedBy: 'System',
        created: new Date().toISOString(),
      };
      setRecentReports((prev) => [newReport, ...prev]);
    } catch (err: any) {
      setReportError(
        err.response?.data?.message || err.message || 'Failed to generate report',
      );
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Reports</h1>
        <p className="text-sm text-gray-400 mt-1">Generate and view security reports</p>
      </div>

      {pageLoading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader className="w-4 h-4 animate-spin" />
          Loading report data...
        </div>
      )}

      <div className="flex items-center gap-2">
        {TIME_RANGES.map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              timeRange === range
                ? 'bg-argus-600/20 text-argus-400 border-argus-500/30'
                : 'bg-surface-light text-gray-400 border-surface-border hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((report) => (
          <div key={report.id} className="card p-5 flex flex-col">
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${report.accent}1a` }}
              >
                <report.icon className="w-5 h-5" style={{ color: report.accent }} />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-200">{report.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{report.description}</p>
              </div>
            </div>

            <button
              onClick={() => handleGenerate(report.id)}
              disabled={generating === report.id}
              className="mt-auto w-full px-4 py-2 text-sm font-medium rounded-lg border border-surface-border bg-surface-light text-gray-200 hover:bg-surface-lighter hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating === report.id ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Generating...
                </span>
              ) : (
                'Generate'
              )}
            </button>
          </div>
        ))}
      </div>

      {reportError && (
        <div className="card p-4 border border-red-500/30 bg-red-500/10">
          <p className="text-red-400 text-sm font-medium">Error generating report</p>
          <p className="text-red-300 text-sm mt-1">{reportError}</p>
        </div>
      )}

      {generatedContent && generatedType && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
              <FileText className="w-5 h-5 text-argus-400" />
              {reportTypeLabel(generatedType)}
            </h2>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-surface-light border border-surface-border text-gray-300 hover:text-gray-100 hover:border-gray-600 transition-colors">
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
          <pre className="bg-surface-light border border-surface-border rounded-lg p-4 text-sm text-gray-300 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
            {generatedContent}
          </pre>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Recent Reports</h2>
        {recentReports.length === 0 ? (
          <p className="text-gray-500 text-sm">No reports generated yet. Click "Generate" on a report card above.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-light">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Report Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Generated By</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-surface-lighter/50 transition-colors">
                    <td className="px-4 py-3 text-gray-200 font-medium">{report.name}</td>
                    <td className="px-4 py-3 text-gray-400">{report.type}</td>
                    <td className="px-4 py-3 text-gray-400">{report.generatedBy}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(report.created)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-lighter transition-colors" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-lighter transition-colors" title="Download">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
