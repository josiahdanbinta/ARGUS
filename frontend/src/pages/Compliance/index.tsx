import { useState, useEffect, useCallback } from 'react';
import {
  Shield, FileCheck, AlertTriangle, Loader2, ShieldCheck, ListChecks,
  FileText, Plus, X, CheckCircle2, Trash2, Scale, ClipboardList,
} from 'lucide-react';
import api from '../../api/client';

interface Framework {
  id: string;
  name: string;
  domain: string;
  total: number;
  compliant: number;
  nonCompliant: number;
  pct: number;
}

interface Control {
  id: string;
  name: string;
  domain: string;
  status?: string;
}

interface Policy {
  id: string;
  name: string;
  category: string;
  version: string;
  last_reviewed: string;
  owner: string;
}

interface Risk {
  id: string;
  title: string;
  description: string | null;
  category: string;
  likelihood: number;
  impact: number;
  score: number;
  status: string;
  owner: string | null;
  mitigation: string | null;
  created_at: string;
}

const TABS = [
  { id: 'frameworks', label: 'Frameworks', icon: ShieldCheck },
  { id: 'risks', label: 'Risk Register', icon: AlertTriangle },
  { id: 'controls', label: 'Controls', icon: ListChecks },
  { id: 'policies', label: 'Policies', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

const RISK_STATUS_STYLE: Record<string, string> = {
  identified: 'badge-high',
  assessing: 'badge-medium',
  mitigating: 'badge-info',
  monitoring: 'badge-low',
  accepted: 'badge-success',
  residual: 'badge-medium',
};

function riskSeverity(score: number) {
  if (score >= 20) return { label: 'Critical', color: '#ef4444' };
  if (score >= 12) return { label: 'High', color: '#f97316' };
  if (score >= 6) return { label: 'Medium', color: '#eab308' };
  return { label: 'Low', color: '#3b82f6' };
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-border/30">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function Compliance() {
  const [activeTab, setActiveTab] = useState<TabId>('frameworks');
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddRisk, setShowAddRisk] = useState(false);
  const [editRisk, setEditRisk] = useState<Risk | null>(null);
  const [riskForm, setRiskForm] = useState({
    title: '', description: '', category: 'General', likelihood: 3, impact: 3, status: 'identified', owner: '', mitigation: '',
  });
  const [formError, setFormError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchFrameworks = useCallback(async () => {
    try {
      const { data } = await api.get('/compliance/frameworks');
      const fwData = data.items ?? data.data ?? data.results ?? data ?? [];
      const mapped: Framework[] = Array.isArray(fwData)
        ? fwData.map((fw: any) => ({
            id: fw.id ?? '',
            name: fw.name ?? fw.id ?? '',
            domain: fw.domain ?? '',
            total: fw.total_controls ?? fw.total ?? 0,
            compliant: fw.compliant ?? 0,
            nonCompliant: fw.non_compliant ?? 0,
            pct: fw.compliance_percentage ?? fw.pct ?? fw.percentage ?? 0,
          }))
        : [];
      setFrameworks(mapped);
    } catch {
      setFrameworks([]);
    }
  }, []);

  const fetchRisks = useCallback(async () => {
    try {
      const { data } = await api.get('/compliance/risks');
      setRisks(Array.isArray(data) ? data : data.items ?? []);
    } catch {
      setRisks([]);
    }
  }, []);

  const fetchControls = useCallback(async (fwId: string) => {
    try {
      const { data } = await api.get(`/compliance/frameworks/${fwId}/controls`);
      setControls(Array.isArray(data) ? data : []);
    } catch {
      setControls([]);
    }
  }, []);

  const fetchPolicies = useCallback(async () => {
    try {
      const { data } = await api.get('/compliance/policies');
      setPolicies(Array.isArray(data) ? data : data.items ?? []);
    } catch {
      setPolicies([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchFrameworks(), fetchRisks(), fetchPolicies()]).finally(() => setLoading(false));
  }, [fetchFrameworks, fetchRisks, fetchPolicies]);

  useEffect(() => {
    if (activeTab === 'controls') {
      const fwId = selectedFramework ?? frameworks[0]?.id ?? 'iso27001';
      if (selectedFramework !== fwId) setSelectedFramework(fwId);
      fetchControls(fwId);
    }
  }, [activeTab, selectedFramework, frameworks, fetchControls]);

  const handleFrameworkClick = (fwId: string) => {
    setSelectedFramework(fwId);
    setActiveTab('controls');
    fetchControls(fwId);
  };

  const handleSaveRisk = () => {
    setFormError('');
    setActionBusy(true);
    const payload = {
      title: riskForm.title,
      description: riskForm.description || undefined,
      category: riskForm.category,
      likelihood: Number(riskForm.likelihood),
      impact: Number(riskForm.impact),
      status: riskForm.status,
      owner: riskForm.owner || undefined,
      mitigation: riskForm.mitigation || undefined,
    };
    const req = editRisk
      ? api.put(`/compliance/risks/${editRisk.id}`, payload)
      : api.post('/compliance/risks', payload);
    req
      .then(async () => {
        await fetchRisks();
        setShowAddRisk(false);
        setEditRisk(null);
        setRiskForm({ title: '', description: '', category: 'General', likelihood: 3, impact: 3, status: 'identified', owner: '', mitigation: '' });
        notify(editRisk ? 'Risk updated' : 'Risk added');
      })
      .catch((err: any) => setFormError(err.response?.data?.detail ?? err.message ?? 'Failed to save risk'))
      .finally(() => setActionBusy(false));
  };

  const handleDeleteRisk = (risk: Risk) => {
    api.delete(`/compliance/risks/${risk.id}`)
      .then(() => {
        fetchRisks();
        notify('Risk removed');
      })
      .catch(() => notify('Failed to delete risk'));
  };

  const openAddRisk = () => {
    setFormError('');
    setEditRisk(null);
    setRiskForm({ title: '', description: '', category: 'General', likelihood: 3, impact: 3, status: 'identified', owner: '', mitigation: '' });
    setShowAddRisk(true);
  };

  const openEditRisk = (risk: Risk) => {
    setFormError('');
    setEditRisk(risk);
    setRiskForm({
      title: risk.title,
      description: risk.description ?? '',
      category: risk.category,
      likelihood: risk.likelihood,
      impact: risk.impact,
      status: risk.status,
      owner: risk.owner ?? '',
      mitigation: risk.mitigation ?? '',
    });
    setShowAddRisk(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-argus-400 animate-spin" />
      </div>
    );
  }

  const overallPct = frameworks.length > 0
    ? Math.round(frameworks.reduce((s, f) => s + f.pct, 0) / frameworks.length)
    : 0;

  const highRisks = risks.filter((r) => r.score >= 12).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Governance, Risk & Compliance</h1>
          <p className="text-gray-400 mt-1">Security frameworks, risk register, controls, and policies</p>
        </div>
      </div>

      {toast && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <Shield className="w-8 h-8 text-argus-400 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Overall Score</p>
          <p className="text-3xl font-bold text-argus-400">{overallPct}%</p>
        </div>
        <div className="card text-center">
          <FileCheck className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm text-gray-400">Frameworks</p>
          <p className="text-3xl font-bold text-success">{frameworks.length}</p>
        </div>
        <div className="card text-center">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
          <p className="text-sm text-gray-400">Open Risks</p>
          <p className="text-3xl font-bold text-warning">{risks.length}</p>
        </div>
        <div className="card text-center">
          <Scale className="w-8 h-8 text-danger mx-auto mb-2" />
          <p className="text-sm text-gray-400">High+ Risks</p>
          <p className="text-3xl font-bold text-danger">{highRisks}</p>
        </div>
      </div>

      <div className="flex border-b border-surface-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-argus-500 text-argus-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'frameworks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {frameworks.length === 0 ? (
            <div className="col-span-full card py-12 text-center text-gray-500">No compliance frameworks found.</div>
          ) : (
            frameworks.map((fw) => (
              <button key={fw.id} className="card text-left hover:border-argus-500/50 transition-colors" onClick={() => handleFrameworkClick(fw.id)}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">{fw.name}</h3>
                  <span className="badge badge-info">{fw.total} controls</span>
                </div>
                {fw.domain && <p className="text-xs text-gray-500 mb-3">{fw.domain}</p>}
                <div className="w-full bg-surface rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${fw.pct}%`,
                      background: `linear-gradient(90deg, ${fw.pct >= 80 ? '#22c55e' : fw.pct >= 60 ? '#f59e0b' : '#ef4444'}, ${fw.pct >= 80 ? '#16a34a' : fw.pct >= 60 ? '#d97706' : '#dc2626'})`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-lg font-bold" style={{ color: fw.pct >= 80 ? '#22c55e' : fw.pct >= 60 ? '#f59e0b' : '#ef4444' }}>
                    {fw.pct}%
                  </p>
                  <span className="text-xs text-argus-400">View controls →</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {activeTab === 'risks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button className="btn-primary flex items-center gap-2" onClick={openAddRisk}>
              <Plus className="w-4 h-4" />
              Add Risk
            </button>
          </div>

          {risks.length === 0 ? (
            <div className="card py-12 text-center text-gray-500">No risks registered.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {risks.map((risk) => {
                const sev = riskSeverity(risk.score);
                return (
                  <div key={risk.id} className="card">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h3 className="font-semibold">{risk.title}</h3>
                        <span className="text-xs text-gray-500">{risk.category} · {risk.owner || 'Unassigned'}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="badge" style={{ backgroundColor: `${sev.color}1a`, color: sev.color, border: `1px solid ${sev.color}33` }}>
                          {sev.label}
                        </span>
                        <span className={`badge ${RISK_STATUS_STYLE[risk.status] ?? 'badge-info'}`}>{risk.status}</span>
                      </div>
                    </div>
                    {risk.description && <p className="text-sm text-gray-400 mb-3">{risk.description}</p>}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-center px-3 py-2 rounded-lg bg-surface-lighter">
                        <p className="text-xl font-bold">{risk.score}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Score</p>
                      </div>
                      <div className="text-center px-3 py-2 rounded-lg bg-surface-lighter">
                        <p className="text-xl font-bold">{risk.likelihood}/5</p>
                        <p className="text-[10px] text-gray-500 uppercase">Likelihood</p>
                      </div>
                      <div className="text-center px-3 py-2 rounded-lg bg-surface-lighter">
                        <p className="text-xl font-bold">{risk.impact}/5</p>
                        <p className="text-[10px] text-gray-500 uppercase">Impact</p>
                      </div>
                    </div>
                    {risk.mitigation && (
                      <p className="text-xs text-gray-500 bg-surface-lighter rounded-lg p-3 mb-3">
                        <span className="text-gray-400 font-medium">Mitigation: </span>{risk.mitigation}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">{new Date(risk.created_at).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2">
                        <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => openEditRisk(risk)}>Edit</button>
                        <button className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-surface-border/40" onClick={() => handleDeleteRisk(risk)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'controls' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-400">Framework:</span>
            {frameworks.map((fw) => (
              <button
                key={fw.id}
                onClick={() => { setSelectedFramework(fw.id); fetchControls(fw.id); }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedFramework === fw.id ? 'bg-argus-600/20 text-argus-400' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-border/40'
                }`}
              >
                {fw.name}
              </button>
            ))}
          </div>

          {controls.length === 0 ? (
            <div className="card py-12 text-center text-gray-500">No controls loaded for this framework.</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-surface-border">
                      <th className="px-6 py-3 font-medium">Control ID</th>
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Domain</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controls.map((c) => (
                      <tr key={c.id} className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors">
                        <td className="px-6 py-3 font-mono text-xs text-argus-400">{c.id}</td>
                        <td className="px-6 py-3">{c.name}</td>
                        <td className="px-6 py-3 text-gray-400">{c.domain}</td>
                        <td className="px-6 py-3">
                          <span className="badge badge-medium">Not Assessed</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'policies' && (
        <div className="card p-0 overflow-hidden">
          {policies.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No policies found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-surface-border">
                    <th className="px-6 py-3 font-medium">Policy</th>
                    <th className="px-6 py-3 font-medium">Category</th>
                    <th className="px-6 py-3 font-medium">Version</th>
                    <th className="px-6 py-3 font-medium">Last Reviewed</th>
                    <th className="px-6 py-3 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <tr key={p.id} className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <ClipboardList className="w-4 h-4 text-argus-400" />
                          <span className="font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-400">{p.category}</td>
                      <td className="px-6 py-3"><span className="badge badge-info">v{p.version}</span></td>
                      <td className="px-6 py-3 text-gray-400">{p.last_reviewed}</td>
                      <td className="px-6 py-3 text-gray-400">{p.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddRisk && (
        <Modal title={editRisk ? 'Edit Risk' : 'Add Risk'} onClose={() => { setShowAddRisk(false); setEditRisk(null); }}>
          <div className="space-y-4">
            {formError && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4" /> {formError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Risk Title</label>
              <input className="input" value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} placeholder="e.g. Phishing leading to ransomware" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
              <textarea className="input" rows={2} value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} placeholder="Describe the risk scenario" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Category</label>
                <input className="input" value={riskForm.category} onChange={(e) => setRiskForm({ ...riskForm, category: e.target.value })} placeholder="Malware" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Status</label>
                <select className="input" value={riskForm.status} onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })}>
                  <option value="identified">Identified</option>
                  <option value="assessing">Assessing</option>
                  <option value="mitigating">Mitigating</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="accepted">Accepted</option>
                  <option value="residual">Residual</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Likelihood (1-5)</label>
                <select className="input" value={riskForm.likelihood} onChange={(e) => setRiskForm({ ...riskForm, likelihood: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} - {n === 1 ? 'Rare' : n === 2 ? 'Unlikely' : n === 3 ? 'Possible' : n === 4 ? 'Likely' : 'Almost Certain'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Impact (1-5)</label>
                <select className="input" value={riskForm.impact} onChange={(e) => setRiskForm({ ...riskForm, impact: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} - {n === 1 ? 'Insignificant' : n === 2 ? 'Minor' : n === 3 ? 'Moderate' : n === 4 ? 'Major' : 'Severe'}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Owner</label>
              <input className="input" value={riskForm.owner} onChange={(e) => setRiskForm({ ...riskForm, owner: e.target.value })} placeholder="SOC Manager" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Mitigation</label>
              <textarea className="input" rows={2} value={riskForm.mitigation} onChange={(e) => setRiskForm({ ...riskForm, mitigation: e.target.value })} placeholder="How is this risk being managed?" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => { setShowAddRisk(false); setEditRisk(null); }}>Cancel</button>
              <button className="btn-primary flex items-center gap-2" onClick={handleSaveRisk} disabled={actionBusy || !riskForm.title}>
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {editRisk ? 'Save Changes' : 'Add Risk'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
