import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Server, AlertTriangle, TrendingUp, Clock, Search, Filter, Loader2, AlertCircle, RefreshCw,
  Monitor, Database, Cloud, Eye, ScanLine, HardDrive, Wifi,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import api from "../../api/client";

interface Asset {
  id: string;
  name: string;
  type: string;
  hostname: string;
  ip: string;
  os: string;
  criticality: string;
  riskScore: number;
  lastSeen: string;
  status: string;
}

function mapAsset(raw: any): Asset {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.asset_type ?? raw.type ?? 'Server',
    hostname: raw.hostname ?? '-',
    ip: raw.ip_address ?? '-',
    os: raw.operating_system ?? 'Unknown',
    criticality: raw.criticality ?? 'low',
    riskScore: raw.risk_score ?? 0,
    lastSeen: raw.last_seen ?? '-',
    status: raw.is_active === false ? 'Offline' : (raw.status ?? 'Online'),
  };
}

function isRecentlySeen(lastSeen: string): boolean {
  if (!lastSeen || lastSeen === '-') return false;
  const ts = new Date(lastSeen).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < 24 * 60 * 60 * 1000;
}

const TYPE_ICONS: Record<string, typeof Server> = {
  Server: Server,
  Laptop: Monitor,
  Desktop: Monitor,
  Container: HardDrive,
  VM: Cloud,
  Cloud: Cloud,
  Network: Wifi,
};

const CRITICALITY_COLORS: Record<string, string> = {
  critical: "badge-critical",
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low",
};

const STATUS_COLORS: Record<string, string> = {
  Online: "bg-green-500",
  Offline: "bg-gray-500",
  Maintenance: "bg-yellow-500",
};

const assetTypes = ["All", "Server", "Laptop", "Desktop", "Container", "VM", "Cloud", "Network"];
const criticalityLevels = ["All", "critical", "high", "medium", "low"];

const CHART_COLORS: Record<string, string> = {
  Server: "#3b82f6",
  Laptop: "#8b5cf6",
  Desktop: "#06b6d4",
  Container: "#f59e0b",
  VM: "#10b981",
  Cloud: "#6366f1",
  Network: "#ef4444",
};

export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [criticalityFilter, setCriticalityFilter] = useState<string>("All");

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/assets", { params: { page: 1, page_size: 50 } });
      const raw = data.items ?? data.data ?? data.results ?? data ?? [];
      setAssets((Array.isArray(raw) ? raw : []).map(mapAsset));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? err.message ?? "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const stats = useMemo(() => {
    const total = assets.length;
    const critical = assets.filter((a) => a.criticality === "critical").length;
    const highRisk = assets.filter((a) => a.criticality === "high").length;
    const recentlySeen = assets.filter((a) => isRecentlySeen(a.lastSeen)).length;
    return { total, critical, highRisk, recentlySeen };
  }, [assets]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const q = search.toLowerCase();
      const matchesSearch =
        a.name?.toLowerCase().includes(q) ||
        a.hostname?.toLowerCase().includes(q) ||
        a.ip?.toLowerCase().includes(q);
      const matchesType = typeFilter === "All" || a.type === typeFilter;
      const matchesCriticality = criticalityFilter === "All" || a.criticality === criticalityFilter;
      return matchesSearch && matchesType && matchesCriticality;
    });
  }, [assets, search, typeFilter, criticalityFilter]);

  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach((a) => {
      counts[a.type] = (counts[a.type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [assets]);

  const selectClasses =
    "bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-argus-500 focus:border-transparent transition-all appearance-none cursor-pointer";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-argus-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
        <button onClick={fetchAssets} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Assets</h1>
        <p className="text-gray-500 mt-1">Managed asset inventory and risk tracking</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <Server className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-100">{stats.total}</p>
            <p className="text-sm text-gray-500">Total Assets</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-100">{stats.critical}</p>
            <p className="text-sm text-gray-500">Critical</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-100">{stats.highRisk}</p>
            <p className="text-sm text-gray-500">High Risk</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-100">{stats.recentlySeen}</p>
            <p className="text-sm text-gray-500">Recently Seen</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by name, hostname, or IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`${selectClasses} pl-9 pr-8`}
            >
              {assetTypes.map((t) => (
                <option key={t} value={t} className="bg-surface">
                  {t === "All" ? "All Types" : t}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={criticalityFilter}
              onChange={(e) => setCriticalityFilter(e.target.value)}
              className={`${selectClasses} pl-9 pr-8`}
            >
              {criticalityLevels.map((c) => (
                <option key={c} value={c} className="bg-surface">
                  {c === "All" ? "All Criticality" : c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-surface-border">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Hostname</th>
                <th className="pb-3 font-medium">IP</th>
                <th className="pb-3 font-medium">OS</th>
                <th className="pb-3 font-medium">Criticality</th>
                <th className="pb-3 font-medium">Risk Score</th>
                <th className="pb-3 font-medium">Last Seen</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => {
                const TypeIcon = TYPE_ICONS[asset.type] || Server;
                return (
                  <tr key={asset.id} className="border-b border-surface-border hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <TypeIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="font-medium text-gray-200 whitespace-nowrap">{asset.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{asset.type}</td>
                    <td className="py-3 pr-4 text-gray-400 font-mono text-xs">{asset.hostname}</td>
                    <td className="py-3 pr-4 text-gray-400 font-mono text-xs whitespace-nowrap">{asset.ip}</td>
                    <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{asset.os}</td>
                    <td className="py-3 pr-4">
                      <span className={`badge ${CRITICALITY_COLORS[asset.criticality] ?? "badge-info"}`}>
                        {asset.criticality}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              asset.riskScore >= 80
                                ? "bg-red-500"
                                : asset.riskScore >= 60
                                ? "bg-orange-500"
                                : asset.riskScore >= 40
                                ? "bg-yellow-500"
                                : "bg-blue-500"
                            }`}
                            style={{ width: `${asset.riskScore}%` }}
                          />
                        </div>
                        <span className="text-gray-400 font-mono text-xs w-8">{asset.riskScore}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">{asset.lastSeen}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[asset.status] ?? "bg-gray-500"}`} />
                        <span className="text-gray-400 text-xs">{asset.status}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-lg text-gray-500 hover:text-argus-400 hover:bg-argus-600/10 transition-colors" title="View Details">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-lg text-gray-500 hover:text-argus-400 hover:bg-argus-600/10 transition-colors" title="Scan">
                          <ScanLine className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-600">
                    {assets.length === 0 ? "No assets found." : "No assets match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {typeDistribution.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Asset Type Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={typeDistribution} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 72 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 12, fill: "#d1d5db" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "13px" }}
                labelStyle={{ color: "#d1d5db" }}
                formatter={(value: number) => [value, "Count"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                {typeDistribution.map((entry) => (
                  <Cell key={entry.type} fill={CHART_COLORS[entry.type] || "#6b7280"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
