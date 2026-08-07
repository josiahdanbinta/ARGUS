import { create } from 'zustand';
import api from '../api/client';
import type { User, Organization, Alert, Incident, DashboardMetrics } from '../types';

interface AppStore {
  user: User | null;
  organization: Organization | null;
  alerts: Alert[];
  incidents: Incident[];
  metrics: DashboardMetrics | null;
  sidebarOpen: boolean;

  setUser: (user: User | null) => void;
  setOrganization: (org: Organization | null) => void;
  setAlerts: (alerts: Alert[]) => void;
  setIncidents: (incidents: Incident[]) => void;
  setMetrics: (metrics: DashboardMetrics | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  fetchProfile: () => Promise<void>;
  fetchDashboard: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchIncidents: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  organization: null,
  alerts: [],
  incidents: [],
  metrics: null,
  sidebarOpen: true,

  setUser: (user) => set({ user }),
  setOrganization: (org) => set({ organization: org }),
  setAlerts: (alerts) => set({ alerts }),
  setIncidents: (incidents) => set({ incidents }),
  setMetrics: (metrics) => set({ metrics }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  fetchProfile: async () => {
    const { data } = await api.get('/auth/profile');
    set({ user: data });
  },

  fetchDashboard: async () => {
    const { data } = await api.get('/dashboard');
    set({ metrics: data.metrics });
  },

  fetchAlerts: async () => {
    const { data } = await api.get('/alerts', { params: { page_size: 50 } });
    set({ alerts: data.items });
  },

  fetchIncidents: async () => {
    const { data } = await api.get('/incidents', { params: { page_size: 50 } });
    set({ incidents: data.items });
  },
}));
