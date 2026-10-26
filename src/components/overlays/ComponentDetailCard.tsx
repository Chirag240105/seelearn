import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  Send,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  X,
  Sparkles,
  BookOpen,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { SceneSpec, SceneComponent, ConfidenceLevel, ConnectionType } from '../../types/sceneSpec';
import { seeLearnApiClient, ChatHistoryEntry } from '../../services/awsClient';

interface ComponentDetailCardProps {
  spec: SceneSpec;
  selectedComponentId: string | null;
  onSelectComponent: (id: string) => void;
  onInspectConnection?: (fromId: string, toId: string) => void;
  onClose?: () => void;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const ComponentDetailCard: React.FC<ComponentDetailCardProps> = ({
  spec,
  selectedComponentId,
  onSelectComponent,
  onInspectConnection,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'how' | 'connections' | 'facts' | 'ask'>('overview');
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatHistoryEntry[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [networkNotice, setNetworkNotice] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(seeLearnApiClient.isOffline());

  // Quiz state
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);

  useEffect(() => {
    return seeLearnApiClient.onStatusChange((offline) => {
      setIsOffline(offline);
    });
  }, []);

  const selectedComponent = useMemo(() => {
    return spec.components.find((c) => c.id === selectedComponentId) || null;
  }, [spec.components, selectedComponentId]);

  // Reset chat & quiz when selected component changes
  useEffect(() => {
    setChatMessages([]);
    setNetworkNotice(null);
    setIsQuizOpen(false);
    setSelectedAnswers({});
    setQuizScore(null);
  }, [selectedComponentId]);

  // Generate 3 multiple-choice questions from the component's spec text (purely offline, zero network needed)
  const generateQuiz = () => {
    if (!selectedComponent) return;

    const otherComponents = spec.components.filter((c) => c.id !== selectedComponent.id);
    const distractorsWhy = otherComponents.map((c) => c.whyNeeded).slice(0, 3);
    while (distractorsWhy.length < 3) {
      distractorsWhy.push('Provides passive acoustic dampening across the chassis frame.');
    }

    const distractorsHow = otherComponents.map((c) => c.howItWorks).slice(0, 3);
    while (distractorsHow.length < 3) {
      distractorsHow.push('Regulates thermal dissipation through convective airflow channels.');
    }

    const facts = selectedComponent.keyFacts && selectedComponent.keyFacts.length > 0
      ? selectedComponent.keyFacts[0]
      : `${selectedComponent.name} operates as a key part of the ${selectedComponent.group} subsystem.`;

    const distractorFact1 = otherComponents[0]?.keyFacts?.[0] || 'Uses standardized M3 mounting spacing.';
    const distractorFact2 = otherComponents[1]?.keyFacts?.[0] || 'Operating voltage is rated for standard 5V logic.';
    const distractorFact3 = otherComponents[2]?.keyFacts?.[0] || 'Requires active feedback compensation.';

    const q1Options = [selectedComponent.whyNeeded, ...distractorsWhy].sort(() => 0.5 - Math.random());
    const q2Options = [selectedComponent.howItWorks, ...distractorsHow].sort(() => 0.5 - Math.random());
    const q3Options = [facts, distractorFact1, distractorFact2, distractorFact3].sort(() => 0.5 - Math.random());

    const generated: QuizQuestion[] = [
      {
        question: `What is the primary role of the ${selectedComponent.name}?`,
        options: q1Options,
        correctIndex: q1Options.indexOf(selectedComponent.whyNeeded),
        explanation: `${selectedComponent.name} is needed because: ${selectedComponent.whyNeeded}`,
      },
      {
        question: `How does the ${selectedComponent.name} physically work?`,
        options: q2Options,
        correctIndex: q2Options.indexOf(selectedComponent.howItWorks),
        explanation: selectedComponent.howItWorks,
      },
      {
        question: `Which engineering fact correctly describes the ${selectedComponent.name}?`,
        options: q3Options,
        correctIndex: q3Options.indexOf(facts),
        explanation: facts,
      },
    ];

    setQuizQuestions(generated);
    setSelectedAnswers({});
    setQuizScore(null);
    setIsQuizOpen(true);
  };

  const handleSelectAnswer = (qIndex: number, optionIndex: number) => {
    if (selectedAnswers[qIndex] !== undefined) return; // already answered
    const nextAnswers = { ...selectedAnswers, [qIndex]: optionIndex };
    setSelectedAnswers(nextAnswers);

    if (Object.keys(nextAnswers).length === quizQuestions.length) {
      let correctCount = 0;
      quizQuestions.forEach((q, idx) => {
        if (nextAnswers[idx] === q.correctIndex) correctCount++;
      });
      setQuizScore(correctCount);
    }
  };

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
        setNetworkNotice('Offline mode: Answer grounded in verified engineering facts.');
      }
    } catch {
      setNetworkNotice('Answered using verified offline component facts.');
      const localResp = await seeLearnApiClient.explainSceneComponent(spec, selectedComponent.id, userQ);
      setChatMessages((prev) => [...prev, { sender: 'tutor', text: localResp.answer }]);
    } finally {
      setIsAnswering(false);
    }
  };

  const getConnectionTypeColor = (type: ConnectionType): string => {
    switch (type) {
      case 'power':
        return 'var(--sl-conn-power)';
      case 'signal':
        return 'var(--sl-conn-signal)';
      case 'data':
        return 'var(--sl-conn-data)';
      case 'mechanical':
        return 'var(--sl-conn-mechanical)';
      case 'thermal':
        return 'var(--sl-conn-thermal)';
      default:
        return 'var(--sl-accent)';
    }
  };

  const confidenceBadge = (level: ConfidenceLevel = 'high') => {
    const config = {
      high: { label: 'High Confidence', color: 'var(--sl-success)', bg: 'var(--sl-success-muted)' },
      medium: { label: 'Medium Confidence', color: 'var(--sl-warning)', bg: 'var(--sl-warning-muted)' },
      low: { label: 'Low Confidence', color: 'var(--sl-danger)', bg: 'var(--sl-danger-muted)' },
    };
    const c = config[level] || config.high;
    return (
      <span
        className="text-xs font-mono px-2 py-0.5 rounded border"
        style={{ color: c.color, backgroundColor: c.bg, borderColor: c.color }}
      >
        {c.label}
      </span>
    );
  };

  if (!selectedComponent) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none"
        style={{ backgroundColor: 'var(--sl-bg-surface)', color: 'var(--sl-text-muted)' }}
      >
        <BookOpen className="w-8 h-8 mb-2 opacity-50" />
        <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--sl-text-primary)' }}>
          No Component Selected
        </h4>
        <p className="text-xs max-w-xs leading-relaxed">
          Select any part in the 3D canvas or component tree to inspect its engineering design, connections, and interactive quiz.
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col select-none overflow-hidden"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        color: 'var(--sl-text-primary)',
      }}
    >
      {/* Header: part name, subsystem chip, confidence badge, Quiz me button, close button */}
      <div className="p-4 border-b shrink-0 space-y-2.5" style={{ borderColor: 'var(--sl-border-subtle)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono uppercase px-2 py-0.5 rounded border font-medium"
              style={{
                backgroundColor: 'var(--sl-accent-muted)',
                borderColor: 'var(--sl-border)',
                color: 'var(--sl-accent)',
              }}
            >
              {selectedComponent.group}
            </span>
            {confidenceBadge(selectedComponent.confidence)}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quiz Me button */}
            <button
              type="button"
              onClick={generateQuiz}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer"
              style={{
                backgroundColor: isQuizOpen ? 'var(--sl-accent)' : 'var(--sl-accent-muted)',
                borderColor: 'var(--sl-accent)',
                color: isQuizOpen ? '#ffffff' : 'var(--sl-accent)',
              }}
              title="Test your knowledge with 3 interactive questions"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Quiz Me</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg border transition cursor-pointer"
                style={{
                  backgroundColor: 'var(--sl-bg-raised)',
                  borderColor: 'var(--sl-border)',
                  color: 'var(--sl-text-muted)',
                }}
                title="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--sl-text-primary)' }}>
            {selectedComponent.name}
          </h2>
          {/* Why It Matters Callout */}
          <div
            className="mt-2 p-2.5 rounded-lg border text-xs leading-relaxed"
            style={{
              backgroundColor: 'var(--sl-bg-raised)',
              borderColor: 'var(--sl-border-subtle)',
            }}
          >
            <span className="font-semibold block mb-0.5" style={{ color: 'var(--sl-accent)' }}>
              Why It Matters:
            </span>
            <span style={{ color: 'var(--sl-text-secondary)' }}>{selectedComponent.whyNeeded}</span>
          </div>
        </div>

        {/* 5 Tabs: Overview, How it works, Connections, Facts, Ask */}
        {!isQuizOpen && (
          <div
            className="flex items-center gap-1 p-1 rounded-xl border text-xs font-medium overflow-x-auto"
            style={{ backgroundColor: 'var(--sl-bg-base)', borderColor: 'var(--sl-border)' }}
          >
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'how', label: 'How it works' },
              { id: 'connections', label: `Connections (${relatedConnections.length})` },
              { id: 'facts', label: 'Facts' },
              { id: 'ask', label: 'Ask' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className="px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: activeTab === tab.id ? 'var(--sl-bg-surface)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--sl-text-primary)' : 'var(--sl-text-secondary)',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  boxShadow: activeTab === tab.id ? 'var(--sl-shadow-sm)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Tab Body - Independently scrollable, never clipped */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Interactive Quiz Mode View */}
        {isQuizOpen ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--sl-border-subtle)' }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--sl-accent)' }}>
                <Sparkles className="w-4 h-4" />
                <span>Interactive Knowledge Check</span>
              </div>
              <button
                type="button"
                onClick={() => setIsQuizOpen(false)}
                className="text-xs font-medium cursor-pointer"
                style={{ color: 'var(--sl-text-muted)' }}
              >
                Exit Quiz
              </button>
            </div>

            {quizQuestions.map((q, qIdx) => {
              const selectedOpt = selectedAnswers[qIdx];
              const isAnswered = selectedOpt !== undefined;

              return (
                <div
                  key={qIdx}
                  className="p-3.5 rounded-xl border space-y-2.5"
                  style={{ backgroundColor: 'var(--sl-bg-raised)', borderColor: 'var(--sl-border)' }}
                >
                  <div className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--sl-text-primary)' }}>
                    <span className="font-mono text-xs mr-1.5" style={{ color: 'var(--sl-accent)' }}>
                      Q{qIdx + 1}.
                    </span>
                    {q.question}
                  </div>

                  <div className="space-y-1.5">
                    {q.options.map((opt, optIdx) => {
                      const isChosen = selectedOpt === optIdx;
                      const isCorrect = optIdx === q.correctIndex;

                      let optBg = 'var(--sl-bg-surface)';
                      let optBorder = 'var(--sl-border)';
                      let optColor = 'var(--sl-text-secondary)';

                      if (isAnswered) {
                        if (isCorrect) {
                          optBg = 'var(--sl-success-muted)';
                          optBorder = 'var(--sl-success)';
                          optColor = 'var(--sl-success)';
                        } else if (isChosen) {
                          optBg = 'var(--sl-danger-muted)';
                          optBorder = 'var(--sl-danger)';
                          optColor = 'var(--sl-danger)';
                        }
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={isAnswered}
                          onClick={() => handleSelectAnswer(qIdx, optIdx)}
                          className="w-full text-left p-2.5 rounded-lg border text-xs transition leading-relaxed flex items-start gap-2 cursor-pointer disabled:cursor-default"
                          style={{
                            backgroundColor: optBg,
                            borderColor: optBorder,
                            color: optColor,
                          }}
                        >
                          <span className="font-mono shrink-0 mt-0.5">
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          <span className="flex-1">{opt}</span>
                          {isAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />}
                          {isAnswered && isChosen && !isCorrect && <XCircle className="w-4 h-4 shrink-0 text-rose-500" />}
                        </button>
                      );
                    })}
                  </div>

                  {isAnswered && (
                    <div
                      className="text-xs p-2.5 rounded-lg border leading-relaxed"
                      style={{
                        backgroundColor: 'var(--sl-bg-surface)',
                        borderColor: 'var(--sl-border-subtle)',
                        color: 'var(--sl-text-secondary)',
                      }}
                    >
                      <span className="font-semibold block mb-0.5" style={{ color: 'var(--sl-accent)' }}>
                        Explanation:
                      </span>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}

            {quizScore !== null && (
              <div
                className="p-4 rounded-xl border text-center space-y-2"
                style={{ backgroundColor: 'var(--sl-accent-muted)', borderColor: 'var(--sl-accent)' }}
              >
                <div className="text-sm font-bold" style={{ color: 'var(--sl-text-primary)' }}>
                  Quiz Complete: {quizScore} / {quizQuestions.length} Correct
                </div>
                <p className="text-xs" style={{ color: 'var(--sl-text-secondary)' }}>
                  {quizScore === quizQuestions.length
                    ? 'Excellent mastery of this component.'
                    : 'Good attempt. Review the explanation notes above.'}
                </p>
                <button
                  type="button"
                  onClick={generateQuiz}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{ backgroundColor: 'var(--sl-accent)', color: '#ffffff' }}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* TAB: Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sl-text-muted)' }}>
                    Functional Summary
                  </h4>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--sl-text-secondary)' }}>
                    {selectedComponent.summary}
                  </p>
                </div>

                <div
                  className="p-3.5 rounded-xl border space-y-1.5"
                  style={{ backgroundColor: 'var(--sl-bg-raised)', borderColor: 'var(--sl-border)' }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--sl-text-muted)' }}>
                    Physical Geometry & Scale
                  </span>
                  <div className="text-xs space-y-1" style={{ color: 'var(--sl-text-secondary)' }}>
                    <div>
                      Subsystem: <span className="font-medium capitalize" style={{ color: 'var(--sl-text-primary)' }}>{selectedComponent.group}</span>
                    </div>
                    <div>
                      Procedural Parts: <span className="font-mono font-medium" style={{ color: 'var(--sl-text-primary)' }}>{selectedComponent.parts.length} geometry primitives</span>
                    </div>
                    <div>
                      Primary Materials: <span className="font-mono text-xs" style={{ color: 'var(--sl-text-primary)' }}>
                        {Array.from(new Set(selectedComponent.parts.map((p) => p.material))).join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: How It Works */}
            {activeTab === 'how' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sl-text-muted)' }}>
                    Physical Principles of Operation
                  </h4>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--sl-text-secondary)' }}>
                    {selectedComponent.howItWorks}
                  </p>
                </div>
              </div>
            )}

            {/* TAB: Connections */}
            {activeTab === 'connections' && (
              <div className="space-y-3">
                <div className="text-xs" style={{ color: 'var(--sl-text-muted)' }}>
                  Interconnected subsystem paths for {selectedComponent.name}:
                </div>

                {relatedConnections.length === 0 ? (
                  <div className="text-xs p-4 rounded-xl border text-center" style={{ backgroundColor: 'var(--sl-bg-raised)', borderColor: 'var(--sl-border)', color: 'var(--sl-text-muted)' }}>
                    No direct external connections recorded for this part.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {relatedConnections.map((conn, idx) => {
                      const isSource = conn.from === selectedComponent.id;
                      const partnerId = isSource ? conn.to : conn.from;
                      const partner = spec.components.find((c) => c.id === partnerId);
                      const typeColor = getConnectionTypeColor(conn.type);

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            onSelectComponent(partnerId);
                            onInspectConnection?.(conn.from, conn.to);
                          }}
                          className="w-full p-3 rounded-xl border text-left text-xs transition cursor-pointer flex items-center justify-between group"
                          style={{
                            backgroundColor: 'var(--sl-bg-raised)',
                            borderColor: 'var(--sl-border)',
                          }}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: typeColor }}
                              />
                              <span className="font-semibold text-xs" style={{ color: 'var(--sl-text-primary)' }}>
                                {conn.label}
                              </span>
                              <span
                                className="text-xs font-mono uppercase px-1.5 py-0.2 rounded border"
                                style={{ color: typeColor, borderColor: typeColor }}
                              >
                                {conn.type}
                              </span>
                            </div>
                            <div className="text-xs" style={{ color: 'var(--sl-text-muted)' }}>
                              {isSource ? 'Outputs to' : 'Inputs from'}:{' '}
                              <span className="font-semibold" style={{ color: 'var(--sl-text-secondary)' }}>
                                {partner?.name || partnerId}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 transition group-hover:translate-x-0.5" style={{ color: 'var(--sl-text-muted)' }} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Facts */}
            {activeTab === 'facts' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sl-text-muted)' }}>
                  Verified Engineering Facts
                </div>
                {selectedComponent.keyFacts && selectedComponent.keyFacts.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedComponent.keyFacts.map((fact, idx) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-lg border text-xs leading-relaxed flex items-start gap-2.5"
                        style={{
                          backgroundColor: 'var(--sl-bg-raised)',
                          borderColor: 'var(--sl-border)',
                          color: 'var(--sl-text-secondary)',
                        }}
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--sl-accent)' }} />
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs p-4 rounded-xl border text-center" style={{ backgroundColor: 'var(--sl-bg-raised)', borderColor: 'var(--sl-border)', color: 'var(--sl-text-muted)' }}>
                    No extra key facts defined for this component.
                  </div>
                )}
              </div>
            )}

            {/* TAB: Ask (Q&A Tutor) */}
            {activeTab === 'ask' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--sl-text-muted)' }}>
                  <span>Interactive Engineering Tutor</span>
                  <span className="font-mono">{isOffline ? 'Offline Grounded' : 'AWS Cloud'}</span>
                </div>

                {chatMessages.length > 0 && (
                  <div
                    className="space-y-2.5 max-h-56 overflow-y-auto p-3 rounded-xl border"
                    style={{ backgroundColor: 'var(--sl-bg-base)', borderColor: 'var(--sl-border)' }}
                  >
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className="text-xs p-2.5 rounded-lg leading-relaxed"
                        style={{
                          backgroundColor:
                            msg.sender === 'user' ? 'var(--sl-accent-muted)' : 'var(--sl-bg-raised)',
                          borderColor:
                            msg.sender === 'user' ? 'var(--sl-accent)' : 'var(--sl-border-subtle)',
                          color:
                            msg.sender === 'user' ? 'var(--sl-text-primary)' : 'var(--sl-text-secondary)',
                          marginLeft: msg.sender === 'user' ? '1.5rem' : '0',
                          marginRight: msg.sender === 'user' ? '0' : '1.5rem',
                          borderWidth: '1px',
                        }}
                      >
                        <div className="font-mono text-xs mb-1" style={{ color: 'var(--sl-text-muted)' }}>
                          {msg.sender === 'user' ? 'You' : 'SeeLearn Tutor'}
                        </div>
                        {msg.text}
                      </div>
                    ))}
                    {isAnswering && (
                      <div className="text-xs p-2 rounded-lg sl-pulse" style={{ color: 'var(--sl-accent)' }}>
                        Retrieving grounded engineering facts...
                      </div>
                    )}
                  </div>
                )}

                {networkNotice && (
                  <div
                    className="text-xs p-2 rounded-lg border font-mono"
                    style={{
                      backgroundColor: 'var(--sl-warning-muted)',
                      borderColor: 'var(--sl-warning)',
                      color: 'var(--sl-warning)',
                    }}
                  >
                    {networkNotice}
                  </div>
                )}

                {/* Prompt input */}
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
                    placeholder={`Ask a question about ${selectedComponent.name}...`}
                    className="flex-1 border rounded-lg px-3 py-2 text-xs focus:outline-none"
                    style={{
                      backgroundColor: 'var(--sl-bg-base)',
                      borderColor: 'var(--sl-border)',
                      color: 'var(--sl-text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    disabled={!chatQuestion.trim() || isAnswering}
                    onClick={() => handleAskQuestion(chatQuestion)}
                    className="px-3 py-2 rounded-lg transition cursor-pointer disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--sl-accent)',
                      color: '#ffffff',
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
