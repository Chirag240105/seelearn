import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react';
import { GestureState, VisionMetrics, VisionServiceState } from '../../types/vision';

interface VisionMetricsHUDProps {
  metrics: VisionMetrics;
  gestureState: GestureState;
  statusMessage: string;
  cameraActive: boolean;
  serviceState: VisionServiceState | null;
  onToggleClahe: () => boolean;
  onSetFilter: (value: 'kalman' | 'none') => boolean;
  onStartCalibration: () => void;
  onToggleDebugView: () => void;
  debugViewActive: boolean;
  modeKey?: string;
}

export const VisionMetricsHUD: React.FC<VisionMetricsHUDProps> = ({
  metrics,
  gestureState,
  statusMessage,
  cameraActive,
  serviceState,
  onToggleClahe,
  onSetFilter,
  onStartCalibration,
  onToggleDebugView,
  debugViewActive,
  modeKey,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => { setIsExpanded(false); }, [modeKey]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsVisible(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const claheEnabled = serviceState?.clahe;
  const filterMode = serviceState?.filter ?? 'kalman';

  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={() => setIsVisible(true)}
        className="absolute top-16 left-6 z-30 rounded-lg border border-slate-700 bg-[#0F172A]/90 px-3 py-2 text-xs text-slate-200 shadow-xl"
      >
        Vision controls
      </button>
    );
  }

  return (
    <div className="absolute top-[6.5rem] left-3 z-30 max-w-xs w-full bg-slate-950/85 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl overflow-hidden text-xs select-none">
      <div className="flex items-center p-3 hover:bg-slate-800/50 transition-colors">
        <button type="button" className="flex-1 min-w-0 flex items-center gap-2 text-left" onClick={() => setIsExpanded(!isExpanded)}>
          <div className={`w-2 h-2 shrink-0 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="truncate font-semibold text-slate-200">{statusMessage}</span>
          <span className="shrink-0 font-mono text-[11px] text-sky-400 font-bold">{metrics.fps} FPS</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        <button
          type="button"
          aria-label="Close vision controls"
          onClick={() => setIsVisible(false)}
          className="ml-2 p-1 text-slate-400 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isExpanded && (
        <div className="p-3 pt-0 border-t border-slate-800/80 space-y-3">
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Live FPS</span>
              <span className="font-mono font-semibold text-sky-400">{metrics.fps} FPS</span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Confidence</span>
              <span className="font-mono font-semibold text-emerald-400">{(metrics.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Jitter while still</span>
              <span className="font-mono font-semibold text-sky-400">±{metrics.jitterPx.toFixed(1)} px</span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Frame latency</span>
              <span className="font-mono font-semibold text-sky-400">{metrics.latencyMs.toFixed(1)} ms</span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800 col-span-2">
              <span className="text-[10px] text-slate-500 block">Tracking losses</span>
              <span className="font-mono font-semibold text-amber-400">{metrics.lossEvents}</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 p-2">
            <span className="text-[10px] uppercase text-slate-400">Gesture</span>
            <span className="font-mono font-bold text-sky-300">{gestureState}</span>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">LAB CLAHE</span>
              <button
                type="button"
                disabled={!cameraActive}
                onClick={() => setActionError(onToggleClahe() ? null : 'Vision service unavailable.')}
                className={`px-2 py-1 rounded text-[10px] font-mono font-semibold disabled:opacity-40 ${claheEnabled ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              >
                {claheEnabled === undefined ? 'WAITING' : claheEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <label className="flex items-center justify-between gap-2 text-slate-400">
              <span>Cursor filter</span>
              <select
                aria-label="Cursor filter"
                value={filterMode}
                disabled={!cameraActive}
                onChange={(event) => setActionError(onSetFilter(event.target.value as 'kalman' | 'none') ? null : 'Vision service unavailable.')}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 disabled:opacity-40"
              >
                <option value="kalman">Kalman</option>
                <option value="none">None</option>
              </select>
            </label>
            {actionError && <p className="text-[10px] text-rose-400">{actionError}</p>}

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Reach calibration</span>
              <button type="button" disabled={!cameraActive} onClick={onStartCalibration}
                className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:text-white disabled:opacity-40">
                <RefreshCw className="w-2.5 h-2.5" /> Calibrate
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Debug view</span>
              <button type="button" onClick={onToggleDebugView}
                className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">
                {debugViewActive ? 'ON' : 'OFF'}
              </button>
            </div>
            {serviceState?.calibrated && <p className="text-[10px] text-emerald-400">Reach calibration active</p>}
          </div>
        </div>
      )}
    </div>
  );
};
