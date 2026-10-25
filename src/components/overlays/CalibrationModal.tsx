import React, { useState, useEffect, useRef } from 'react';
import { Target, CheckCircle2, RefreshCw, X } from 'lucide-react';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrationComplete: (samples: [number, number][]) => boolean;
  currentCursor: { x: number; y: number } | null;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  onCalibrationComplete,
  currentCursor,
}) => {
  const [currentCornerIndex, setCurrentCornerIndex] = useState(0);
  const [samples, setSamples] = useState<[number, number][]>([]);
  const [holdProgress, setHoldProgress] = useState(0);
  const [result, setResult] = useState<'success' | 'failure' | null>(null);
  const samplesRef = useRef<[number, number][]>([]);
  const currentCursorRef = useRef(currentCursor);
  const cornerSampleCountRef = useRef(0);
  currentCursorRef.current = currentCursor;

  const corners = [
    { label: 'Top-Left Corner', x: 0.15, y: 0.15 },
    { label: 'Top-Right Corner', x: 0.85, y: 0.15 },
    { label: 'Bottom-Right Corner', x: 0.85, y: 0.85 },
    { label: 'Bottom-Left Corner', x: 0.15, y: 0.85 },
  ];

  useEffect(() => {
    if (!isOpen) {
      setCurrentCornerIndex(0);
      setSamples([]);
      setHoldProgress(0);
      setResult(null);
      samplesRef.current = [];
      cornerSampleCountRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      const cursor = currentCursorRef.current;
      if (!cursor) return;

      const nextSamples = [...samplesRef.current, [cursor.x, cursor.y] as [number, number]];
      samplesRef.current = nextSamples;
      setSamples(nextSamples);
      cornerSampleCountRef.current += 1;
      setHoldProgress((cornerSampleCountRef.current / 3) * 100);

      if (cornerSampleCountRef.current < 3) return;
      cornerSampleCountRef.current = 0;

      if (currentCornerIndex < corners.length - 1) {
        setCurrentCornerIndex((index) => index + 1);
        setHoldProgress(0);
        return;
      }

      setResult(onCalibrationComplete(nextSamples) ? 'success' : 'failure');
      clearInterval(interval);
    }, 400);

    return () => clearInterval(interval);
  }, [isOpen, currentCornerIndex, onCalibrationComplete]);

  if (!isOpen) return null;

  const targetCorner = corners[currentCornerIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md select-none">
      {/* Target Crosshair positioned at the active calibration corner */}
      <div
        className="absolute pointer-events-none transition-all duration-300 -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${targetCorner.x * 100}%`,
          top: `${targetCorner.y * 100}%`,
        }}
      >
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-2 border-sky-400 animate-ping opacity-30" />
          <div className="absolute w-12 h-12 rounded-full border-2 border-sky-400 bg-sky-400/20 flex items-center justify-center">
            <Target className="w-6 h-6 text-sky-300" />
          </div>
          {/* Circular progress SVG */}
          <svg className="absolute w-20 h-20 -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="34"
              stroke="#0284C7"
              strokeWidth="4"
              fill="transparent"
            />
            <circle
              cx="40"
              cy="40"
              r="34"
              stroke="#38BDF8"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={213}
              strokeDashoffset={213 - (213 * holdProgress) / 100}
              className="transition-all duration-100"
            />
          </svg>
        </div>
      </div>

      {/* Center Instruction Box */}
      <div className="max-w-md w-full bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-2xl text-center z-10">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 font-mono">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>OpenCV Reach Calibration</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <h3 className="text-lg font-bold text-white mb-2 font-['Outfit']">
          Point to {targetCorner.label}
        </h3>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Move your hand to comfortable maximum reach at each target. Collect 3 samples at each corner.
        </p>
        {result && (
          <p className={`mb-4 text-xs ${result === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {result === 'success'
              ? `Calibration sent successfully (${samples.length} samples).`
              : 'Calibration failed: connect the vision service and try again.'}
          </p>
        )}
        {!result && (
          <p className="mb-4 text-xs text-slate-500">
            Samples collected: {samples.length} / 12
          </p>
        )}

        {/* 4 Corner indicators */}
        <div className="flex justify-center gap-3">
          {corners.map((c, idx) => (
            <div
              key={idx}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                currentCornerIndex === idx
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : currentCornerIndex > idx
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
