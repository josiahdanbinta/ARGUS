import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../store';
import {
  LayoutDashboard, Bell, ShieldAlert, Activity, Radio, Crosshair, Server,
  Workflow, Shield, FileSearch, FileText, Users, Bot, Globe,
  ChevronLeft, ChevronRight, Menu, Search, LogOut, Settings, Zap, Download
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/alerts', label: 'Alerts', icon: Bell },
  { path: '/incidents', label: 'Incidents', icon: ShieldAlert },
  { path: '/siem', label: 'SIEM', icon: Activity },
  { path: '/threat-hunting', label: 'Threat Hunting', icon: Crosshair },
  { path: '/edr', label: 'EDR / XDR', icon: Radio },
  { path: '/agents', label: 'Agents', icon: Download },
  { path: '/assets', label: 'Assets', icon: Server },
  { path: '/soar', label: 'SOAR', icon: Workflow },
  { path: '/threat-intelligence', label: 'Threat Intel', icon: Globe },
  { path: '/mitre', label: 'MITRE ATT&CK', icon: Shield },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/ai-assistant', label: 'AI Assistant', icon: Bot },
  { path: '/compliance', label: 'Compliance', icon: FileSearch },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/administration', label: 'Administration', icon: Settings },
];

const ADMIN_ROLES = ['super_admin', 'security_admin', 'compliance_officer', 'auditor'];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { logout } = useAuth();
  const { sidebarOpen, toggleSidebar, user } = useAppStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const filteredNavItems = navItems.filter((item) => {
    if (item.path === '/administration') {
      return user ? ADMIN_ROLES.includes(user.role) : false;
    }
    return true;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-surface-light border-r border-surface-border flex flex-col transition-all duration-300 ease-in-out flex-shrink-0`}
      >
        <div className="h-16 flex items-center px-4 border-b border-surface-border">
          <div className="flex items-center gap-3 overflow-hidden">
            <Zap className="w-7 h-7 text-argus-500 flex-shrink-0" />
            {sidebarOpen && (
                <span className="font-bold text-lg text-gray-100 whitespace-nowrap">ARGUS</span>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 ${
                  isActive
                    ? 'bg-argus-600/20 text-argus-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-lighter'
                }`}
                title={item.label}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-surface-border">
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-2 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-surface-lighter transition-colors"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-surface-light border-b border-surface-border flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              className="text-gray-400 hover:text-gray-200 p-1"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 text-sm text-gray-300 hover:text-gray-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-argus-600/30 border border-argus-500/50 flex items-center justify-center text-xs font-medium text-argus-400">
                U
              </div>
            </button>
            <button
              onClick={logout}
              className="text-gray-500 hover:text-danger transition-colors p-2 rounded-lg hover:bg-surface-lighter"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
