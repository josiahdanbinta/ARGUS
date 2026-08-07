import { Routes, Route, Navigate } from 'react-router-dom';
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
      <Route path="/compliance" element={<Compliance />} />
      <Route path="/search" element={<Search />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/administration" element={<Administration />} />
      <Route path="/ai-assistant" element={<AIAssistant />} />
      <Route path="/threat-intelligence" element={<ThreatIntelligence />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
