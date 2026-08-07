import { useState, useEffect, useCallback } from 'react';
import { Users, Building2, Shield, Settings, FileText, Plus, Search, X, Loader2 } from 'lucide-react';
import api from '../../api/client';

const TABS = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
  { id: 'roles', label: 'Roles', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface User {
  username: string;
  email: string;
  fullName: string;
  role: string;
  organization: string;
  status: string;
  lastLogin: string;
}

interface Organization {
  id: string;
  name: string;
  plan: string;
  description: string;
  endpointsUsed: number;
  endpointsMax: number;
  users: number;
  status: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: number;
}

interface AuditLog {
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  ip: string;
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  super_admin: { label: 'Super Admin', color: 'badge-critical' },
  security_admin: { label: 'Security Admin', color: 'badge-high' },
  soc_manager: { label: 'SOC Manager', color: 'badge-high' },
  tier1_analyst: { label: 'Tier 1 Analyst', color: 'badge-info' },
  tier2_analyst: { label: 'Tier 2 Analyst', color: 'badge-info' },
  tier3_analyst: { label: 'Tier 3 Analyst', color: 'badge-medium' },
  threat_hunter: { label: 'Threat Hunter', color: 'badge-low' },
  compliance_officer: { label: 'Compliance Officer', color: 'badge-success' },
  incident_responder: { label: 'Incident Responder', color: 'badge-high' },
  auditor: { label: 'Auditor', color: 'badge-info' },
  customer_admin: { label: 'Customer Admin', color: 'badge-medium' },
  read_only: { label: 'Read Only', color: 'badge-low' },
};

const PLAN_BADGES: Record<string, string> = {
  Enterprise: 'badge-high',
  Professional: 'badge-info',
  Government: 'badge-critical',
};

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  user_created: 'User Created',
  incident_updated: 'Incident Updated',
  alert_assigned: 'Alert Assigned',
  endpoint_isolated: 'Endpoint Isolated',
  role_modified: 'Role Modified',
  case_closed: 'Case Closed',
  org_created: 'Org Created',
  threat_hunt_started: 'Threat Hunt Started',
  sla_config_changed: 'SLA Config Changed',
  compliance_report_generated: 'Compliance Report',
  alert_dismissed: 'Alert Dismissed',
  edr_policy_updated: 'EDR Policy Updated',
  playbook_executed: 'Playbook Executed',
};

function mapUsers(raw: any[]): User[] {
  return raw.map((u: any) => ({
    username: u.username ?? u.user_name ?? '',
    email: u.email ?? '',
    fullName: u.full_name ?? u.fullName ?? u.name ?? '',
    role: u.role ?? u.role_name ?? '',
    organization: u.organization ?? u.org_name ?? '',
    status: u.status ?? 'Active',
    lastLogin: u.last_login ?? u.lastLogin ?? '',
  }));
}

function mapOrganizations(raw: any[]): Organization[] {
  return raw.map((o: any) => ({
    id: o.id ?? o.org_id ?? '',
    name: o.name ?? '',
    plan: o.plan ?? o.subscription_plan ?? '',
    description: o.description ?? '',
    endpointsUsed: o.endpoints_used ?? o.endpointsUsed ?? o.endpoints_current ?? 0,
    endpointsMax: o.endpoints_max ?? o.endpointsMax ?? o.endpoints_limit ?? 1,
    users: o.users ?? o.user_count ?? 0,
    status: o.status ?? 'Active',
  }));
}

function mapRoles(raw: any[]): Role[] {
  return raw.map((r: any) => ({
    id: r.id ?? r.role_id ?? '',
    name: r.name ?? r.role_name ?? '',
    description: r.description ?? '',
    permissions: r.permissions ?? r.permission_count ?? 0,
  }));
}

function mapAuditLogs(raw: any[]): AuditLog[] {
  return raw.map((a: any) => ({
    timestamp: a.timestamp ?? a.created_at ?? '',
    user: a.user ?? a.actor ?? '',
    action: a.action ?? a.event_type ?? '',
    resource: a.resource ?? a.target ?? '',
    ip: a.ip ?? a.source_ip ?? '',
  }));
}

