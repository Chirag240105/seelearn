import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Rotate3d, 
  Layers, 
  Activity, 
  Play, 
  HelpCircle, 
  RotateCcw, 
  Wrench, 
  Camera, 
  Eye, 
  Sliders, 
  Sparkles,
  ArrowLeft,
  Share2,
  AlertTriangle,
  Download,
  RefreshCw,
  Box,
  Cpu
} from 'lucide-react';
import { SceneSpec, ConnectionType, SceneExperiment } from '../../types/sceneSpec';
import { GestureState, VisionMetrics, HandTrackingPacket } from '../../types/vision';
import { GenericSceneCanvas } from '../viewport3d/GenericSceneCanvas';
import { ComponentDetailCard } from '../overlays/ComponentDetailCard';
import { GestureCursorOverlay } from '../overlays/GestureCursorOverlay';
import { VisionMetricsHUD } from '../overlays/VisionMetricsHUD';
import { TraceLegend } from '../modes/TraceLegend';
import { ExperimentModal } from '../modes/ExperimentModal';
import { AssemblyStepsPanel } from '../modes/AssemblyStepsPanel';
import { CalibrationModal } from '../overlays/CalibrationModal';
import { CameraDebugOverlay } from '../overlays/CameraDebugOverlay';
import { visionClient } from '../../services/visionClient';
import { seeLearnApiClient } from '../../services/awsClient';

interface WorkspaceScreenProps {
  spec: SceneSpec;
  onBackToPrompt: () => void;
  onRegenerate?: () => void;
}

