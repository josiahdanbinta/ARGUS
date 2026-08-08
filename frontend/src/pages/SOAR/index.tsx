import { useState, useEffect, useCallback } from 'react';
import { Workflow, Play, Clock, CheckCircle, Plus, Zap, SlidersHorizontal, RotateCw, AlertCircle, Loader2 } from 'lucide-react';
import api from '../../api/client';

interface Playbook {
  id: string;
  name: string;
  triggerType: string;
  enabled: boolean;
  lastExecuted: string;
  executionCount: number;
}

interface Workflow {
  id: string;
  name: string;
  status: 'Draft' | 'Active' | 'Archived';
  stepsCount: number;
  created: string;
}

interface Job {
  id: string;
  playbookName: string;
  status: 'Running' | 'Completed' | 'Failed';
  started: string;
  duration: string;
}

function mapPlaybook(raw: any): Playbook {
  return {
    id: raw.id,
    name: raw.name,
    triggerType: raw.trigger_type ?? 'New Alert',
    enabled: raw.is_enabled,
    lastExecuted: raw.last_executed ?? '-',
    executionCount: raw.execution_count ?? 0,
  };
}

function mapWorkflow(raw: any): Workflow {
  return {
    id: raw.id,
    name: raw.name,
    status: (raw.status ?? 'Draft').charAt(0).toUpperCase() + (raw.status ?? 'Draft').slice(1),
    stepsCount: 0,
    created: raw.created_at ?? '-',
  };
}

function mapJob(raw: any): Job {
  return {
    id: raw.id,
    playbookName: raw.name ?? raw.playbook_id ?? '-',
    status: (raw.status ?? 'pending').charAt(0).toUpperCase() + (raw.status ?? 'pending').slice(1),
    started: raw.started_at ?? raw.created_at ?? '-',
    duration: '-',
  };
}

const triggerStyle: Record<string, string> = {
  'New Alert': 'badge-info',
  'Critical Alert': 'badge-critical',
  'IOC Match': 'badge-high',
  'Scheduled': 'badge-low',
};

const workflowStatusStyle: Record<string, string> = {
  'Active': 'badge-success',
  'Draft': 'badge-high',
  'Archived': 'badge-medium',
};

const jobStatusStyle: Record<Job['status'], string> = {
  'Running': 'badge-low',
  'Completed': 'badge-success',
  'Failed': 'badge-critical',
};

