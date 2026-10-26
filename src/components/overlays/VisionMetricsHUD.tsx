import React, { useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { VisionMetrics, GestureState } from '../../types/vision';

interface VisionMetricsHUDProps {
  metrics: VisionMetrics;
  gestureState: GestureState;
  cameraActive: boolean;
  onToggleClahe: () => boolean;
  onStartCalibration: () => void;
  onToggleDebugView: () => void;
  debugViewActive: boolean;
}

export const VisionMetricsHUD: React.FC<VisionMetricsHUDProps> = ({
  metrics,
  gestureState,
  cameraActive,
  onToggleClahe,
  onStartCalibration,
  onToggleDebugView,
  debugViewActive,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <div className="absolute top-16 left-6 z-30 max-w-xs w-full bg-[#0F172A]/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-xl overflow-hidden text-xs select-none">
      {/* Header bar */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
            }`}
          />
          <span className="font-semibold text-slate-200">OpenCV Vision</span>
          <span className="font-mono text-[11px] text-sky-400 font-bold">
            {metrics.fps} FPS
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
            {gestureState}
          </span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {/* Expanded Metrics Details */}
      {isExpanded && (
        <div className="p-3 pt-0 border-t border-slate-800/80 space-y-3">
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Live FPS</span>
              <span className="font-mono font-semibold text-sky-400 text-xs">
                {metrics.fps} FPS
              </span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Confidence</span>
              <span className="font-mono font-semibold text-emerald-400 text-xs">
                {(metrics.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Jitter (Still)</span>
              <span className="font-mono font-semibold text-sky-400 text-xs">
                ±{metrics.jitterPx.toFixed(1)} px
              </span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Loss Events</span>
              <span className="font-mono font-semibold text-amber-400 text-xs">
                {metrics.lossEvents} events
              </span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-medium">Gesture State</span>
            <span className="font-mono text-xs font-bold text-sky-300 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30">
              {gestureState}
            </span>
          </div>

          {/* Interactive Vision Toggles */}
          <div className="space-y-1.5 pt-1">
            {/* CLAHE Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">LAB CLAHE Preproc</span>
              <button
                type="button"
                onClick={() => {
                  setActionError(onToggleClahe() ? null : 'Vision service unavailable.');
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                  metrics.claheEnabled === true
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {metrics.claheEnabled === true
                  ? 'ON (Balanced)'
                  : metrics.claheEnabled === false
                  ? 'OFF (Raw)'
                  : 'Waiting for service'}
              </button>
            </div>

            {actionError && <p className="text-[10px] text-rose-400">{actionError}</p>}

            {/* Calibration Trigger */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Hand Range Calibration</span>
              <button
                type="button"
                disabled={!cameraActive}
                onClick={onStartCalibration}
                className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Calibrate</span>
              </button>
            </div>

            {/* Debug View Overlay */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Debug Camera Overlay</span>
              <button
                type="button"
                onClick={onToggleDebugView}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  debugViewActive
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {debugViewActive ? 'VISIBLE' : 'HIDDEN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
