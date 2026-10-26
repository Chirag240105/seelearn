import React, { useEffect, useState } from 'react';
import { GestureState } from '../../types/vision';

interface GestureCursorOverlayProps {
  cursorPos: { x: number; y: number } | null;
  gestureState: GestureState;
  pinchDistanceNormalized: number;
  detected: boolean;
}

export const GestureCursorOverlay: React.FC<GestureCursorOverlayProps> = ({
  cursorPos,
  gestureState,
  pinchDistanceNormalized,
  detected,
}) => {
  const isPinching = gestureState === 'PINCH_HOLD' || gestureState === 'PINCH_START';
  const isPinchRelease = gestureState === 'PINCH_RELEASE';
  const [dwellProgress, setDwellProgress] = useState(0);

  useEffect(() => {
    if (!isPinching) {
      setDwellProgress(0);
      return;
    }
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      setDwellProgress(Math.min(1, (performance.now() - startedAt) / 700));
    }, 24);
    return () => window.clearInterval(timer);
  }, [isPinching]);

  if (!cursorPos) return null;

  // Ring size scales inversely with pinch distance (rings collapse together when pinching)
  const ringSize = Math.max(24, Math.min(64, pinchDistanceNormalized * 80));

  return (
    <div
      className={`fixed pointer-events-none z-50 transition-opacity duration-200 ${detected ? 'opacity-100' : 'opacity-0'}`}
      style={{
        left: `${cursorPos.x * 100}%`,
        top: `${cursorPos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Outer Targeting Ring */}
      <div
        className={`relative rounded-full border-2 transition-all duration-75 flex items-center justify-center ${
          isPinching
            ? 'border-sky-400 bg-sky-400/25 scale-90 shadow-lg shadow-sky-400/50'
            : isPinchRelease
            ? 'border-emerald-400 scale-110'
            : 'border-sky-400/80 bg-sky-400/10'
        }`}
        style={{
          width: `${ringSize}px`,
          height: `${ringSize}px`,
        }}
      >
        <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] -rotate-90">
          <circle cx="50%" cy="50%" r="46%" fill="none" stroke="rgba(56,189,248,0.2)" strokeWidth="3" pathLength="100" />
          <circle
            cx="50%"
            cy="50%"
            r="46%"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={100 * (1 - (isPinching ? dwellProgress : 0))}
            pathLength="100"
            className="transition-[stroke-dashoffset] duration-75"
          />
        </svg>
        {/* Center Point */}
        <div
          className={`w-2 h-2 rounded-full transition-transform ${
            isPinching ? 'bg-white scale-125' : 'bg-sky-400'
          }`}
        />
      </div>

      {/* Gesture State Pill Tag */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap">
        <span
          className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shadow ${
            isPinching
              ? 'bg-sky-500 text-slate-950 font-bold'
              : 'bg-slate-900/90 text-sky-400 border border-slate-700'
          }`}
        >
          {gestureState}
        </span>
      </div>
    </div>
  );
};