export const WorkspaceScreen: React.FC<WorkspaceScreenProps> = ({
  spec,
  onBackToPrompt,
  onRegenerate,
}) => {
  // View & Mode State
  const [viewMode, setViewMode] = useState<'solid' | 'xray' | 'exploded'>('solid');
  const [mode, setMode] = useState<'explore' | 'trace' | 'operate' | 'experiment' | 'assembly'>('explore');
  const [explodedProgress, setExplodedProgress] = useState(0); // 0 (compact) to 1 (exploded)
  const [selectedComponentId, setSelectedComponentId] = useState<string>(
    spec.components[0]?.id || ''
  );
  const [connectionFilter, setConnectionFilter] = useState<'all' | ConnectionType>('all');

  // Vision tracking state
  const [isVisionConnected, setIsVisionConnected] = useState(false);
  const [visionStatusMessage, setVisionStatusMessage] = useState('Camera control off - mouse mode');
  const [isAwsOffline, setIsAwsOffline] = useState(true);
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [rotateMode, setRotateMode] = useState<boolean>(false);
  const [gestureCursor, setGestureCursor] = useState<{ x: number; y: number } | null>(null);
  const [rawCursor, setRawCursor] = useState<{ x: number; y: number } | null>(null);
  const [pinchDistance, setPinchDistance] = useState(0.8);
  const [debugViewActive, setDebugViewActive] = useState(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);

  // Vision metrics (measured OpenCV properties)
  const [metrics, setMetrics] = useState<VisionMetrics>({
    fps: 0,
    confidence: 0,
    jitterPx: 0,
    lossEvents: 0,
  });

  // Modals & Panels
  const [isExperimentOpen, setIsExperimentOpen] = useState(false);
  const [isAssemblyStepsOpen, setIsAssemblyStepsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [activeExperiment, setActiveExperiment] = useState<SceneExperiment | null>(null);
  const handleCalibrationComplete = useCallback(
    (samples: [number, number][]) => visionClient.sendCalibrationSamples(samples),
    []
  );

  // Ensure selected component exists when spec changes
  useEffect(() => {
    if (spec.components.length > 0) {
      const exists = spec.components.some((c) => c.id === selectedComponentId);
      if (!exists) {
        setSelectedComponentId(spec.components[0].id);
      }
    }
  }, [spec, selectedComponentId]);

  // Listen to AWS client offline status
  useEffect(() => {
    return seeLearnApiClient.onStatusChange((offline: boolean) => {
      setIsAwsOffline(offline);
    });
  }, []);

  // Connect to local Python OpenCV WebSocket service and register listeners
  useEffect(() => {
    visionClient.connect();

    const unsubStatus = visionClient.onStatusChange((connected, message) => {
      setIsVisionConnected(connected);
      setVisionStatusMessage(connected ? 'OpenCV Vision Connected' : 'Camera control off - mouse mode');
      if (!connected) {
        setGestureCursor(null);
        setGestureState('IDLE');
      }
    });

    const unsubPacket = visionClient.onPacket((packet: HandTrackingPacket) => {
      setGestureCursor(packet.cursorNormalized);
      setRawCursor(packet.cursorRaw || packet.cursorNormalized);
      setGestureState(packet.gestureState);
      setRotateMode(Boolean(packet.rotateMode));
      setPinchDistance(packet.pinchDistanceNormalized || 0.8);
      setMetrics(packet.metrics);
    });

    return () => {
      unsubStatus();
      unsubPacket();
      visionClient.disconnect();
    };
  }, []);

  // Exploded view transition
  useEffect(() => {
    if (viewMode === 'exploded') {
      setExplodedProgress(1.0);
    } else {
      setExplodedProgress(0.0);
    }
  }, [viewMode]);

  // Keyboard Shortcuts: E (Explore), T (Trace), O (Operate), R (Reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'e':
          setMode('explore');
          break;
        case 't':
          setMode('trace');
          break;
        case 'o':
          setMode('operate');
          break;
        case 'r':
          // Reset view mode and selections
          setViewMode('solid');
          setExplodedProgress(0);
          setConnectionFilter('all');
          setActiveExperiment(null);
          if (spec.components.length > 0) {
            setSelectedComponentId(spec.components[0].id);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spec.components]);

  // Export current SceneSpec as formatted JSON file
  const handleExportJson = () => {
    const cleanSpecJson = JSON.stringify(spec, null, 2);
    const blob = new Blob([cleanSpecJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.topic.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_spec.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate connection counts by type for TraceLegend
  const connectionCounts = React.useMemo(() => {
    const counts: Record<ConnectionType, number> = {
      power: 0,
      signal: 0,
      data: 0,
      mechanical: 0,
      thermal: 0,
    };
    (spec.connections || []).forEach((c) => {
      if (counts[c.type] !== undefined) {
        counts[c.type]++;
      }
    });
    return counts;
  }, [spec.connections]);

  return (
    <div className="w-full h-screen bg-[#070B14] text-slate-100 flex flex-col overflow-hidden relative select-none">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left: Back button + Title & Badges */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToPrompt}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs font-medium"
            title="Return to topic search"
          >
            <ArrowLeft className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">New Topic</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white font-['Outfit'] truncate max-w-xs sm:max-w-md">
              {spec.title}
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 capitalize hidden md:inline">
              {spec.layoutStyle}
            </span>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('explore')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'explore'
                ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>Explore (E)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('trace')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'trace'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Trace (T)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('operate')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'operate'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Operate (O)</span>
          </button>

          {spec.experiments && spec.experiments.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMode('experiment');
                setIsExperimentOpen(true);
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                mode === 'experiment'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Experiment</span>
            </button>
          )}

          {spec.assemblySteps && spec.assemblySteps.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMode('assembly');
                setIsAssemblyStepsOpen(true);
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                mode === 'assembly'
                  ? 'bg-violet-500 text-slate-950 font-bold shadow-md shadow-violet-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Assembly</span>
            </button>
          )}
        </div>

        {/* Right: Actions, Vision Chip & Export */}
        <div className="flex items-center gap-2.5">
          {/* Vision status badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border ${
              isVisionConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isVisionConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="hidden sm:inline">{visionStatusMessage}</span>
          </div>

          {/* Export JSON Button */}
          <button
            type="button"
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
            title="Download full SceneSpec JSON"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">Export JSON</span>
          </button>

          {/* Reset View Button */}
          <button
            type="button"
            onClick={() => {
              setViewMode('solid');
              setExplodedProgress(0);
              setConnectionFilter('all');
              setActiveExperiment(null);
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Reset (R)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 3D Viewport Area */}
        <div className="flex-1 h-full relative">
          <GenericSceneCanvas
            spec={spec}
            viewMode={viewMode}
            mode={mode}
            explodedProgress={explodedProgress}
            selectedComponentId={selectedComponentId}
            onSelectComponent={setSelectedComponentId}
            connectionFilter={connectionFilter}
            activeExperiment={activeExperiment}
            activeAssemblyStepIndex={currentStepIndex}
            gestureCursor={gestureCursor}
            gestureState={gestureState}
            rotateMode={rotateMode}
          />

          {/* View Mode Controls Float (Solid / X-ray / Exploded) */}
          <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1.5 bg-[#0F172A]/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl">
            <button
              type="button"
              onClick={() => setViewMode('solid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'solid'
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Solid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('xray')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'xray'
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              X-Ray
            </button>
            <button
              type="button"
              onClick={() => setViewMode('exploded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'exploded'
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Exploded
            </button>

            {viewMode === 'exploded' && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={explodedProgress}
                  onChange={(e) => setExplodedProgress(parseFloat(e.target.value))}
                  className="w-20 accent-sky-400 h-1 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Trace Legend Overlay (when mode is Trace or Explore) */}
          {(mode === 'trace' || mode === 'explore') && (
            <TraceLegend
              activeFilter={connectionFilter}
              onSelectFilter={setConnectionFilter}
              counts={connectionCounts}
            />
          )}

          {/* Vision Cursor Overlay (renders crosshair/circle on canvas) */}
          {gestureCursor && (
            <GestureCursorOverlay
              cursorPos={gestureCursor}
              gestureState={gestureState}
              pinchDistanceNormalized={pinchDistance}
              cameraActive={isVisionConnected}
            />
          )}

          {/* Vision Metrics HUD */}
          <VisionMetricsHUD
            metrics={metrics}
            gestureState={gestureState}
            cameraActive={isVisionConnected}
            onToggleClahe={() => visionClient.toggleClahe()}
            onStartCalibration={() => setIsCalibrationOpen(true)}
            onToggleDebugView={() => setDebugViewActive(!debugViewActive)}
            debugViewActive={debugViewActive}
          />
        </div>

        {/* Right Side Panel: Component Detail Card */}
        <ComponentDetailCard
          spec={spec}
          selectedComponentId={selectedComponentId}
          onSelectComponent={setSelectedComponentId}
        />
      </div>

      <footer className="min-h-9 shrink-0 border-t border-slate-800 bg-[#0F172A]/90 px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400">
        <span>AI-generated, conceptual model. Verify critical details.</span>
        <span>{spec.scaleNote}</span>
      </footer>

      {/* Experiment Modal */}
      {spec.experiments && (
        <ExperimentModal
          isOpen={isExperimentOpen}
          experiments={spec.experiments}
          onClose={() => setIsExperimentOpen(false)}
          onApplyExperiment={(exp) => setActiveExperiment(exp)}
        />
      )}

      {/* Assembly Steps Panel */}
      {spec.assemblySteps && (
        <AssemblyStepsPanel
          isOpen={isAssemblyStepsOpen}
          steps={spec.assemblySteps}
          currentStepIndex={currentStepIndex}
          onSelectStepIndex={setCurrentStepIndex}
          onClose={() => setIsAssemblyStepsOpen(false)}
        />
      )}

      {/* Vision Calibration Modal */}
      <CalibrationModal
        isOpen={isCalibrationOpen}
        isConnected={isVisionConnected}
        onClose={() => setIsCalibrationOpen(false)}
        onCalibrationComplete={handleCalibrationComplete}
        currentCursor={rawCursor}
      />

      {/* Camera Debug Overlay */}
      {debugViewActive && (
        <CameraDebugOverlay
          isOpen={debugViewActive}
          onClose={() => setDebugViewActive(false)}
          rawCursor={rawCursor}
          filteredCursor={gestureCursor}
          gestureState={gestureState}
          claheEnabled={Boolean(metrics.claheEnabled)}
          metrics={metrics}
        />
      )}
    </div>
  );
};
