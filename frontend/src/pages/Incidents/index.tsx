import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Plus, Filter, Search, Loader2, AlertCircle, RefreshCw, X } from 'lucide-react';
import api from '../../api/client';
import type { Incident, PaginatedResponse } from '../../types';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  informational: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  investigating: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  contained: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  closed: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    risk_score: 50,
    mitre_techniques: '',
    affected_assets: '',
    affected_users: '',
  });

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<Incident>>('/incidents', {
        params: { page: 1, page_size: 50 },
      });
      setIncidents(data.items ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load incidents';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const openModal = useCallback(() => {
    setForm({
      title: '',
      description: '',
      severity: 'medium',
      risk_score: 50,
      mitre_techniques: '',
      affected_assets: '',
      affected_users: '',
    });
    setCreateError(null);
    setShowModal(true);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setCreateError('Title is required');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await api.post('/incidents', form);
      setShowModal(false);
      await fetchIncidents();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create incident';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  const displayIncidents = useMemo(() => {
    return [...incidents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .filter((inc) => severityFilter === 'All' || inc.severity === severityFilter.toLowerCase())
      .filter((inc) => statusFilter === 'All' || inc.status.toLowerCase() === statusFilter.toLowerCase())
      .filter((inc) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return inc.title.toLowerCase().includes(q)
          || (inc.assigned_to ?? '').toLowerCase().includes(q)
          || (inc.affected_assets ?? '').toLowerCase().includes(q);
      });
  }, [incidents, severityFilter, statusFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-argus-400" />
          <h1 className="text-2xl font-bold text-gray-100">Incidents</h1>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-argus-600/20 text-argus-400 border border-argus-500/30">
            {displayIncidents.length}
          </span>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Incident
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-2 bg-surface-light border border-surface-border rounded-lg px-3 py-2 flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-argus-500 transition-colors cursor-pointer"
          >
            <option value="All">All Status</option>
            <option value="New">New</option>
            <option value="Investigating">Investigating</option>
            <option value="Contained">Contained</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <AlertCircle className="w-12 h-12 mb-4 text-red-400" />
          <p className="text-lg text-gray-300 mb-1">Failed to load incidents</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchIncidents}
            className="btn-primary inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && displayIncidents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <ShieldAlert className="w-12 h-12 mb-4 text-gray-600" />
          <p className="text-lg">No incidents found</p>
          <p className="text-sm">Try adjusting your filters</p>
        </div>
      )}

      {!loading && !error && displayIncidents.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Risk Score</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Assigned To</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Affected Assets</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {displayIncidents.map((incident) => (
                <tr
                  key={incident.id}
                  className="hover:bg-surface-lighter/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${severityColors[incident.severity] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {incident.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/incidents/${incident.id}`}
                      className="text-argus-400 hover:text-ARGUS-300 font-medium transition-colors max-w-xs truncate block"
                    >
                      {incident.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded ${
                      incident.risk_score >= 80 ? 'bg-red-500/20 text-red-400' :
                      incident.risk_score >= 60 ? 'bg-orange-500/20 text-orange-400' :
                      incident.risk_score >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {incident.risk_score}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border capitalize ${statusColors[incident.status.toLowerCase()] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {incident.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{incident.assigned_to ?? 'Unassigned'}</td>
                  <td className="px-4 py-3 text-gray-400 max-w-[180px] truncate">{incident.affected_assets ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(incident.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface-light border border-surface-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-semibold text-gray-100">Create Incident</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-300 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Ransomware infection on payroll server"
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief summary of the incident"
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                    Severity
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                    className="input w-full"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="informational">Informational</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                    Risk Score
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.risk_score}
                    onChange={(e) => setForm({ ...form, risk_score: Number(e.target.value) })}
                    className="input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                  MITRE ATT&CK Techniques
                </label>
                <input
                  type="text"
                  value={form.mitre_techniques}
                  onChange={(e) => setForm({ ...form, mitre_techniques: e.target.value })}
                  placeholder="e.g., T1486, T1059.001"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                  Affected Assets
                </label>
                <input
                  type="text"
                  value={form.affected_assets}
                  onChange={(e) => setForm({ ...form, affected_assets: e.target.value })}
                  placeholder="e.g., payroll-server-01, dc-02"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                  Affected Users
                </label>
                <input
                  type="text"
                  value={form.affected_users}
                  onChange={(e) => setForm({ ...form, affected_users: e.target.value })}
                  placeholder="e.g., j.doe@example.com"
                  className="input w-full"
                />
              </div>

              {createError && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-gray-300 hover:bg-surface-lighter transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-argus-600 hover:bg-argus-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Incident'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
