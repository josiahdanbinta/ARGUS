import { useState, useMemo } from 'react';
import {
  FileText,
  BarChart,
  Shield,
  Globe,
  Bug,
  ClipboardCheck,
  Download,
  Eye,
  Clock,
} from 'lucide-react';

const REPORT_TYPES = [
  {
    id: 'incident',
    icon: Shield,
    title: 'Incident Report',
    description: 'Summary of security incidents with response metrics and trends over time',
    accent: '#ef4444',
    lastGenerated: '2026-08-07T08:00:00Z',
  },
  {
    id: 'executive',
    icon: BarChart,
    title: 'Executive Report',
    description: 'High-level security posture metrics and KPIs for leadership review',
    accent: '#3b82f6',
    lastGenerated: '2026-08-06T14:00:00Z',
  },
  {
    id: 'compliance',
    icon: ClipboardCheck,
    title: 'Compliance Report',
    description: 'Framework compliance status against SOC2, ISO 27001, PCI DSS, and NIST',
    accent: '#22c55e',
    lastGenerated: '2026-08-05T10:00:00Z',
  },
  {
    id: 'threat-intel',
    icon: Globe,
    title: 'Threat Intelligence Report',
    description: 'Threat landscape overview with emerging threats and IOC analysis',
    accent: '#8b5cf6',
    lastGenerated: '2026-08-07T06:00:00Z',
  },
  {
    id: 'vulnerability',
    icon: Bug,
    title: 'Vulnerability Report',
    description: 'Discovered vulnerabilities with severity breakdown and remediation status',
    accent: '#f59e0b',
    lastGenerated: '2026-08-04T22:00:00Z',
  },
  {
    id: 'audit',
    icon: FileText,
    title: 'Audit Report',
    description: 'System audit trail summary with user activity and configuration changes',
    accent: '#06b6d4',
    lastGenerated: '2026-08-06T00:00:00Z',
  },
];

const RECENT_REPORTS = [
  { id: '1', name: 'Q3 Security Incident Summary', type: 'Incident Report', generatedBy: 'System', created: '2026-08-07T08:30:00Z' },
  { id: '2', name: 'August Executive Briefing', type: 'Executive Report', generatedBy: 'Sarah Chen', created: '2026-08-06T14:15:00Z' },
  { id: '3', name: 'Monthly Compliance Checklist', type: 'Compliance Report', generatedBy: 'System', created: '2026-08-05T10:00:00Z' },
  { id: '4', name: 'Weekly Threat Intelligence Digest', type: 'Threat Intelligence Report', generatedBy: 'System', created: '2026-08-07T06:00:00Z' },
  { id: '5', name: 'Vulnerability Scan Results - Aug 4', type: 'Vulnerability Report', generatedBy: 'System', created: '2026-08-04T22:00:00Z' },
  { id: '6', name: 'Audit Trail Review - Week 31', type: 'Audit Report', generatedBy: 'Marcus Webb', created: '2026-08-06T00:00:00Z' },
];

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

  const filteredReports = useMemo(() => {
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
        return RECENT_REPORTS;
    }
    return RECENT_REPORTS.filter((r) => new Date(r.created).getTime() >= cutoff);
  }, [timeRange]);

  function handleGenerate(typeId: string) {
    setGenerating(typeId);
    setTimeout(() => setGenerating(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Reports</h1>
        <p className="text-sm text-gray-400 mt-1">Generate and view security reports</p>
      </div>

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

            <div className="flex items-center gap-1 text-xs text-gray-500 mb-4">
              <Clock className="w-3 h-3" />
              <span>Last generated: {relativeTime(report.lastGenerated)}</span>
            </div>

            <button
              onClick={() => handleGenerate(report.id)}
              disabled={generating === report.id}
              className="mt-auto w-full px-4 py-2 text-sm font-medium rounded-lg border border-surface-border bg-surface-light text-gray-200 hover:bg-surface-lighter hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating === report.id ? 'Generating...' : 'Generate'}
            </button>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Recent Reports</h2>
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
      </section>
    </div>
  );
}
