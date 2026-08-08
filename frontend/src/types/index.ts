export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  mfa_enabled: boolean;
  organization_id: string | null;
  phone: string | null;
  department: string | null;
  avatar_url: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  domain: string | null;
  is_active: boolean;
  plan: string;
  max_endpoints: number;
  max_users: number;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  organization_id: string;
  name: string;
  asset_type: string;
  hostname: string | null;
  ip_address: string | null;
  operating_system: string | null;
  criticality: string;
  risk_score: number;
  last_seen: string | null;
  is_active: boolean;
}

export interface Endpoint {
  id: string;
  asset_id: string;
  agent_version: string | null;
  agent_status: string;
  isolation_status: string;
  cpu_usage: number | null;
  memory_usage: number | null;
  disk_usage: number | null;
  last_heartbeat: string | null;
}

export interface Alert {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  risk_score: number;
  status: string;
  category: string | null;
  description: string | null;
  recommendation: string | null;
  source: string | null;
  hostname: string | null;
  user: string | null;
  source_ip: string | null;
  country: string | null;
  mitre_techniques: string | null;
  evidence: string | null;
  confidence: number;
  assigned_to: string | null;
  incident_id: string | null;
  is_false_positive: boolean;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Incident {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  risk_score: number;
  assigned_to: string | null;
  mitre_techniques: string | null;
  affected_assets: string | null;
  affected_users: string | null;
  resolution: string | null;
  root_cause: string | null;
  ai_summary: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  notes?: IncidentNote[];
  tasks?: IncidentTask[];
  evidence?: Evidence[];
  timeline?: TimelineEvent[];
}

export interface IncidentNote {
  id: string;
  incident_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface IncidentTask {
  id: string;
  incident_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
}

export interface TimelineEvent {
  id: string;
  incident_id: string;
  event_type: string;
  title: string;
  description: string | null;
  source: string | null;
  user: string | null;
  timestamp: string;
  created_at: string;
}

export interface Evidence {
  id: string;
  incident_id: string;
  evidence_type: string;
  title: string;
  description: string | null;
  file_hash: string | null;
  file_size: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_enabled: boolean;
  is_approved: boolean;
  execution_count: number;
  last_executed: string | null;
}

export interface AISession {
  id: string;
  title: string | null;
  model: string;
  provider: string;
  agent_type: string;
  token_count: number;
  created_at: string;
  messages?: AIMessage[];
}

export interface AIMessage {
  id: string;
  role: string;
  content: string | null;
  token_count: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  items: T[];
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export interface DashboardMetrics {
  total_events: number;
  events_per_second: number;
  critical_alerts: number;
  active_alerts: number;
  active_incidents: number;
  total_incidents: number;
  endpoint_count: number;
  total_assets: number;
  threat_feed_status: string;
  risk_score: number;
  alert_severity: Record<string, number>;
  incident_status: Record<string, number>;
  recent_incidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    created_at: string | null;
  }>;
  top_sources: Array<{ source: string; count: number }>;
  top_categories: Array<{ category: string; count: number }>;
  endpoint_status: Record<string, number>;
  total_iocs: number;
  critical_iocs: number;
}
