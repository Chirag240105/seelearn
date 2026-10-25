import React from 'react';
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
  if (!isOpen || !steps || steps.length === 0) return null;

  const currentStep = steps[currentStepIndex] || steps[0];

  return (
    <div className="absolute bottom-20 left-6 z-30 max-w-lg w-full bg-[#0F172A]/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-['Outfit']">
              Assembly Manual & Bench Guide
            </h4>
            <p className="text-[11px] text-slate-400">
              Step {currentStepIndex + 1} of {steps.length}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Step Contents */}
      <div className="p-5 space-y-3">
        <div>
          <div className="text-[10px] font-mono text-sky-400 uppercase mb-1">
            Components: {currentStep.componentIds.join(', ')}
          </div>
          <p className="text-sm text-slate-200 leading-relaxed font-medium">
            {currentStep.instruction}
          </p>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
        <button
          type="button"
          disabled={currentStepIndex === 0}
          onClick={() => onSelectStepIndex(Math.max(0, currentStepIndex - 1))}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <div className="flex gap-1.5">
          {steps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectStepIndex(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                idx === currentStepIndex
                  ? 'bg-sky-400 w-5'
                  : idx < currentStepIndex
                  ? 'bg-sky-700'
                  : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          disabled={currentStepIndex === steps.length - 1}
          onClick={() => onSelectStepIndex(Math.min(steps.length - 1, currentStepIndex + 1))}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
