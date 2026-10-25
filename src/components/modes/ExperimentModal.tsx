import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ArrowRight, RotateCcw, X, Play } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="max-w-xl w-full bg-[#0F172A] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-['Outfit']">
                What-If Hardware Failure Lab
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Observe Physical Degradation & Consequence
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Experiment Selector Tabs */}
        <div className="flex border-b border-slate-800 overflow-x-auto bg-slate-900/50 p-2 gap-2 text-xs">
          {experiments.map((exp, idx) => (
            <button
              key={exp.id || idx}
              type="button"
              onClick={() => {
                handleReset();
                setSelectedExpIndex(idx);
              }}
              className={`px-3 py-2 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                selectedExpIndex === idx
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {exp.title}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase bg-slate-800 text-slate-300 mb-2">
              Action: {actionLabels[currentExp.action] || currentExp.action}
            </div>
            <h3 className="text-base font-bold text-white mb-2">{currentExp.title}</h3>
            <p className="text-xs text-slate-400">
              Targets affected:{' '}
              <span className="font-mono text-sky-400">
                {currentExp.targets.join(', ')}
              </span>
            </p>
          </div>

          {/* Simulation Outcome */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <span>Observed Physical Consequence:</span>
            </div>
            <div className="text-sm font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg leading-relaxed">
              {currentExp.consequence}
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                Engineering Explanation:
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {currentExp.explanation}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Normal State</span>
          </button>

          <button
            type="button"
            onClick={handleRunSimulation}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-xs transition cursor-pointer shadow-md ${
              isSimulated
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulated ? 'Simulating in 3D' : 'Simulate Fault in 3D'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
