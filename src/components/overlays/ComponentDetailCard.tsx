import React, { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  Share2, 
  Info, 
  HelpCircle, 
  Send, 
  Search, 
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { SceneSpec, SceneComponent, ConfidenceLevel } from '../../types/sceneSpec';
import { seeLearnApiClient, ChatHistoryEntry } from '../../services/awsClient';

interface ComponentDetailCardProps {
  spec: SceneSpec;
  selectedComponentId: string | null;
  onSelectComponent: (id: string) => void;
  onInspectConnection?: (fromId: string, toId: string) => void;
}

export const ComponentDetailCard: React.FC<ComponentDetailCardProps> = ({
  spec,
  selectedComponentId,
  onSelectComponent,
  onInspectConnection,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatHistoryEntry[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [networkNotice, setNetworkNotice] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(seeLearnApiClient.isOffline());

  useEffect(() => {
    return seeLearnApiClient.onStatusChange((offline) => {
      setIsOffline(offline);
    });
  }, []);

  // Clear chat when selected component changes
  useEffect(() => {
    setChatMessages([]);
    setNetworkNotice(null);
  }, [selectedComponentId]);

  // Derive unique groups from spec components
  const groups = useMemo(() => {
    const set = new Set<string>();
    spec.components.forEach((c) => {
      if (c.group) set.add(c.group);
    });
    return ['all', ...Array.from(set)];
  }, [spec.components]);

  // Filtered components
  const filteredComponents = useMemo(() => {
    return spec.components.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.summary.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGroup = groupFilter === 'all' || c.group === groupFilter;
      return matchesSearch && matchesGroup;
    });
  }, [spec.components, searchQuery, groupFilter]);

  const selectedComponent = useMemo(() => {
    return spec.components.find((c) => c.id === selectedComponentId) || null;
  }, [spec.components, selectedComponentId]);

  // Related connections
  const relatedConnections = useMemo(() => {
    if (!selectedComponent) return [];
    return spec.connections.filter(
      (c) => c.from === selectedComponent.id || c.to === selectedComponent.id
    );
  }, [spec.connections, selectedComponent]);

  const handleAskQuestion = async (qText: string) => {
    if (!selectedComponent || !qText.trim() || isAnswering) return;

    const userQ = qText.trim();
    const updatedHistory: ChatHistoryEntry[] = [...chatMessages, { sender: 'user', text: userQ }];
    setChatMessages(updatedHistory);
    setChatQuestion('');
    setIsAnswering(true);
    setNetworkNotice(null);

    try {
      const response = await seeLearnApiClient.explainSceneComponent(
        spec,
        selectedComponent.id,
        userQ,
        updatedHistory
      );
      setChatMessages((prev) => [...prev, { sender: 'tutor', text: response.answer }]);
      if (response.isOffline) {
        setNetworkNotice('Offline mode: Grounded in reviewed template data.');
      }
    } catch (err: any) {
      setNetworkNotice('Answered using verified offline component facts.');
      const localResp = await seeLearnApiClient.explainSceneComponent(spec, selectedComponent.id, userQ);
      setChatMessages((prev) => [...prev, { sender: 'tutor', text: localResp.answer }]);
    } finally {
      setIsAnswering(false);
    }
  };

  const confidenceBadge = (level: ConfidenceLevel = 'high') => {
    const config = {
      high: { label: 'High Confidence', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
      medium: { label: 'Medium Confidence', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
      low: { label: 'Low Confidence', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
    };
    const c = config[level] || config.high;
    return (
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${c.bg}`}>
        {c.label}
      </span>
    );
  };

  return (
    <div className="w-80 md:w-96 h-full flex flex-col bg-[#0B132B]/95 backdrop-blur-md border-l border-slate-800 text-slate-200 select-none overflow-hidden">
      {/* Search & Subsystem Filter Tabs */}
      <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${spec.components.length} components...`}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50"
          />
        </div>

        {/* Horizontal scrollable group filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          {groups.map((grp) => (
            <button
              key={grp}
              type="button"
              onClick={() => setGroupFilter(grp)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition cursor-pointer capitalize ${
                groupFilter === grp
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {grp}
            </button>
          ))}
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {/* Component Selector Scroll List */}
        <div className="p-3 max-h-44 overflow-y-auto space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 px-1">
            Components ({filteredComponents.length})
          </div>
          {filteredComponents.map((comp) => {
            const isSelected = selectedComponent?.id === comp.id;
            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => onSelectComponent(comp.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition cursor-pointer ${
                  isSelected
                    ? 'bg-sky-500/15 border border-sky-500/50 text-sky-300 font-semibold shadow-sm'
                    : 'hover:bg-slate-850 text-slate-300 hover:text-white'
                }`}
              >
                <span className="truncate">{comp.name}</span>
                <span className="text-[10px] font-mono text-slate-500 ml-2 uppercase shrink-0">
                  {comp.group}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Component Detailed Breakdown */}
        {selectedComponent ? (
          <div className="p-4 space-y-4">
            {/* Header info */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {selectedComponent.group}
                </span>
                <div className="flex items-center gap-2">
                  {confidenceBadge(selectedComponent.confidence)}
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Grounded
                  </span>
                </div>
              </div>

              <h3 className="text-base font-bold text-white font-['Outfit'] mt-1">
                {selectedComponent.name}
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {selectedComponent.summary}
              </p>
              <div className="text-[10px] text-slate-500 font-mono mt-1">
                Simplified model: Procedural geometry represents physical component boundary.
              </div>
            </div>

            {/* Why Needed */}
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider font-mono">
                Why It Is Needed
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedComponent.whyNeeded}
              </p>
            </div>

            {/* How It Works */}
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider font-mono">
                How It Works
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedComponent.howItWorks}
              </p>
            </div>

            {/* Key Facts */}
            {selectedComponent.keyFacts && selectedComponent.keyFacts.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Verified Engineering Facts
                </span>
                <ul className="space-y-1">
                  {selectedComponent.keyFacts.map((fact, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-sky-400 mt-0.5">•</span>
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interconnections */}
            {relatedConnections.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Direct Interconnections ({relatedConnections.length})
                </span>
                <div className="space-y-1.5">
                  {relatedConnections.map((conn, idx) => {
                    const isSource = conn.from === selectedComponent.id;
                    const partnerId = isSource ? conn.to : conn.from;
                    const partner = spec.components.find((c) => c.id === partnerId);

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          onSelectComponent(partnerId);
                          onInspectConnection?.(conn.from, conn.to);
                        }}
                        className="w-full p-2 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-sky-500/40 text-left text-xs transition cursor-pointer flex items-center justify-between group"
                      >
                        <div>
                          <div className="font-medium text-slate-200 group-hover:text-sky-300 transition-colors">
                            {conn.label}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {isSource ? '➔ Outputs to' : '⬅ Inputs from'}:{' '}
                            <span className="text-slate-300 font-semibold">{partner?.name || partnerId}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 transition" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grounded Follow-Up Chat */}
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Hardware Q&A Tutor
                </span>
                <span className="text-[10px] text-slate-500">
                  {isOffline ? 'Offline grounded' : 'AWS Cloud grounded'}
                </span>
              </div>

              {/* Chat Message History */}
              {chatMessages.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`text-xs p-2.5 rounded-lg leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-sky-500/10 text-sky-200 border border-sky-500/20 ml-4'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 mr-4 whitespace-pre-wrap'
                      }`}
                    >
                      <div className="text-[10px] font-mono text-slate-500 mb-0.5">
                        {msg.sender === 'user' ? 'You' : 'SeeLearn Tutor'}
                      </div>
                      {msg.text}
                    </div>
                  ))}
                  {isAnswering && (
                    <div className="text-xs p-2 rounded-lg bg-slate-900 text-slate-400 animate-pulse">
                      Retrieving grounded engineering facts...
                    </div>
                  )}
                </div>
              )}

              {networkNotice && (
                <div className="text-[10px] font-mono p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  {networkNotice}
                </div>
              )}

              {/* Question Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatQuestion}
                  onChange={(e) => setChatQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAskQuestion(chatQuestion);
                    }
                  }}
                  placeholder={`Ask about ${selectedComponent.name}...`}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50"
                />
                <button
                  type="button"
                  disabled={!chatQuestion.trim() || isAnswering}
                  onClick={() => handleAskQuestion(chatQuestion)}
                  className="px-3 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 rounded-lg transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">
            Select a component from the 3D model or list above to inspect its engineering design and wiring.
          </div>
        )}
      </div>
    </div>
  );
};