export default function Administration() {
  const [activeTab, setActiveTab] = useState<TabId>('users');
  const [searchQuery, setSearchQuery] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (users.length > 0) return;
    setLoadingUsers(true);
    try {
      const { data } = await api.get('/users', { params: { page: 1, page_size: 50 } });
      const raw = data.items ?? data.data ?? data.results ?? data ?? [];
      setUsers(mapUsers(Array.isArray(raw) ? raw : []));
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [users.length]);

  const fetchOrganizations = useCallback(async () => {
    if (organizations.length > 0) return;
    setLoadingOrgs(true);
    try {
      const { data } = await api.get('/organizations', { params: { page: 1, page_size: 50 } });
      const raw = data.items ?? data.data ?? data.results ?? data ?? [];
      setOrganizations(mapOrganizations(Array.isArray(raw) ? raw : []));
    } catch {
      setOrganizations([]);
    } finally {
      setLoadingOrgs(false);
    }
  }, [organizations.length]);

  const fetchRoles = useCallback(async () => {
    if (roles.length > 0) return;
    setLoadingRoles(true);
    try {
      const { data } = await api.get('/users/roles');
      const raw = data.items ?? data.data ?? data.results ?? data ?? [];
      setRoles(mapRoles(Array.isArray(raw) ? raw : []));
    } catch {
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, [roles.length]);

  const fetchAuditLogs = useCallback(async () => {
    if (auditLogs.length > 0) return;
    setLoadingAudit(true);
    try {
      const { data } = await api.get('/audit/logs', { params: { page: 1, page_size: 50 } });
      const raw = data.items ?? data.data ?? data.results ?? data ?? [];
      setAuditLogs(mapAuditLogs(Array.isArray(raw) ? raw : []));
    } catch {
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  }, [auditLogs.length]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (activeTab === 'organizations') fetchOrganizations();
    if (activeTab === 'roles') fetchRoles();
    if (activeTab === 'audit-logs') fetchAuditLogs();
  }, [activeTab, fetchOrganizations, fetchRoles, fetchAuditLogs]);

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administration</h1>
        <p className="text-gray-400 mt-1">Manage users, organizations, roles, settings, and audit logs</p>
      </div>

      <div className="flex border-b border-surface-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-argus-500 text-argus-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-surface-border">
                      <th className="px-6 py-3 font-medium">Username</th>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Full Name</th>
                      <th className="px-6 py-3 font-medium">Role</th>
                      <th className="px-6 py-3 font-medium">Organization</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const roleInfo = ROLE_CONFIG[user.role];
                      return (
                        <tr key={user.username} className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors">
                          <td className="px-6 py-3 font-mono text-xs text-argus-400">{user.username}</td>
                          <td className="px-6 py-3 text-gray-300">{user.email}</td>
                          <td className="px-6 py-3">{user.fullName}</td>
                          <td className="px-6 py-3">
                            <span className={`badge ${roleInfo?.color ?? 'badge-info'}`}>
                              {roleInfo?.label ?? user.role}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-400">{user.organization}</td>
                          <td className="px-6 py-3">
                            <span className={`badge ${user.status === 'Active' ? 'badge-success' : 'badge-medium'}`}>
                              {user.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-400">{user.lastLogin}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredUsers.length === 0 && !loadingUsers && (
                <div className="py-12 text-center text-gray-500">
                  {users.length === 0 ? 'No users found.' : `No users found matching "${searchQuery}"`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Organization
            </button>
          </div>

          {loadingOrgs ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
            </div>
          ) : organizations.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No organizations found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map((org) => (
                <div key={org.id} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{org.name}</h3>
                      <span className={`badge mt-1 ${PLAN_BADGES[org.plan] ?? 'badge-info'}`}>{org.plan}</span>
                    </div>
                    <span className={`badge ${org.status === 'Active' ? 'badge-success' : 'badge-medium'}`}>{org.status}</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-4">{org.description}</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Endpoints</span>
                      <span>
                        <span className="text-argus-400">{org.endpointsUsed.toLocaleString()}</span>
                        <span className="text-gray-500"> / {org.endpointsMax.toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="w-full bg-surface rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-argus-500 transition-all"
                        style={{ width: `${Math.round((org.endpointsUsed / (org.endpointsMax || 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Users</span>
                      <span className="text-argus-400">{org.users}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Role
            </button>
          </div>

          {loadingRoles ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
            </div>
          ) : roles.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No roles found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((role) => (
                <div key={role.id} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold">{role.name}</h3>
                    <span className="badge badge-info">{role.permissions} permissions</span>
                  </div>
                  <p className="text-gray-400 text-sm">{role.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-argus-400" />
              General
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Platform Name</label>
                <input type="text" className="input" defaultValue="ARGUS SOAR Platform" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Timezone</label>
                <select className="input" defaultValue="UTC">
                  <option>UTC</option>
                  <option>America/New_York (EST)</option>
                  <option>America/Chicago (CST)</option>
                  <option>America/Denver (MST)</option>
                  <option>America/Los_Angeles (PST)</option>
                  <option>Europe/London (GMT)</option>
                  <option>Europe/Berlin (CET)</option>
                  <option>Asia/Tokyo (JST)</option>
                  <option>Asia/Singapore (SGT)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Session Timeout (minutes)</label>
                <input type="number" className="input" defaultValue={30} min={5} max={480} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Default Language</label>
                <select className="input" defaultValue="en">
                  <option value="en">English</option>
                  <option value="es">Espa&ntilde;ol</option>
                  <option value="fr">Fran&ccedil;ais</option>
                  <option value="de">Deutsch</option>
                  <option value="ja">日本語</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-argus-400" />
              Security
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">MFA Enforcement</label>
                <select className="input" defaultValue="required">
                  <option value="required">Required for all users</option>
                  <option value="admin_only">Required for admins only</option>
                  <option value="optional">Optional</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password Policy</label>
                <select className="input" defaultValue="strong">
                  <option value="strong">Strong (12+ chars, MFA)</option>
                  <option value="medium">Medium (8+ chars, complexity)</option>
                  <option value="basic">Basic (8+ chars)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Session IP Locking</label>
                <select className="input" defaultValue="enabled">
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Audit Log Retention (days)</label>
                <input type="number" className="input" defaultValue={365} min={30} max={2555} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-argus-400" />
              AI Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">AI Model</label>
                <select className="input" defaultValue="gpt-4o">
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="gemini-2.0-pro">Gemini 2.0 Pro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">AI Provider</label>
                <select className="input" defaultValue="azure">
                  <option value="azure">Azure OpenAI Service</option>
                  <option value="openai">OpenAI API</option>
                  <option value="anthropic">Anthropic API</option>
                  <option value="google">Google AI (Vertex)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Temperature</label>
                <input type="number" className="input" defaultValue={0.7} min={0} max={2} step={0.1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Max Tokens</label>
                <input type="number" className="input" defaultValue={4096} min={256} max={32768} step={256} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary">Save Settings</button>
            <button className="btn-secondary">Reset to Defaults</button>
          </div>
        </div>
      )}

      {/* Audit Logs Tab */}
      {activeTab === 'audit-logs' && (
        <>
          {loadingAudit ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No audit logs found.</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-surface-border">
                      <th className="px-6 py-3 font-medium">Timestamp</th>
                      <th className="px-6 py-3 font-medium">User</th>
                      <th className="px-6 py-3 font-medium">Action</th>
                      <th className="px-6 py-3 font-medium">Resource</th>
                      <th className="px-6 py-3 font-medium">IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, i) => (
                      <tr key={i} className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors">
                        <td className="px-6 py-3 font-mono text-xs text-gray-400">{log.timestamp}</td>
                        <td className="px-6 py-3">{log.user}</td>
                        <td className="px-6 py-3">
                          <span className="badge badge-info">{ACTION_LABELS[log.action] ?? log.action}</span>
                        </td>
                        <td className="px-6 py-3 text-argus-400">{log.resource}</td>
                        <td className="px-6 py-3 font-mono text-xs text-gray-500">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
