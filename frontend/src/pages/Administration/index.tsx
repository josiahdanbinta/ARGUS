import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  Users, Building2, Shield, Settings, FileText, Plus, Search, X, Loader2,
  Pencil, Trash2, Ban, CheckCircle2, AlertTriangle, KeyRound, Bell,
} from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

const TABS = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
  { id: 'roles', label: 'Roles', icon: Shield },
  { id: 'channels', label: 'Channels', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  organization: string;
  isActive: boolean;
  lastLogin: string;
  createdAt: string;
  department: string;
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

interface PermissionItem {
  id: string;
  name: string;
  description: string | null;
  resource: string;
  action: string;
}

interface AuditLog {
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  ip: string;
}

interface NotificationChannel {
  id: string;
  channel_type: 'email' | 'slack' | 'sms';
  name: string;
  is_enabled: boolean;
  config: Record<string, string>;
  created_at: string;
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
  'user.updated': 'User Updated',
  'user.created': 'User Created',
  'user.deleted': 'User Deleted',
  'role.created': 'Role Created',
  'role.updated': 'Role Updated',
};

function mapUsers(raw: any[]): User[] {
  return raw.map((u: any) => ({
    id: u.id ?? u.user_id ?? '',
    username: u.username ?? u.user_name ?? '',
    email: u.email ?? '',
    fullName: u.full_name ?? u.fullName ?? u.name ?? '',
    role: u.role ?? u.role_name ?? '',
    organization: u.organization ?? u.org_name ?? u.organization_id ?? '',
    isActive: u.is_active ?? u.isActive ?? u.status !== 'Suspended',
    lastLogin: u.last_login ?? u.lastLogin ?? '',
    createdAt: u.created_at ?? u.createdAt ?? '',
    department: u.department ?? '',
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
    permissions: Array.isArray(r.permissions) ? r.permissions.length : r.permissions ?? r.permission_count ?? 0,
  }));
}

function mapAuditLogs(raw: any[]): AuditLog[] {
  return raw.map((a: any) => ({
    timestamp: a.timestamp ?? a.created_at ?? '',
    user: a.user ?? a.actor ?? a.username ?? '',
    action: a.action ?? a.event_type ?? '',
    resource: a.resource ?? a.target ?? '',
    ip: a.ip ?? a.source_ip ?? '',
  }));
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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

export default function Administration() {
  const [activeTab, setActiveTab] = useState<TabId>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isSecurityAdmin = currentUser?.role === 'security_admin' || isSuperAdmin;

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);

  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ channel_type: 'email', name: '', config: {} as Record<string, string> });
  const [channelFields, setChannelFields] = useState<Record<string, string>>({});
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState<User | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [showEditRole, setShowEditRole] = useState<{ id: string; name: string } | null>(null);

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const [newUser, setNewUser] = useState({
    email: '', username: '', full_name: '', password: '', role: 'read_only', department: '',
  });

  const [newRole, setNewRole] = useState({ name: '', description: '' });
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [editingPerms, setEditingPerms] = useState<string[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data } = await api.get('/users', { params: { page: 1, page_size: 100 } });
      const raw = data.items ?? data.data ?? data.results ?? data ?? [];
      setUsers(mapUsers(Array.isArray(raw) ? raw : []));
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

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
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const { data } = await api.get('/users/permissions');
      const raw = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setPermissions(Array.isArray(raw) ? raw : []);
    } catch {
      setPermissions([]);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
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
  }, []);

  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const { data } = await api.get('/notifications/channels');
      const raw = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setChannels(Array.isArray(raw) ? raw : []);
    } catch {
      setChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (activeTab === 'organizations') fetchOrganizations();
    if (activeTab === 'roles') {
      fetchRoles();
      fetchPermissions();
    }
    if (activeTab === 'audit-logs') fetchAuditLogs();
    if (activeTab === 'channels') fetchChannels();
  }, [activeTab, fetchOrganizations, fetchRoles, fetchPermissions, fetchAuditLogs, fetchChannels]);

  const runAction = async (fn: () => Promise<void>, successMsg: string) => {
    setFormError('');
    setFormSuccess('');
    setActionBusy(true);
    try {
      await fn();
      setFormSuccess(successMsg);
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err: any) {
      setFormError(err.response?.data?.detail ?? err.message ?? 'Action failed');
      setTimeout(() => setFormError(''), 4000);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateUser = () => {
    runAction(async () => {
      const payload = {
        email: newUser.email,
        username: newUser.username,
        full_name: newUser.full_name,
        password: newUser.password,
        role: newUser.role,
        department: newUser.department || undefined,
      };
      await api.post('/users', payload);
      setNewUser({ email: '', username: '', full_name: '', password: '', role: 'read_only', department: '' });
      setShowAddUser(false);
      await fetchUsers();
    }, `User ${newUser.email} created`);
  };

  const handleUpdateUser = (target: User, patch: Record<string, unknown>) => {
    runAction(async () => {
      await api.put(`/users/${target.id}`, patch);
      setShowEditUser(null);
      await fetchUsers();
    }, `User ${target.email} updated`);
  };

  const handleDeleteUser = (target: User) => {
    runAction(async () => {
      await api.delete(`/users/${target.id}`);
      setConfirmDelete(null);
      await fetchUsers();
    }, `User ${target.email} deleted`);
  };

  const handleCreateRole = () => {
    runAction(async () => {
      await api.post('/users/roles', { name: newRole.name, description: newRole.description, permission_ids: selectedPerms });
      setNewRole({ name: '', description: '' });
      setSelectedPerms([]);
      setShowCreateRole(false);
      await fetchRoles();
    }, `Role ${newRole.name} created`);
  };

  const handleUpdateRole = () => {
    if (!showEditRole) return;
    runAction(async () => {
      await api.put(`/users/roles/${showEditRole.id}`, { permission_ids: editingPerms });
      setShowEditRole(null);
      await fetchRoles();
    }, `Role ${showEditRole.name} updated`);
  };

  const handleCreateChannel = () => {
    runAction(async () => {
      await api.post('/notifications/channels', {
        channel_type: newChannel.channel_type,
        name: newChannel.name,
        config: channelFields,
      });
      setNewChannel({ channel_type: 'email', name: '', config: {} });
      setChannelFields({});
      setShowAddChannel(false);
      await fetchChannels();
    }, `Channel ${newChannel.name} created`);
  };

  const handleToggleChannel = (ch: NotificationChannel) => {
    runAction(async () => {
      await api.put(`/notifications/channels/${ch.id}`, { is_enabled: !ch.is_enabled });
      await fetchChannels();
    }, `${ch.name} ${ch.is_enabled ? 'disabled' : 'enabled'}`);
  };

  const handleDeleteChannel = (ch: NotificationChannel) => {
    runAction(async () => {
      await api.delete(`/notifications/channels/${ch.id}`);
      await fetchChannels();
    }, `Channel ${ch.name} deleted`);
  };

  const handleTestChannel = (ch: NotificationChannel) => {
    setTestingChannel(ch.id);
    runAction(async () => {
      await api.post(`/notifications/channels/${ch.id}/test`, {
        title: 'ARGUS Test Notification',
        message: 'This is a test notification from ARGUS SOAR.',
        severity: 'info',
      });
    }, `Test notification sent via ${ch.name}`);
  };

  const CHANNEL_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
    email: [
      { key: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Port', placeholder: '587' },
      { key: 'user', label: 'Username', placeholder: 'smtp@company.com' },
      { key: 'password', label: 'Password / App Password', placeholder: '••••••••' },
      { key: 'from', label: 'From Address', placeholder: 'noreply@company.com' },
      { key: 'to', label: 'Recipients (comma-separated)', placeholder: 'soc@company.com, lead@company.com' },
    ],
    slack: [
      { key: 'webhook_url', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'channel', label: 'Channel', placeholder: '#security-alerts' },
    ],
    sms: [
      { key: 'account_sid', label: 'Twilio Account SID', placeholder: 'AC...' },
      { key: 'auth_token', label: 'Twilio Auth Token', placeholder: '••••••••' },
      { key: 'from_number', label: 'Twilio From Number', placeholder: '+15005550006' },
      { key: 'to_number', label: 'Recipient Number', placeholder: '+15551234567' },
    ],
  };

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

      {formError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" /> {formError}
        </div>
      )}
      {formSuccess && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {formSuccess}
        </div>
      )}

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
            {isSuperAdmin && (
              <button className="btn-primary flex items-center gap-2" onClick={() => { setFormError(''); setShowAddUser(true); }}>
                <Plus className="w-4 h-4" />
                Add User
              </button>
            )}
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
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Last Login</th>
                      {isSecurityAdmin && <th className="px-6 py-3 font-medium text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const roleInfo = ROLE_CONFIG[user.role];
                      return (
                        <tr key={user.id || user.username} className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors">
                          <td className="px-6 py-3 font-mono text-xs text-argus-400">{user.username}</td>
                          <td className="px-6 py-3 text-gray-300">{user.email}</td>
                          <td className="px-6 py-3">{user.fullName}</td>
                          <td className="px-6 py-3">
                            <span className={`badge ${roleInfo?.color ?? 'badge-info'}`}>
                              {roleInfo?.label ?? user.role}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`badge ${user.isActive ? 'badge-success' : 'badge-medium'}`}>
                              {user.isActive ? 'Active' : 'Suspended'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-400">
                            {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                          </td>
                          {isSecurityAdmin && (
                            <td className="px-6 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => { setFormError(''); setShowEditUser(user); }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-argus-400 hover:bg-surface-border/40 transition-colors"
                                  title="Edit user"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                {isSuperAdmin && user.id !== currentUser?.id && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateUser(user, { is_active: !user.isActive })}
                                      className={`p-1.5 rounded-lg transition-colors ${
                                        user.isActive
                                          ? 'text-gray-400 hover:text-amber-400 hover:bg-surface-border/40'
                                          : 'text-gray-400 hover:text-green-400 hover:bg-surface-border/40'
                                      }`}
                                      title={user.isActive ? 'Suspend' : 'Reactivate'}
                                    >
                                      {user.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelete(user)}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-surface-border/40 transition-colors"
                                      title="Delete user"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
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
                      <span className={`badge mt-1 ${PLAN_BADGES[org.plan] ?? 'badge-info'}`}>{org.plan || 'Free'}</span>
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
                        style={{ width: `${Math.min(100, Math.round((org.endpointsUsed / (org.endpointsMax || 1)) * 100))}%` }}
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
            {isSuperAdmin && (
              <button className="btn-primary flex items-center gap-2" onClick={() => { setFormError(''); setShowCreateRole(true); }}>
                <Plus className="w-4 h-4" />
                Create Role
              </button>
            )}
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
                    <div className="flex items-center gap-2">
                      <span className="badge badge-info">{role.permissions} permissions</span>
                      {isSuperAdmin && (
                        <button
                          onClick={() => { setFormError(''); setEditingPerms([]); setShowEditRole({ id: role.id, name: role.name }); }}
                          className="p-1 rounded-lg text-gray-400 hover:text-argus-400 hover:bg-surface-border/40 transition-colors"
                          title="Edit permissions"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm">{role.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Configure external notification channels. Email uses SMTP, Slack uses an incoming webhook,
              and SMS uses Twilio. Click Test to verify delivery.
            </p>
            {isSuperAdmin && (
              <button className="btn-primary flex items-center gap-2" onClick={() => { setFormError(''); setChannelFields({}); setShowAddChannel(true); }}>
                <Plus className="w-4 h-4" />
                Add Channel
              </button>
            )}
          </div>

          {loadingChannels ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-argus-400 animate-spin" />
            </div>
          ) : channels.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No notification channels configured.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {channels.map((ch) => (
                <div key={ch.id} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`p-2 rounded-lg ${ch.channel_type === 'email' ? 'bg-blue-500/10 text-blue-400' : ch.channel_type === 'slack' ? 'bg-purple-500/10 text-purple-400' : 'bg-green-500/10 text-green-400'}`}>
                        <Bell className="w-5 h-5" />
                      </span>
                      <div>
                        <h3 className="font-semibold capitalize">{ch.name}</h3>
                        <span className="text-xs text-gray-500 capitalize">{ch.channel_type}</span>
                      </div>
                    </div>
                    <span className={`badge ${ch.is_enabled ? 'badge-success' : 'badge-medium'}`}>
                      {ch.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <pre className="text-xs text-gray-500 bg-surface-lighter rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {JSON.stringify(ch.config, null, 2)}
                  </pre>
                  {isSuperAdmin && (
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        className="btn-secondary flex-1 flex items-center justify-center gap-2 text-xs"
                        onClick={() => handleTestChannel(ch)}
                        disabled={actionBusy}
                      >
                        {testingChannel === ch.id && actionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                        Test
                      </button>
                      <button
                        className="btn-secondary flex-1 flex items-center justify-center gap-2 text-xs"
                        onClick={() => handleToggleChannel(ch)}
                        disabled={actionBusy}
                      >
                        {ch.is_enabled ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {ch.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-surface-border/40 transition-colors"
                        onClick={() => handleDeleteChannel(ch)}
                        disabled={actionBusy}
                        title="Delete channel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
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
                <select className="input" defaultValue="optional">
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
            </div>
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

      {/* Add User Modal */}
      {showAddUser && (
        <Modal title="Add User" onClose={() => setShowAddUser(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                className="input"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="analyst@company.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
                <input
                  type="text"
                  className="input"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="janedoe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
                <input
                  type="text"
                  className="input"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <input
                type="password"
                className="input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Min 8 characters"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Role</label>
                <select
                  className="input"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  {Object.entries(ROLE_CONFIG).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Department</label>
                <input
                  type="text"
                  className="input"
                  value={newUser.department}
                  onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                  placeholder="SOC"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleCreateUser}
                disabled={actionBusy || !newUser.email || !newUser.username || !newUser.password}
              >
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Create User
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit User Modal */}
      {showEditUser && (
        <Modal title={`Edit User — ${showEditUser.email}`} onClose={() => setShowEditUser(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Role</label>
              <select
                className="input"
                value={showEditUser.role}
                onChange={(e) => setShowEditUser({ ...showEditUser, role: e.target.value })}
              >
                {Object.entries(ROLE_CONFIG).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
              <input
                type="text"
                className="input"
                value={showEditUser.fullName}
                onChange={(e) => setShowEditUser({ ...showEditUser, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Department</label>
              <input
                type="text"
                className="input"
                value={showEditUser.department}
                onChange={(e) => setShowEditUser({ ...showEditUser, department: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => setShowEditUser(null)}>Cancel</button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => handleUpdateUser(showEditUser, {
                  role: showEditUser.role,
                  full_name: showEditUser.fullName,
                  department: showEditUser.department || undefined,
                })}
                disabled={actionBusy}
              >
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Role Modal */}
      {showCreateRole && (
        <Modal title="Create Role" onClose={() => setShowCreateRole(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Role Name</label>
              <input
                type="text"
                className="input"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                placeholder="tier1_analyst"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
              <input
                type="text"
                className="input"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                placeholder="Role responsibilities..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Permissions</label>
              {permissions.length === 0 ? (
                <p className="text-sm text-gray-500">No permissions found.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 border border-surface-border rounded-lg p-3">
                  {permissions.map((p) => (
                    <label key={p.id} className="flex items-start gap-2.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedPerms.includes(p.id)}
                        onChange={() =>
                          setSelectedPerms((prev) =>
                            prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                          )
                        }
                      />
                      <span>
                        <span className="font-medium">{p.name}</span>
                        <span className="block text-xs text-gray-500">{p.resource} / {p.action}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => setShowCreateRole(false)}>Cancel</button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleCreateRole}
                disabled={actionBusy || !newRole.name}
              >
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Role
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Role Permissions Modal */}
      {showEditRole && (
        <Modal title={`Edit Permissions — ${showEditRole.name}`} onClose={() => setShowEditRole(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Loading current permissions, then select which to assign. Leave as-is to keep current.
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-surface-border rounded-lg p-3">
              {permissions.map((p) => (
                <label key={p.id} className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={editingPerms.includes(p.id)}
                    onChange={() =>
                      setEditingPerms((prev) =>
                        prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                      )
                    }
                  />
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-gray-500">{p.resource} / {p.action}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => setShowEditRole(null)}>Cancel</button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleUpdateRole}
                disabled={actionBusy}
              >
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Permissions
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <Modal title="Confirm Deletion" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-amber-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-300">
                You are about to <strong>delete</strong> user <strong>{confirmDelete.email}</strong>.
                This will immediately suspend their account and remove access. This action is reversible
                only by reactivating the account.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 flex items-center gap-2 transition-colors"
                onClick={() => handleDeleteUser(confirmDelete)}
                disabled={actionBusy}
              >
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete User
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Channel Modal */}
      {showAddChannel && (
        <Modal title="Add Notification Channel" onClose={() => setShowAddChannel(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Channel Type</label>
              <select
                className="input"
                value={newChannel.channel_type}
                onChange={(e) => {
                  setNewChannel({ ...newChannel, channel_type: e.target.value as 'email' | 'slack' | 'sms' });
                  setChannelFields({});
                }}
              >
                <option value="email">Email (SMTP)</option>
                <option value="slack">Slack (Webhook)</option>
                <option value="sms">SMS (Twilio)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Name</label>
              <input
                type="text"
                className="input"
                value={newChannel.name}
                onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                placeholder="SOC Email Alerts"
              />
            </div>
            {CHANNEL_FIELDS[newChannel.channel_type].map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">{field.label}</label>
                <input
                  type={field.key.includes('password') || field.key.includes('token') ? 'password' : 'text'}
                  className="input"
                  value={channelFields[field.key] ?? ''}
                  onChange={(e) => setChannelFields({ ...channelFields, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => setShowAddChannel(false)}>Cancel</button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleCreateChannel}
                disabled={actionBusy || !newChannel.name}
              >
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Channel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
