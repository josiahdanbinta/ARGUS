import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckSquare, FileText, MessageSquare, ShieldAlert, Send, Loader2, AlertCircle, RefreshCw, Sparkles, Layers, Fingerprint, Crosshair } from 'lucide-react';
import api from '../../api/client';
import type { Incident, IncidentNote, IncidentTask, Evidence, TimelineEvent } from '../../types';

const severityBadge = (s: string) => {
  const colors: Record<string, string> = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };
  return <span className={`badge ${colors[s] || 'badge-info'}`}>{s}</span>;
};

const statusBadge = (s: string) => {
  const colors: Record<string, string> = { new: 'badge badge-info', investigating: 'badge badge-high', contained: 'badge badge-low', closed: 'badge badge-success' };
  return <span className={colors[s] || 'badge badge-info'}>{s}</span>;
};

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [newNote, setNewNote] = useState('');

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postingNote, setPostingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState('');

  const fetchIncident = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Incident>(`/incidents/${id}`);
      setIncident(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load incident';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchIncident();
  }, [fetchIncident]);

  const handlePostNote = async () => {
    if (!id || !newNote.trim()) return;
    setPostingNote(true);
    setNoteError(null);
    try {
      const { data } = await api.post<IncidentNote>(`/incidents/${id}/notes`, {
        content: newNote.trim(),
      });
      setIncident((prev) => prev ? { ...prev, notes: [...(prev.notes ?? []), data] } : prev);
      setNewNote('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post note';
      setNoteError(message);
    } finally {
      setPostingNote(false);
    }
  };

  const handleTaskToggle = async (task: IncidentTask) => {
    if (!id) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await api.patch(`/incidents/${id}/tasks/${task.id}`, { status: newStatus });
      setIncident((prev) => {
        if (!prev?.tasks) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === task.id ? { ...t, status: newStatus } : t
          ),
        };
      });
    } catch {
      // silently ignore toggle failures
    }
  };

  const runAiAnalysis = async () => {
    if (!id || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    const query = aiQuery.trim() || `Investigate incident ${incident?.title ?? id} and provide detailed analysis including IOCs, attack chain, and recommended containment.`;
    try {
      const { data } = await api.post('/ai/investigate', {
        query,
        context_id: id,
        context_type: 'incident',
      });
      setAiResult(data);
    } catch (err: any) {
      setAiError(err.response?.data?.detail ?? err.message ?? 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runAiSummarize = async () => {
    if (!id || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { data } = await api.post('/ai/summarize', {
        incident_id: id,
        format: 'executive',
      });
      setAiResult(data);
    } catch (err: any) {
      setAiError(err.response?.data?.detail ?? err.message ?? 'AI summarization failed');
    } finally {
      setAiLoading(false);
    }
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: ShieldAlert },
    { key: 'timeline', label: 'Timeline', icon: Clock },
    { key: 'tasks', label: 'Tasks', icon: CheckSquare },
    { key: 'evidence', label: 'Evidence', icon: FileText },
    { key: 'notes', label: 'Notes', icon: MessageSquare },
    { key: 'ai-analysis', label: 'AI Analysis', icon: Sparkles },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <AlertCircle className="w-12 h-12 mb-4 text-red-400" />
        <p className="text-lg text-gray-300 mb-1">Failed to load incident</p>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button
          onClick={fetchIncident}
          className="btn-primary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <ShieldAlert className="w-12 h-12 mb-4 text-gray-600" />
        <p className="text-lg">Incident not found</p>
        <button onClick={() => navigate('/incidents')} className="btn-primary mt-4">Back to Incidents</button>
      </div>
    );
  }

  const notes = incident.notes ?? [];
  const tasks = incident.tasks ?? [];
  const evidence = incident.evidence ?? [];
  const timeline = (incident as any).timeline_events ?? incident.timeline ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/incidents')} className="text-gray-400 hover:text-gray-200 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{incident.title}</h1>
            {severityBadge(incident.severity)}
            {statusBadge(incident.status)}
            <span className="badge badge-info">Risk: {incident.risk_score}</span>
          </div>
          <p className="text-gray-400 text-sm mt-1">ID: {incident.id} | Created: {new Date(incident.created_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-surface-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-argus-500 text-argus-400' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {incident.description && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-3">Description</h2>
                <p className="text-gray-300">{incident.description}</p>
              </div>
            )}
            {incident.ai_summary && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-3">AI Summary</h2>
                <p className="text-gray-300">{incident.ai_summary}</p>
              </div>
            )}
            {incident.root_cause && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-3">Root Cause</h2>
                <p className="text-gray-300">{incident.root_cause}</p>
              </div>
            )}
            {incident.resolution && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-3">Resolution</h2>
                <p className="text-gray-300">{incident.resolution}</p>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Risk Score</span><span className="text-danger">{incident.risk_score}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Severity</span>{severityBadge(incident.severity)}</div>
                <div className="flex justify-between"><span className="text-gray-400">Status</span>{statusBadge(incident.status)}</div>
              </div>
            </div>
            {incident.mitre_techniques && (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">MITRE ATT&amp;CK</h3>
                <div className="flex flex-wrap gap-1">
                  {incident.mitre_techniques.split(',').map((t) => (
                    <span key={t.trim()} className="badge badge-info text-xs">{t.trim()}</span>
                  ))}
                </div>
              </div>
            )}
            {incident.affected_assets && (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Affected Assets</h3>
                <div className="flex flex-wrap gap-1">
                  {incident.affected_assets.split(',').map((a) => (
                    <span key={a.trim()} className="badge bg-surface border border-surface-border text-gray-300 text-xs">{a.trim()}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card">
          <div className="space-y-0">
            {timeline.length > 0 ? timeline.map((event: TimelineEvent, i: number) => (
                <div key={event.id ?? i} className="flex gap-4 pb-4 relative">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full mt-1.5 ${i === 0 ? 'bg-argus-500' : i < 3 ? 'bg-danger' : i < 6 ? 'bg-warning' : 'bg-success'}`} />
                    {i < timeline.length - 1 && <div className="w-0.5 flex-1 bg-surface-lighter mt-1" />}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-info text-xs">{event.event_type}</span>
                      <span className="text-gray-400 text-xs">{new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-200 text-sm mt-1">{event.title}</p>
                    {event.description && <p className="text-gray-500 text-xs mt-1">{event.description}</p>}
                  </div>
                </div>
              ))
            : (
              <p className="text-gray-500 text-sm py-8 text-center">No timeline events recorded.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card">
          {tasks.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No tasks assigned.</p>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-surface-border">
                  <input
                    type="checkbox"
                    checked={task.status === 'completed'}
                    onChange={() => handleTaskToggle(task)}
                    className="w-4 h-4 rounded accent-argus-500 cursor-pointer"
                  />
                  <span className={`flex-1 text-sm ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                    {task.title}
                  </span>
                  <span className={`badge ${task.priority === 'critical' ? 'badge-critical' : task.priority === 'high' ? 'badge-high' : task.priority === 'medium' ? 'badge-medium' : 'badge-low'}`}>{task.priority}</span>
                  <span className={`badge ${task.status === 'completed' ? 'badge-success' : task.status === 'in_progress' ? 'badge-high' : 'badge-info'}`}>{task.status.replace('_', ' ')}</span>
                  {task.assigned_to && <span className="text-gray-400 text-xs">{task.assigned_to}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="card">
          {evidence.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No evidence collected.</p>
          ) : (
            <div className="space-y-3">
              {evidence.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-surface rounded-lg border border-surface-border">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-argus-400" />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-gray-400">{item.file_hash ?? '-'} | {(item.file_size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  </div>
                  <span className="badge badge-info">{item.evidence_type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="card space-y-4">
          {notes.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No notes yet.</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="p-3 bg-surface rounded-lg border border-surface-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-argus-400">{note.user_id}</span>
                  <span className="text-xs text-gray-500">{new Date(note.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-300">{note.content}</p>
              </div>
            ))
          )}
          {noteError && (
            <p className="text-sm text-danger">{noteError}</p>
          )}
          <div className="flex gap-2 pt-4 border-t border-surface-border">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add investigation note..."
              className="input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handlePostNote()}
            />
            <button
              className="btn-primary flex items-center gap-2"
              disabled={postingNote || !newNote.trim()}
              onClick={handlePostNote}
            >
              {postingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Post
            </button>
          </div>
        </div>
      )}

      {tab === 'ai-analysis' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-argus-400" />
              AI Security Analysis
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Use ARGUS AI to investigate this incident in depth, extract IOCs, map the attack chain,
              and recommend containment. Results go deeper with every question.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder="Ask a focused question, e.g. 'What is the likely initial access vector?'"
                className="input flex-1"
                onKeyDown={(e) => e.key === 'Enter' && runAiAnalysis()}
              />
              <button className="btn-primary flex items-center gap-2" onClick={runAiAnalysis} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                Investigate
              </button>
              <button className="btn-secondary flex items-center gap-2" onClick={runAiSummarize} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                Executive Summary
              </button>
            </div>
          </div>

          {aiError && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" /> {aiError}
            </div>
          )}

          {aiResult && (
            <div className="space-y-4">
              {aiResult.summary && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Summary</h3>
                  <p className="text-gray-300">{aiResult.summary}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {aiResult.evidence?.length > 0 && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-argus-400" /> Supporting Evidence
                    </h3>
                    <ul className="space-y-2">
                      {aiResult.evidence.map((e: string, i: number) => (
                        <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                          <span className="text-argus-400 mt-1">•</span>{e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiResult.mitre_techniques?.length > 0 && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">MITRE ATT&CK</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {aiResult.mitre_techniques.map((t: string, i: number) => (
                        <span key={i} className="badge badge-info text-xs">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {aiResult.affected_assets?.length > 0 && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Affected Assets</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {aiResult.affected_assets.map((a: string, i: number) => (
                        <span key={i} className="badge bg-surface border border-surface-border text-gray-300 text-xs">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {aiResult.related_alerts?.length > 0 && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Related Alerts</h3>
                    <ul className="space-y-1.5">
                      {aiResult.related_alerts.map((a: string, i: number) => (
                        <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                          <span className="text-orange-400 mt-1">•</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {aiResult.recommended_steps?.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Recommended Investigation Steps</h3>
                  <ol className="space-y-2">
                    {aiResult.recommended_steps.map((s: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                        <span className="w-6 h-6 rounded-full bg-argus-600/20 text-argus-400 flex items-center justify-center text-xs font-semibold flex-shrink-0">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {aiResult.containment_options?.length > 0 && (
                <div className="card border-red-500/20">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Containment Options</h3>
                  <ul className="space-y-2">
                    {aiResult.containment_options.map((c: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResult.confidence !== undefined && (
                <div className="card flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-400">AI Confidence</span>
                  <div className="flex items-center gap-3">
                    <div className="w-40 h-2 bg-surface-lighter rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${aiResult.confidence >= 75 ? 'bg-success' : aiResult.confidence >= 40 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${aiResult.confidence}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold">{aiResult.confidence}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
