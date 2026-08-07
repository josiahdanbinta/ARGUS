import { useState, useEffect, useCallback } from 'react';
import { Shield, FileCheck, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../../api/client';

interface Framework {
  id: string;
  name: string;
  total: number;
  compliant: number;
  nonCompliant: number;
  pct: number;
}

export default function Compliance() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fwRes] = await Promise.all([
        api.get('/compliance/frameworks'),
      ]);
      const fwData = fwRes.data.items ?? fwRes.data.data ?? fwRes.data.results ?? fwRes.data ?? [];
      const mapped: Framework[] = Array.isArray(fwData)
        ? fwData.map((fw: any) => ({
            id: fw.id ?? fw.name ?? '',
            name: fw.name ?? fw.id ?? '',
            total: fw.total ?? fw.controls_total ?? 0,
            compliant: fw.compliant ?? fw.controls_compliant ?? 0,
            nonCompliant: fw.non_compliant ?? fw.controls_non_compliant ?? 0,
            pct: fw.pct ?? fw.compliance_percentage ?? fw.percentage ?? 0,
          }))
        : [];
      setFrameworks(mapped);
    } catch {
      setFrameworks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const overallPct = frameworks.length > 0
    ? Math.round(frameworks.reduce((s, f) => s + f.pct, 0) / frameworks.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-argus-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compliance</h1>
        <p className="text-gray-400 mt-1">Track compliance across security frameworks</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <Shield className="w-8 h-8 text-argus-400 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Overall Score</p>
          <p className="text-3xl font-bold text-argus-400">{overallPct}%</p>
        </div>
        <div className="card text-center">
          <FileCheck className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm text-gray-400">Frameworks Assessed</p>
          <p className="text-3xl font-bold text-success">{frameworks.length}</p>
        </div>
        <div className="card text-center">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
          <p className="text-sm text-gray-400">Controls Non-Compliant</p>
          <p className="text-3xl font-bold text-warning">
            {frameworks.reduce((s, f) => s + f.nonCompliant, 0)}
          </p>
        </div>
      </div>

      {frameworks.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">No compliance frameworks found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {frameworks.map((fw) => (
            <div key={fw.id} className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{fw.name}</h3>
                <span className="badge badge-info">{fw.total} controls</span>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-success">{fw.compliant} compliant</span>
                  <span className="text-danger">{fw.nonCompliant} non-compliant</span>
                  <span className="text-gray-500">
                    {fw.total - fw.compliant - fw.nonCompliant} not assessed
                  </span>
                </div>
                <div className="w-full bg-surface rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${fw.pct}%`,
                      background: `linear-gradient(90deg, ${fw.pct >= 80 ? '#22c55e' : fw.pct >= 60 ? '#f59e0b' : '#ef4444'}, ${fw.pct >= 80 ? '#16a34a' : fw.pct >= 60 ? '#d97706' : '#dc2626'})`,
                    }}
                  />
                </div>
              </div>
              <p
                className="text-center text-lg font-bold"
                style={{ color: fw.pct >= 80 ? '#22c55e' : fw.pct >= 60 ? '#f59e0b' : '#ef4444' }}
              >
                {fw.pct}%
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
