import React, { useState, useCallback } from 'react';
import { Search, X, FileText, Globe, Server, AlertTriangle, Shield, Monitor, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/client';

type SearchType = 'All' | 'Events' | 'Alerts' | 'Incidents' | 'Endpoints' | 'IOCs';

interface SearchResult {
  id: number;
  type: string;
  title: string;
  description: string;
  highlight: string;
  timestamp: string;
  severity?: string;
  source: string;
}

const SEARCH_TYPES: SearchType[] = ['All', 'Events', 'Alerts', 'Incidents', 'Endpoints', 'IOCs'];

const TYPE_INDEX_MAP: Record<string, string> = {
  Events: 'events',
  Alerts: 'alerts',
  Incidents: 'incidents',
  Endpoints: 'endpoints',
  IOCs: 'iocs',
};

const EXAMPLE_SEARCHES = [
  'event_id:4625',
  'severity:critical AND country:NG',
  'hostname:DC01',
  'user:administrator',
  'ioc:185.11.x.x',
  'process:powershell.exe',
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  event: <FileText className="w-5 h-5" />,
  alert: <AlertTriangle className="w-5 h-5" />,
  incident: <Shield className="w-5 h-5" />,
  endpoint: <Monitor className="w-5 h-5" />,
  ioc: <Globe className="w-5 h-5" />,
};

const TYPE_COLORS: Record<string, string> = {
  event: 'bg-blue-600',
  alert: 'bg-red-600',
  incident: 'bg-orange-600',
  endpoint: 'bg-green-600',
  ioc: 'bg-purple-600',
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const SEARCH_INDEX_SHORT: Record<string, string> = {
  events: 'event',
  alerts: 'alert',
  incidents: 'incident',
  endpoints: 'endpoint',
  iocs: 'ioc',
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<SearchType>('All');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchTime, setSearchTime] = useState<string | null>(null);

  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    const startTime = performance.now();
    try {
      const index = activeType === 'All' ? undefined : TYPE_INDEX_MAP[activeType];
      const { data } = await api.post('/search', {
        query: searchQuery,
        index,
        time_range: '24h',
        from_: 0,
        size: 50,
      });
      const raw = data.items ?? data.data ?? data.hits ?? data.results ?? [];
      const mapped: SearchResult[] = (Array.isArray(raw) ? raw : []).map((r: any, i: number) => ({
        id: r.id ?? r._id ?? i + 1,
        type: r.type ?? r._type ?? SEARCH_INDEX_SHORT[index ?? r._index ?? ''] ?? 'event',
        title: r.title ?? r._source?.title ?? r.name ?? '',
        description: r.description ?? r._source?.description ?? r.summary ?? '',
        highlight: r.highlight ?? searchQuery,
        timestamp: r.timestamp ?? r._source?.timestamp ?? r['@timestamp'] ?? new Date().toISOString(),
        severity: r.severity ?? r._source?.severity,
        source: r.source ?? r._source?.source ?? r._index ?? '',
      }));
      const elapsed = (performance.now() - startTime) / 1000;
      setSearchTime(elapsed.toFixed(3));
      setResults(mapped);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? err.message ?? 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeSearch(query);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    executeSearch(example);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600 text-white">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Search</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Search across all security data
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search events, alerts, incidents, endpoints, IOCs..."
            className="w-full pl-12 pr-12 py-3.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setHasSearched(false); setResults([]); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          {!query && (
            <button
              onClick={() => document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus()}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Focus search"
            >
              <Server className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Search Type Toggles */}
        <div className="flex gap-2 mb-6">
          {SEARCH_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeType === type
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        {/* Results Count */}
        {hasSearched && !loading && !error && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Showing{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{results.length}</span>{' '}
            results
            {searchTime && (
              <>
                {' '}in{' '}
                <span className="font-semibold text-gray-900 dark:text-white">{searchTime}s</span>
              </>
            )}
          </p>
        )}

        {/* Results List */}
        {!loading && !error && (
          <div className="space-y-3">
            {results.map((result) => (
              <div
                key={result.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${TYPE_COLORS[result.type] ?? 'bg-gray-600'} text-white flex-shrink-0`}>
                    {TYPE_ICONS[result.type] ?? <FileText className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {result.title}
                      </h3>
                      {result.severity && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            SEVERITY_COLORS[result.severity] ?? ''
                          }`}
                        >
                          {result.severity}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {highlightMatch(result.description, query)}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <span>{formatTimestamp(result.timestamp)}</span>
                      <span>{result.source}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {results.length === 0 && hasSearched && !loading && !error && (
              <div className="py-16 text-center text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium text-gray-400">No results found</p>
                <p className="text-sm text-gray-500 mt-1">Try adjusting your search query or filters</p>
              </div>
            )}
          </div>
        )}

        {/* Example Searches */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Example Searches
          </h3>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_SEARCHES.map((example) => (
              <button
                key={example}
                onClick={() => handleExampleClick(example)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors font-mono"
              >
                <Search className="w-3 h-3" />
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
