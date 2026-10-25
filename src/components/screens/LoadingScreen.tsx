import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Cpu, AlertTriangle, RefreshCw, BookOpen } from 'lucide-react';

interface LoadingScreenProps {
  goalPrompt: string;
  isGenerating: boolean;
  onOpenSample: () => void;
  error?: string | null;
  onRetry?: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  goalPrompt,
  isGenerating,
  onOpenSample,
  error,
  onRetry,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Understanding topic',
      subtitle: `Analyzing "${goalPrompt.slice(0, 48)}${goalPrompt.length > 48 ? '...' : ''}"`,
      duration: 650,
    },
    {
      title: 'Designing components',
      subtitle: 'Configuring structural bounds, materials, and subsystem groups',
      duration: 750,
    },
    {
      title: 'Building 3D scene',
      subtitle: 'Synthesizing procedural geometries, wiring graph, and mechanisms',
      duration: 700,
    },
    {
      title: 'Validating',
      subtitle: 'Verifying schema integrity, bounding volumes, and connections',
      duration: 550,
    },
  ];

  useEffect(() => {
    if (error || !isGenerating) return;

    let timer: ReturnType<typeof setTimeout>;
    const advanceStep = () => {
      setCurrentStep((stepIdx) => {
        const nextStep = stepIdx < steps.length - 1 ? stepIdx + 1 : 0;
        timer = setTimeout(advanceStep, steps[stepIdx].duration);
        return nextStep;
      });
    };

    timer = setTimeout(advanceStep, steps[0].duration);

    return () => clearTimeout(timer);
  }, [error, isGenerating]);

  return (
    <div className="min-h-screen w-full bg-[#070B14] text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.12),transparent_70%)] pointer-events-none" />

      <div className="max-w-md w-full bg-[#0F172A] border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-sky-400">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white font-['Outfit']">Configuring 3D Model</h2>
            <p className="text-xs text-sky-400 font-mono">Grounded Assembly Engine</p>
          </div>
        </div>

        {error ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Notice</span>
              </div>
              <p className="leading-relaxed text-slate-300">{error}</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenSample}
                className="flex-1 py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                <span>Open a sample instead</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Stepped progress indicators */}
            <div className="space-y-4 mb-8">
              {steps.map((step, idx) => {
                const isCompleted = currentStep > idx;
                const isCurrent = currentStep === idx;

                return (
                  <div key={idx} className="flex items-start gap-4">
                    <div className="pt-0.5">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-sky-400" />
                      ) : isCurrent ? (
                        <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-700 flex items-center justify-center text-[10px] text-slate-600 font-bold">
                          {idx + 1}
                        </div>
                      )}
                    </div>
                    <div>
                      <div
                        className={`text-sm font-semibold transition-colors ${
                          isCompleted || isCurrent ? 'text-white' : 'text-slate-500'
                        }`}
                      >
                        {step.title}
                      </div>
                      <div
                        className={`text-xs transition-colors mt-0.5 ${
                          isCurrent
                            ? 'text-sky-300'
                            : isCompleted
                            ? 'text-slate-400'
                            : 'text-slate-600'
                        }`}
                      >
                        {step.subtitle}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Animated Progress Bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-sky-400 h-full rounded-full transition-all duration-500 ease-out shadow-sm shadow-sky-400"
                style={{
                  width: `${Math.min(100, ((currentStep + 1) / steps.length) * 100)}%`,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
