import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Cpu,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  ArrowLeft,
  Edit3,
  Layers,
} from 'lucide-react';
import { SceneSpec } from '../../types/sceneSpec';
import { BUNDLED_SAMPLES, SampleMeta } from '../../data/samples/samplesIndex';

interface LoadingScreenProps {
  goalPrompt: string;
  isGenerating: boolean;
  onOpenSample: (spec?: SceneSpec) => void;
  error?: string | null;
  onRetry?: () => void;
  onBackToLibrary?: () => void;
  onEditTopic?: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  goalPrompt,
  isGenerating,
  onOpenSample,
  error,
  onRetry,
  onBackToLibrary,
  onEditTopic,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Deconstructing Topic',
      subtitle: `Analyzing "${goalPrompt.slice(0, 52)}${goalPrompt.length > 52 ? '...' : ''}"`,
      duration: 700,
    },
    {
      title: 'Synthesizing Subsystems',
      subtitle: 'Deriving functional components, bounding boxes, and material properties',
      duration: 800,
    },
    {
      title: 'Assembling 3D Schematics',
      subtitle: 'Connecting power, signal, and mechanical routing graphs',
      duration: 750,
    },
    {
      title: 'Validating Constraints',
      subtitle: 'Checking physical topology and zero-collision bounds',
      duration: 600,
    },
  ];

  useEffect(() => {
    if (error || !isGenerating) return;

    setCurrentStep(0);
    let timer: ReturnType<typeof setTimeout>;
    let stepIdx = 0;
    const advanceStep = () => {
      stepIdx = (stepIdx + 1) % steps.length;
      setCurrentStep(stepIdx);
      timer = setTimeout(advanceStep, steps[stepIdx].duration);
    };

    timer = setTimeout(advanceStep, steps[0].duration);
    return () => clearTimeout(timer);
  }, [error, isGenerating]);

  return (
    <div
      className="screen-enter min-h-screen w-full flex flex-col items-center justify-center p-6 relative overflow-hidden select-none"
      style={{ backgroundColor: 'var(--sl-bg-base)', color: 'var(--sl-text-primary)' }}
    >
      {/* Background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 40%, var(--sl-accent-muted), transparent 70%)',
        }}
      />

      <div
        className="max-w-xl w-full rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10 border transition-all"
        style={{
          backgroundColor: 'var(--sl-bg-surface)',
          borderColor: 'var(--sl-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6 pb-4 border-b" style={{ borderColor: 'var(--sl-border-subtle)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{
              backgroundColor: 'var(--sl-accent-muted)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-accent)',
            }}
          >
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight" style={{ color: 'var(--sl-text-primary)' }}>
              {error ? 'Generation Notice' : 'Configuring 3D Explorable Model'}
            </h2>
            <p className="text-xs font-mono" style={{ color: 'var(--sl-text-secondary)' }}>
              SeeLearn Physics Engine
            </p>
          </div>
        </div>

        {error ? (
          <div className="space-y-6">
            {/* Error Callout */}
            <div
              className="p-4 rounded-xl border flex items-start gap-3"
              style={{
                backgroundColor: 'var(--sl-warning-muted)',
                borderColor: 'var(--sl-warning)',
                color: 'var(--sl-text-primary)',
              }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sl-warning)' }} />
              <div className="text-xs sm:text-sm leading-relaxed">
                <div className="font-semibold mb-1" style={{ color: 'var(--sl-warning)' }}>
                  Action Required
                </div>
                <p style={{ color: 'var(--sl-text-secondary)' }}>{error}</p>
              </div>
            </div>

            {/* 4 Action Buttons: Edit topic, Retry, Back to library, Open a sample */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {onEditTopic && (
                <button
                  type="button"
                  onClick={onEditTopic}
                  className="flex-1 min-w-[130px] py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                  style={{
                    backgroundColor: 'var(--sl-bg-raised)',
                    borderColor: 'var(--sl-border)',
                    color: 'var(--sl-text-primary)',
                  }}
                >
                  <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
                  <span>Edit Topic</span>
                </button>
              )}

              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  style={{
                    backgroundColor: 'var(--sl-accent)',
                    color: '#ffffff',
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}

              {onBackToLibrary && (
                <button
                  type="button"
                  onClick={onBackToLibrary}
                  className="flex-1 min-w-[130px] py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                  style={{
                    backgroundColor: 'var(--sl-bg-raised)',
                    borderColor: 'var(--sl-border)',
                    color: 'var(--sl-text-primary)',
                  }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" style={{ color: 'var(--sl-text-secondary)' }} />
                  <span>Back to Library</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenSample()}
                className="flex-1 min-w-[140px] py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                style={{
                  backgroundColor: 'var(--sl-accent-muted)',
                  borderColor: 'var(--sl-accent)',
                  color: 'var(--sl-accent)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Open a Sample</span>
              </button>
            </div>

            {/* Quick Sample Selector Grid (Never trapped) */}
            <div className="pt-2">
              <div className="text-xs font-medium mb-2.5" style={{ color: 'var(--sl-text-secondary)' }}>
                Or choose a verified model from the library:
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BUNDLED_SAMPLES.map((s: SampleMeta) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenSample(s.spec)}
                    className="p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between"
                    style={{
                      backgroundColor: 'var(--sl-bg-raised)',
                      borderColor: 'var(--sl-border)',
                    }}
                  >
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--sl-text-primary)' }}>
                      {s.title}
                    </div>
                    <div className="text-xs font-mono mt-1" style={{ color: 'var(--sl-text-muted)' }}>
                      {s.componentCount} components
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step sequence */}
            <div className="space-y-3.5">
              {steps.map((step, idx) => {
                const isCompleted = currentStep > idx;
                const isCurrent = currentStep === idx;

                return (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="pt-0.5">
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--sl-success)' }} />
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--sl-accent)' }} />
                      ) : (
                        <div
                          className="w-4 h-4 rounded-full border text-[10px] flex items-center justify-center font-mono"
                          style={{ borderColor: 'var(--sl-border)', color: 'var(--sl-text-muted)' }}
                        >
                          {idx + 1}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-xs sm:text-sm font-semibold transition-colors"
                        style={{
                          color: isCompleted || isCurrent ? 'var(--sl-text-primary)' : 'var(--sl-text-muted)',
                        }}
                      >
                        {step.title}
                      </div>
                      <div
                        className="text-xs mt-0.5 transition-colors line-clamp-1"
                        style={{
                          color: isCurrent
                            ? 'var(--sl-accent)'
                            : isCompleted
                            ? 'var(--sl-text-secondary)'
                            : 'var(--sl-text-muted)',
                        }}
                      >
                        {step.subtitle}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Skeleton Preview of Loading Scene Elements */}
            <div
              className="p-3.5 rounded-xl border space-y-2.5"
              style={{ backgroundColor: 'var(--sl-bg-raised)', borderColor: 'var(--sl-border)' }}
            >
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--sl-text-muted)' }}>
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Procedural Assembly Assembly in Progress
                </span>
                <span className="font-mono">{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sl-border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, ((currentStep + 1) / steps.length) * 100)}%`,
                    backgroundColor: 'var(--sl-accent)',
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="h-6 rounded sl-skeleton" />
                <div className="h-6 rounded sl-skeleton" />
                <div className="h-6 rounded sl-skeleton" />
              </div>
            </div>

            {/* Option to cancel / open sample without waiting */}
            <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--sl-border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--sl-text-muted)' }}>
                Taking too long?
              </span>
              <button
                type="button"
                onClick={() => onOpenSample()}
                className="text-xs font-medium flex items-center gap-1 cursor-pointer transition"
                style={{ color: 'var(--sl-accent)' }}
              >
                <span>Open sample instantly</span>
                <BookOpen className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
