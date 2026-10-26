import React, { useEffect } from 'react';
import { Wrench, ChevronLeft, ChevronRight, CheckCircle2, X } from 'lucide-react';
import { SceneAssemblyStep } from '../../types/sceneSpec';

interface AssemblyStepsPanelProps {
  isOpen: boolean;
  steps: SceneAssemblyStep[];
  currentStepIndex: number;
  onSelectStepIndex: (index: number) => void;
  onClose: () => void;
}

export const AssemblyStepsPanel: React.FC<AssemblyStepsPanelProps> = ({
  isOpen,
  steps,
  currentStepIndex,
  onSelectStepIndex,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isOpen, onClose]);

  if (!isOpen || !steps || steps.length === 0) return null;

  const currentStep = steps[currentStepIndex] || steps[0];

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-2xl w-[calc(100%-2rem)] rounded-2xl shadow-2xl border backdrop-blur-xl select-none overflow-hidden transition-all"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        borderColor: 'var(--sl-border)',
        color: 'var(--sl-text-primary)',
      }}
    >
      {/* Header bar */}
      <div
        className="px-4 py-2.5 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--sl-border-subtle)', backgroundColor: 'var(--sl-bg-raised)' }}
      >
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4" style={{ color: 'var(--sl-accent)' }} />
          <span className="text-xs font-bold uppercase tracking-wider">Assembly Step Timeline</span>
          <span className="text-xs font-mono" style={{ color: 'var(--sl-text-muted)' }}>
            ({currentStepIndex + 1} of {steps.length})
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg border transition cursor-pointer"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border)',
            color: 'var(--sl-text-muted)',
          }}
          title="Exit Assembly Mode"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Instruction text */}
      <div className="p-4 space-y-2">
        <div className="text-xs font-mono uppercase" style={{ color: 'var(--sl-accent)' }}>
          Active Parts: {currentStep.componentIds.join(', ')}
        </div>
        <p className="text-xs sm:text-sm font-medium leading-relaxed" style={{ color: 'var(--sl-text-primary)' }}>
          {currentStep.instruction}
        </p>
      </div>

      {/* Timeline controls */}
      <div
        className="px-4 py-2.5 border-t flex items-center justify-between gap-3"
        style={{ borderColor: 'var(--sl-border-subtle)', backgroundColor: 'var(--sl-bg-raised)' }}
      >
        <button
          type="button"
          disabled={currentStepIndex === 0}
          onClick={() => onSelectStepIndex(Math.max(0, currentStepIndex - 1))}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border)',
            color: 'var(--sl-text-primary)',
          }}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        {/* Step dots */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {steps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectStepIndex(idx)}
              className="h-2 rounded-full transition-all cursor-pointer"
              style={{
                width: idx === currentStepIndex ? '20px' : '8px',
                backgroundColor:
                  idx === currentStepIndex
                    ? 'var(--sl-accent)'
                    : idx < currentStepIndex
                    ? 'var(--sl-success)'
                    : 'var(--sl-border)',
              }}
              title={`Jump to step ${idx + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          disabled={currentStepIndex === steps.length - 1}
          onClick={() => onSelectStepIndex(Math.min(steps.length - 1, currentStepIndex + 1))}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          style={{
            backgroundColor: 'var(--sl-accent)',
            color: '#ffffff',
          }}
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