export default function SOARPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [pbLoading, setPbLoading] = useState(true);
  const [wfLoading, setWfLoading] = useState(true);
  const [jobLoading, setJobLoading] = useState(true);

  const [pbError, setPbError] = useState<string | null>(null);
  const [wfError, setWfError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const [executing, setExecuting] = useState<string | null>(null);

  const fetchPlaybooks = useCallback(async () => {
    setPbLoading(true);
    setPbError(null);
    try {
      const { data } = await api.get('/soar/playbooks', { params: { page: 1, page_size: 50 } });
      const items = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setPlaybooks(items.map(mapPlaybook));
    } catch {
      setPbError('Failed to load playbooks');
    } finally {
      setPbLoading(false);
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    setWfLoading(true);
    setWfError(null);
    try {
      const { data } = await api.get('/soar/workflows', { params: { page: 1, page_size: 50 } });
      const items = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setWorkflows(items.map(mapWorkflow));
    } catch {
      setWfError('Failed to load workflows');
    } finally {
      setWfLoading(false);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    setJobLoading(true);
    setJobError(null);
    try {
      const { data } = await api.get('/soar/jobs', { params: { page: 1, page_size: 10 } });
      const items = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setJobs(items.map(mapJob));
    } catch {
      setJobError('Failed to load jobs');
    } finally {
      setJobLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaybooks();
    fetchWorkflows();
    fetchJobs();
  }, [fetchPlaybooks, fetchWorkflows, fetchJobs]);

  const togglePlaybook = async (id: string) => {
    const current = playbooks.find((p) => p.id === id);
    if (!current) return;
    const updated = { ...current, enabled: !current.enabled };
    setPlaybooks((prev) => prev.map((p) => (p.id === id ? updated : p)));
    try {
      await api.put(`/soar/playbooks/${id}`, { is_enabled: updated.enabled });
    } catch {
      setPlaybooks((prev) => prev.map((p) => (p.id === id ? current : p)));
    }
  };

  const handleCreatePlaybook = async () => {
    const name = prompt('Enter playbook name:');
    if (!name?.trim()) return;
    const trigger = prompt('Enter trigger type (e.g. New Alert, Critical Alert, IOC Match, Scheduled):');
    try {
      const { data } = await api.post('/soar/playbooks', {
        name: name.trim(),
        trigger_type: (trigger && trigger.trim()) ? trigger.trim() : 'New Alert',
      });
      const created = data.data ?? data;
      setPlaybooks((prev) => [...prev, mapPlaybook(created)]);
    } catch {
      alert('Failed to create playbook');
    }
  };

  const handleExecute = async (id: string) => {
    setExecuting(id);
    try {
      await api.post(`/soar/playbooks/${id}/execute`);
      await fetchJobs();
    } catch {
      alert('Failed to execute playbook');
    } finally {
      setExecuting(null);
    }
  };

  const totalPlaybooks = playbooks.length;
  const activePlaybooks = playbooks.filter((p) => p.enabled).length;
  const jobsToday = jobs.length;
  const completedJobs = jobs.filter((j) => j.status === 'Completed').length;
  const successRate = jobs.length > 0 ? `${((completedJobs / jobs.length) * 100).toFixed(1)}%` : '—';

  const statCards = [
    { label: 'Total Playbooks', value: totalPlaybooks, icon: Workflow, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Active Playbooks', value: activePlaybooks, icon: Play, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Jobs Today', value: jobsToday, icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Success Rate', value: successRate, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">SOAR</h1>
        <p className="text-gray-400 mt-1">Security Orchestration, Automation &amp; Response</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className={`${stat.bg} p-3 rounded-lg`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm text-gray-400">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-100">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
              <Zap className="w-5 h-5 text-argus-400" />
              Playbooks
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Automated response procedures</p>
          </div>
          <button onClick={handleCreatePlaybook} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Playbook
          </button>
        </div>

        {pbError && (
          <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {pbError}
            </div>
            <button onClick={fetchPlaybooks} className="text-red-400 hover:text-red-300 text-sm font-medium">
              Retry
            </button>
          </div>
        )}

        {pbLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
          </div>
        ) : playbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Zap className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No playbooks found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-gray-400">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">Trigger Type</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Last Executed</th>
                  <th className="text-right py-3 px-4 font-medium">Executions</th>
                  <th className="text-right py-3 px-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {playbooks.map((pb) => (
                  <tr key={pb.id} className="border-b border-surface-border hover:bg-surface-lighter/50 transition-colors">
                    <td className="py-3 px-4 text-gray-200 font-medium">{pb.name}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${triggerStyle[pb.triggerType] ?? 'badge-low'}`}>{pb.triggerType}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => togglePlaybook(pb.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          pb.enabled ? 'bg-green-600' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            pb.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="py-3 px-4 text-gray-400 font-mono text-xs">{pb.lastExecuted}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{pb.executionCount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleExecute(pb.id)}
                        disabled={executing === pb.id}
                        className="text-gray-400 hover:text-argus-400 transition-colors p-1 rounded hover:bg-surface-lighter disabled:opacity-50"
                      >
                        {executing === pb.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-argus-400" />
              Workflows
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Custom investigation and response workflows</p>
          </div>
          <button className="btn-secondary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        </div>

        {wfError && (
          <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {wfError}
            </div>
            <button onClick={fetchWorkflows} className="text-red-400 hover:text-red-300 text-sm font-medium">
              Retry
            </button>
          </div>
        )}

        {wfLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <SlidersHorizontal className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No workflows found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-gray-400">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Steps</th>
                  <th className="text-left py-3 px-4 font-medium">Created</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => (
                  <tr key={wf.id} className="border-b border-surface-border hover:bg-surface-lighter/50 transition-colors">
                    <td className="py-3 px-4 text-gray-200 font-medium">{wf.name}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${workflowStatusStyle[wf.status]}`}>{wf.status}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-300">{wf.stepsCount}</td>
                    <td className="py-3 px-4 text-gray-400">{wf.created}</td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-gray-400 hover:text-argus-400 transition-colors p-1 rounded hover:bg-surface-lighter">
                        <Play className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
              <RotateCw className="w-5 h-5 text-argus-400" />
              Automation Jobs
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Recent playbook executions</p>
          </div>
        </div>

        {jobError && (
          <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {jobError}
            </div>
            <button onClick={fetchJobs} className="text-red-400 hover:text-red-300 text-sm font-medium">
              Retry
            </button>
          </div>
        )}

        {jobLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <RotateCw className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No automation jobs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-gray-400">
                  <th className="text-left py-3 px-4 font-medium">Playbook</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Started</th>
                  <th className="text-right py-3 px-4 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-surface-border hover:bg-surface-lighter/50 transition-colors">
                    <td className="py-3 px-4 text-gray-200 font-medium">{job.playbookName}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${jobStatusStyle[job.status]}`}>
                        <span className="flex items-center gap-1.5">
                          {job.status === 'Running' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          {job.status}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400 font-mono text-xs">{job.started}</td>
                    <td className="py-3 px-4 text-right text-gray-400 font-mono">{job.duration}</td>
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
