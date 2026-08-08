import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, User, Zap, Shield, Search, AlertTriangle, Server, Globe,
  Bug, Binary, ClipboardCheck, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import api from '../../api/client';
import { useAppStore } from '../../store';

type AgentType =
  | 'SOC Analyst'
  | 'Threat Hunter'
  | 'Malware Analyst'
  | 'Detection Engineer'
  | 'DFIR Assistant'
  | 'Executive Advisor'
  | 'Compliance Advisor';

interface Message {
  id: number;
  role: 'user' | 'ai';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
}

interface ProviderOption {
  provider: string;
  models: string[];
  available: boolean;
}

const AGENT_TYPES: AgentType[] = [
  'SOC Analyst',
  'Threat Hunter',
  'Malware Analyst',
  'Detection Engineer',
  'DFIR Assistant',
  'Executive Advisor',
  'Compliance Advisor',
];

const AGENT_ROLES: Record<string, string[]> = {
  'SOC Analyst': ['super_admin', 'security_admin', 'soc_manager', 'tier1_analyst', 'tier2_analyst', 'tier3_analyst', 'incident_responder', 'read_only'],
  'Threat Hunter': ['super_admin', 'security_admin', 'soc_manager', 'threat_hunter', 'tier3_analyst'],
  'Malware Analyst': ['super_admin', 'security_admin', 'soc_manager', 'tier3_analyst', 'incident_responder'],
  'Detection Engineer': ['super_admin', 'security_admin', 'soc_manager', 'tier3_analyst'],
  'DFIR Assistant': ['super_admin', 'security_admin', 'soc_manager', 'tier2_analyst', 'tier3_analyst', 'incident_responder'],
  'Executive Advisor': ['super_admin', 'security_admin', 'soc_manager'],
  'Compliance Advisor': ['super_admin', 'security_admin', 'compliance_officer', 'auditor'],
};

const AGENT_ICONS: Record<string, React.ReactNode> = {
  'SOC Analyst': <Shield className="w-4 h-4" />,
  'Threat Hunter': <Search className="w-4 h-4" />,
  'Malware Analyst': <Bug className="w-4 h-4" />,
  'Detection Engineer': <Binary className="w-4 h-4" />,
  'DFIR Assistant': <AlertTriangle className="w-4 h-4" />,
  'Executive Advisor': <Server className="w-4 h-4" />,
  'Compliance Advisor': <ClipboardCheck className="w-4 h-4" />,
};

const QUICK_ACTIONS = [
  'Explain this alert',
  'Investigate incident',
  'Generate Sigma rule',
  'Generate YARA rule',
  'Summarize findings',
  'Recommend remediation',
];

const WELCOME_MESSAGE: Message = {
  id: 0,
  role: 'ai',
  content:
    'Hello! I\'m your AI Security Copilot. I can help you analyze alerts, investigate incidents, generate detection rules, and more. Select an agent type on the left and ask me anything.',
};

export default function AIAssistant() {
  const { user } = useAppStore();
  const userRole = user?.role ?? 'read_only';
  const allowedAgents = AGENT_TYPES.filter((a) => (AGENT_ROLES[a] ?? []).includes(userRole));
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('SOC Analyst');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [activeProvider, setActiveProvider] = useState('opencode');

  const fetchProviders = useCallback(async () => {
    try {
      const { data } = await api.get('/ai/models');
      const raw = Array.isArray(data) ? data : data.items ?? data.models ?? [];
      setProviders(raw);
      const first = raw.find((p: ProviderOption) => p.available);
      if (first) setActiveProvider(first.provider);
    } catch {
      setProviders([]);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const { data } = await api.get('/ai/sessions', { params: { page: 1, page_size: 20 } });
      const raw = data.items ?? data.data ?? data.results ?? data ?? [];
      setSessions(Array.isArray(raw) ? raw : []);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchProviders();
  }, [fetchSessions, fetchProviders]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isAiResponding) return;
    const content = input.trim();
    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsAiResponding(true);
    setAiError(null);

    try {
      const { data } = await api.post('/ai/chat', {
        message: content,
        session_id: sessionId,
        provider: activeProvider,
        agent_type: selectedAgent,
      });
      const reply = data.reply ?? data.response ?? data.message ?? data.content ?? 'No response from AI.';
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: 'ai',
        content: typeof reply === 'string' ? reply : JSON.stringify(reply),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorText = err.response?.data?.detail ?? err.message ?? 'AI service is currently unavailable';
      const friendly =
        String(errorText).includes('403') || String(errorText).includes('Forbidden')
          ? 'The primary AI provider (OpenCode) is blocked. Configure an alternative provider key in backend env (OPENAI_API_KEY, ANTHROPIC_API_KEY, AZURE_OPENAI_API_KEY, or GROQ_API_KEY) and it will be used automatically.'
          : String(errorText).includes('All AI providers failed')
            ? 'All AI providers failed. Configure at least one working provider key (OpenAI, Anthropic, Azure OpenAI, or Groq) in the backend environment variables.'
            : errorText;
      setAiError(friendly);
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: 'ai',
        content: `Error: ${friendly}`,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsAiResponding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
  };

  const handleNewSession = () => {
    setMessages([WELCOME_MESSAGE]);
    setSessionId(crypto.randomUUID());
    setAiError(null);
  };

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Agent Types & Sessions */}
      <aside className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            AI Agents
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {allowedAgents.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-3">No agents available for your role.</p>
          )}
          {allowedAgents.map((agent) => (
            <button
              key={agent}
              onClick={() => setSelectedAgent(agent)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 text-sm ${
                selectedAgent === agent
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {AGENT_ICONS[agent] ?? <Bot className="w-4 h-4" />}
              {agent}
            </button>
          ))}
        </div>

        {/* Sessions */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Sessions
            </h2>
            <button
              onClick={handleNewSession}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
              title="New Session"
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>
          {loadingSessions ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">No saved sessions</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {sessions.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSessionId(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    sessionId === s.id
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  <div className="truncate">{s.title || 'Untitled'}</div>
                  <div className="text-gray-600 mt-0.5">{s.updated_at}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Right Side - Chat Area */}
      <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600 text-white">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                AI Security Copilot
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI-powered security operations assistant
              </p>
            </div>
            {providers.length > 0 && (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600/10 border border-green-600/30 text-sm text-green-400">
                <Zap className="w-4 h-4" />
                {activeProvider}
              </span>
            )}
            {isAiResponding && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-600/30 text-sm text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Typing...
              </div>
            )}
            {aiError && (
              <button
                onClick={() => setAiError(null)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400"
              >
                <AlertCircle className="w-4 h-4" />
                AI Error
              </button>
            )}
            <button
              onClick={handleNewSession}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
              title="New Chat"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {msg.role === 'user' ? (
                    <>
                      <User className="w-4 h-4" />
                      <span className="text-xs font-semibold opacity-80">You</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-600">
                        {selectedAgent}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          {isAiResponding && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md shadow-sm px-5 py-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                <span className="text-sm text-gray-400">
                  {selectedAgent} is analyzing...
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* AI Service Error Banner */}
        {aiError && (
          <div className="flex-shrink-0 mx-6 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{aiError}</span>
            <button
              onClick={() => setAiError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex-shrink-0 px-6 pb-2 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              {action}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a security question..."
              rows={1}
              disabled={isAiResponding}
              className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isAiResponding}
              className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isAiResponding ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
