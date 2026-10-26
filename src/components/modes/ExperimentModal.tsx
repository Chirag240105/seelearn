import React, { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X, Play } from 'lucide-react';
import { SceneExperiment } from '../../types/sceneSpec';

interface ExperimentModalProps {
  isOpen: boolean;
  experiments: SceneExperiment[];
  onClose: () => void;
  onApplyExperiment: (exp: SceneExperiment | null) => void;
}

export const ExperimentModal: React.FC<ExperimentModalProps> = ({
  isOpen,
  experiments,
  onClose,
  onApplyExperiment,
}) => {
  const [selectedExpIndex, setSelectedExpIndex] = useState(0);
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSimulated(false);
        onApplyExperiment(null);
        onClose();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isOpen, onClose, onApplyExperiment]);

  if (!isOpen || !experiments || experiments.length === 0) return null;

  const currentExp = experiments[selectedExpIndex] || experiments[0];

  const handleRunSimulation = () => {
    setIsSimulated(true);
    onApplyExperiment(currentExp);
  };

  const handleReset = () => {
    setIsSimulated(false);
    onApplyExperiment(null);
  };

  const actionLabels: Record<string, string> = {
    disable: 'Disconnect / Power Loss',
    reverse: 'Invert Direction / Polarity',
    remove: 'Physical Component Loss',
    overload: 'Thermal / Voltage Overload',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
    >
      <div
        className="max-w-xl w-full rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--sl-bg-surface)',
          borderColor: 'var(--sl-border)',
          color: 'var(--sl-text-primary)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--sl-border-subtle)', backgroundColor: 'var(--sl-bg-raised)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="p-1.5 rounded-lg border"
              style={{
                backgroundColor: 'var(--sl-warning-muted)',
                borderColor: 'var(--sl-warning)',
                color: 'var(--sl-warning)',
              }}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">What-If Hardware Failure Lab</h2>
              <p className="text-xs font-mono" style={{ color: 'var(--sl-text-muted)' }}>
                Test Component Fault Tolerances & Degradation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1 rounded-lg border transition cursor-pointer"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-muted)',
            }}
            title="Close Lab"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Experiment Selector Tabs */}
        <div
          className="flex border-b overflow-x-auto p-2 gap-2 text-xs"
          style={{ borderColor: 'var(--sl-border-subtle)', backgroundColor: 'var(--sl-bg-base)' }}
        >
          {experiments.map((exp, idx) => (
            <button
              key={exp.id || idx}
              type="button"
              onClick={() => {
                handleReset();
                setSelectedExpIndex(idx);
              }}
              className="px-3 py-1.5 rounded-lg font-medium whitespace-nowrap border transition cursor-pointer"
              style={{
                backgroundColor: selectedExpIndex === idx ? 'var(--sl-warning-muted)' : 'var(--sl-bg-surface)',
                borderColor: selectedExpIndex === idx ? 'var(--sl-warning)' : 'var(--sl-border)',
                color: selectedExpIndex === idx ? 'var(--sl-warning)' : 'var(--sl-text-secondary)',
              }}
            >
              {exp.title}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono uppercase border mb-2"
              style={{
                backgroundColor: 'var(--sl-bg-raised)',
                borderColor: 'var(--sl-border)',
                color: 'var(--sl-text-secondary)',
              }}
            >
              Action: {actionLabels[currentExp.action] || currentExp.action}
            </div>
            <h3 className="text-base font-bold mb-1.5">{currentExp.title}</h3>
            <p className="text-xs" style={{ color: 'var(--sl-text-muted)' }}>
              Targets affected: <span className="font-mono font-semibold" style={{ color: 'var(--sl-accent)' }}>{currentExp.targets.join(', ')}</span>
            </p>
          </div>

          {/* Simulation Outcome */}
          <div
            className="p-4 rounded-xl border space-y-3"
            style={{ backgroundColor: 'var(--sl-bg-raised)', borderColor: 'var(--sl-border)' }}
          >
            <div className="text-xs font-semibold" style={{ color: 'var(--sl-text-secondary)' }}>
              Observed Physical Consequence:
            </div>
            <div
              className="text-xs sm:text-sm font-medium p-3 rounded-lg border leading-relaxed"
              style={{
                backgroundColor: 'var(--sl-warning-muted)',
                borderColor: 'var(--sl-warning)',
                color: 'var(--sl-text-primary)',
              }}
            >
              {currentExp.consequence}
            </div>

            <div className="pt-2 border-t" style={{ borderColor: 'var(--sl-border-subtle)' }}>
              <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--sl-text-muted)' }}>
                Engineering Explanation:
              </span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--sl-text-secondary)' }}>
                {currentExp.explanation}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="p-3.5 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--sl-border-subtle)', backgroundColor: 'var(--sl-bg-raised)' }}
        >
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-secondary)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Normal</span>
          </button>

          <button
            type="button"
            onClick={handleRunSimulation}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition cursor-pointer shadow-md"
            style={{
              backgroundColor: isSimulated ? 'var(--sl-warning)' : 'var(--sl-accent)',
              color: isSimulated ? '#0f172a' : '#ffffff',
            }}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulated ? 'Simulating Fault in 3D' : 'Simulate Fault in 3D'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
