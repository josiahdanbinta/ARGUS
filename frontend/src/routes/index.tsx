import { Routes, Route, Navigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAppStore } from '../store';
import Dashboard from '../pages/Dashboard';
import Alerts from '../pages/Alerts';
import Incidents from '../pages/Incidents';
import IncidentDetail from '../pages/Incidents/IncidentDetail';
import SIEM from '../pages/SIEM';
import SOC from '../pages/SOC';
import EDR from '../pages/EDR';
import SOAR from '../pages/SOAR';
import ThreatHunting from '../pages/ThreatHunting';
import Assets from '../pages/Assets';
import MITRE from '../pages/MITRE';
import Compliance from '../pages/Compliance';
import Search from '../pages/Search';
import Reports from '../pages/Reports';
import Administration from '../pages/Administration';
import AIAssistant from '../pages/AIAssistant';
import ThreatIntelligence from '../pages/ThreatIntelligence';

const ADMIN_ROLES = ['super_admin', 'security_admin', 'compliance_officer', 'auditor'];

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user } = useAppStore();
  if (roles && user && !roles.includes(user.role)) {
    return (
      <div className="card text-center py-12">
        <Shield className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-gray-400">You do not have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/alerts" element={<Alerts />} />
      <Route path="/incidents" element={<Incidents />} />
      <Route path="/incidents/:id" element={<IncidentDetail />} />
      <Route path="/siem" element={<SIEM />} />
      <Route path="/soc" element={<SOC />} />
      <Route path="/edr" element={<EDR />} />
      <Route path="/soar" element={<SOAR />} />
      <Route path="/threat-hunting" element={<ThreatHunting />} />
      <Route path="/assets" element={<Assets />} />
      <Route path="/mitre" element={<MITRE />} />
      <Route path="/compliance" element={<ProtectedRoute roles={ADMIN_ROLES}><Compliance /></ProtectedRoute>} />
      <Route path="/search" element={<Search />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/administration" element={<ProtectedRoute roles={ADMIN_ROLES}><Administration /></ProtectedRoute>} />
      <Route path="/ai-assistant" element={<AIAssistant />} />
      <Route path="/threat-intelligence" element={<ThreatIntelligence />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
