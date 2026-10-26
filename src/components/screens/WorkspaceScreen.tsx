import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  AlertTriangle,
  Download,
  RefreshCw,
  Box,
  Cpu,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  Sun,
  Moon,
  X,
  ShieldCheck,
  Compass,
  Info,
  Maximize2,
  Minimize2,
  ChevronLeft,
  FolderOpen,
  CameraOff,
} from 'lucide-react';
import { SceneSpec, ConnectionType, SceneExperiment, SceneComponent } from '../../types/sceneSpec';
import { GestureState, VisionMetrics, HandTrackingPacket, VisionServiceState } from '../../types/vision';
import { GenericSceneCanvas } from '../viewport3d/GenericSceneCanvas';
import { ComponentDetailCard } from '../overlays/ComponentDetailCard';
import { GestureCursorOverlay } from '../overlays/GestureCursorOverlay';
import { TraceLegend } from '../modes/TraceLegend';
import { ExperimentModal } from '../modes/ExperimentModal';
import { AssemblyStepsPanel } from '../modes/AssemblyStepsPanel';
import { CalibrationModal } from '../overlays/CalibrationModal';
import { CameraDebugOverlay } from '../overlays/CameraDebugOverlay';
import { visionClient } from '../../services/visionClient';
import { seeLearnApiClient } from '../../services/awsClient';
import { useTheme } from '../../hooks/useTheme';
import { getAllSamples, getRecentModels, SampleMeta } from '../../data/samples/samplesIndex';

interface WorkspaceScreenProps {
  spec: SceneSpec;
  onBackToPrompt: () => void;
  onSelectSpec?: (spec: SceneSpec) => void;
  onRegenerate?: () => void;
}

export const WorkspaceScreen: React.FC<WorkspaceScreenProps> = ({
  spec,
  onBackToPrompt,
  onSelectSpec,
  onRegenerate,
}) => {
  const { theme, toggleTheme } = useTheme();

  // View & Mode State
  const [viewMode, setViewMode] = useState<'solid' | 'xray' | 'exploded'>('solid');
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [mode, setMode] = useState<'explore' | 'trace' | 'operate' | 'experiment' | 'assembly'>('explore');
  const [explodedProgress, setExplodedProgress] = useState(0);
  const [selectedComponentId, setSelectedComponentId] = useState<string>(spec.components[0]?.id || '');
  const [connectionFilter, setConnectionFilter] = useState<'all' | ConnectionType>('all');

  // Explored components tracking
  const [exploredComponentIds, setExploredComponentIds] = useState<Set<string>>(
    () => new Set(spec.components[0] ? [spec.components[0].id] : [])
  );

  // Dismissible Learning Goals Card
  const [showLearningGoals, setShowLearningGoals] = useState(true);

  // Vision tracking state
  const [isVisionConnected, setIsVisionConnected] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [visionStatusMessage, setVisionStatusMessage] = useState('Vision service not running');
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [visionServiceState, setVisionServiceState] = useState<VisionServiceState | null>(null);
  const [calibrationStatus, setCalibrationStatus] = useState<'pending' | 'success' | 'failure' | null>(null);
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [rotateMode, setRotateMode] = useState<boolean>(false);
  const [gestureCursor, setGestureCursor] = useState<{ x: number; y: number } | null>(null);
  const [rawCursor, setRawCursor] = useState<{ x: number; y: number } | null>(null);
  const [pinchDistance, setPinchDistance] = useState(0.8);
  const [isCameraPillOpen, setIsCameraPillOpen] = useState(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [debugViewActive, setDebugViewActive] = useState(false);

  // Vision metrics
  const [metrics, setMetrics] = useState<VisionMetrics>({
    fps: 0,
    confidence: 0,
    jitterPx: 0,
    lossEvents: 0,
    latencyMs: 0,
  });

  // Modals & Panels
  const [isExperimentOpen, setIsExperimentOpen] = useState(false);
  const [isAssemblyStepsOpen, setIsAssemblyStepsOpen] = useState(false);
  const [isTraceLegendOpen, setIsTraceLegendOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isModelSwitcherOpen, setIsModelSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [activeExperiment, setActiveExperiment] = useState<SceneExperiment | null>(null);

  // Sidebar & Inspector Layout state (supports mobile bottom sheets)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [mobileActiveSheet, setMobileActiveSheet] = useState<'none' | 'tree' | 'inspector'>('none');

  // Track component exploration
  const handleSelectComponent = useCallback((id: string) => {
    setSelectedComponentId(id);
    if (id) {
      setExploredComponentIds((prev) => new Set([...prev, id]));
      setIsInspectorOpen(true);
    }
  }, []);

  const switchMode = useCallback((next: typeof mode) => {
    setMode(next);
    setIsExperimentOpen(next === 'experiment');
    setIsAssemblyStepsOpen(next === 'assembly');
    setIsCalibrationOpen(false);
    setDebugViewActive(false);
    setIsTraceLegendOpen(next === 'trace');
    if (next !== 'experiment') setActiveExperiment(null);
  }, []);

  // When model changes, cleanly reset scene framing and open panels
  useEffect(() => {
    if (spec.components.length > 0) {
      setSelectedComponentId(spec.components[0].id);
      setExploredComponentIds(new Set([spec.components[0].id]));
    }
    setMode('explore');
    setViewMode('solid');
    setExplodedProgress(0);
    setCameraResetToken((v) => v + 1);
    setIsExperimentOpen(false);
    setIsAssemblyStepsOpen(false);
    setIsTraceLegendOpen(false);
    setIsModelSwitcherOpen(false);
    setShowLearningGoals(true);
    setActiveExperiment(null);
  }, [spec]);

  // Connect to Vision service
  useEffect(() => {
    visionClient.connect();

    const unsubStatus = visionClient.onStatusChange((connected, message) => {
      setIsVisionConnected(connected);
      setVisionStatusMessage(message);
      setCameraEnabled(visionClient.getCameraOn());
      if (!connected) {
        setIsHandDetected(false);
        setGestureState('IDLE');
        setRotateMode(false);
      }
    });

    const unsubPacket = visionClient.onPacket((packet: HandTrackingPacket) => {
      if (typeof packet.camera === 'boolean') {
        setCameraEnabled(packet.camera);
      }
      setIsHandDetected(packet.detected);
      if (packet.detected && packet.camera !== false) {
        setGestureCursor(packet.cursorNormalized);
        setRawCursor(packet.cursorRaw || packet.cursorNormalized);
        setGestureState(packet.gestureState);
        setRotateMode(packet.rotateMode);
        setPinchDistance(packet.pinchDistanceNormalized);
      } else {
        setGestureCursor(null);
        setRawCursor(null);
        setGestureState('IDLE');
        setRotateMode(false);
      }
      setMetrics(packet.metrics);
    });

    const unsubState = visionClient.onServiceState((state: VisionServiceState) => {
      setVisionServiceState(state);
      if (typeof state.camera === 'boolean') {
        setCameraEnabled(state.camera);
      }
      if (state.calibrationSuccess !== undefined) {
        setCalibrationStatus(state.calibrationSuccess ? 'success' : 'failure');
      }
    });

    return () => {
      unsubStatus();
      unsubPacket();
      unsubState();
    };
  }, []);

  // Handle keyboard shortcuts (E, T, O, X, R, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'e':
          switchMode('explore');
          break;
        case 't':
          switchMode('trace');
          break;
        case 'o':
          switchMode('operate');
          break;
        case 'x':
          setViewMode((current) => (current === 'xray' ? 'solid' : 'xray'));
          break;
        case 'r':
          setCameraResetToken((v) => v + 1);
          break;
        case 'escape':
          if (isHelpOpen) setIsHelpOpen(false);
          else if (isModelSwitcherOpen) setIsModelSwitcherOpen(false);
          else if (isCameraPillOpen) setIsCameraPillOpen(false);
          else if (isCalibrationOpen) setIsCalibrationOpen(false);
          else if (debugViewActive) setDebugViewActive(false);
          else if (isExperimentOpen) {
            setIsExperimentOpen(false);
            switchMode('explore');
          } else if (isAssemblyStepsOpen) {
            setIsAssemblyStepsOpen(false);
            switchMode('explore');
          } else if (isTraceLegendOpen) {
            setIsTraceLegendOpen(false);
          } else if (mobileActiveSheet !== 'none') {
            setMobileActiveSheet('none');
          } else if (selectedComponentId) {
            setSelectedComponentId('');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    switchMode,
    isHelpOpen,
    isModelSwitcherOpen,
    isCameraPillOpen,
    isCalibrationOpen,
    debugViewActive,
    isExperimentOpen,
    isAssemblyStepsOpen,
    isTraceLegendOpen,
    mobileActiveSheet,
    selectedComponentId,
  ]);

  // Export spec as JSON
  const handleExportJson = () => {
    const cleanJson = JSON.stringify(spec, null, 2);
    const blob = new Blob([cleanJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.topic.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_spec.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Switch camera on/off
  const handleToggleCamera = () => {
    if (cameraEnabled) {
      visionClient.turnCameraOff();
    } else {
      visionClient.turnCameraOn();
    }
  };

  // Switch model handler
  const handleSelectNewModel = (targetSpec: SceneSpec) => {
    setIsModelSwitcherOpen(false);
    onSelectSpec?.(targetSpec);
  };

  // Group components by subsystem
  const subsystemGroups = useMemo(() => {
    const map = new Map<string, SceneComponent[]>();
    spec.components.forEach((c) => {
      const g = c.group || 'Core';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    });
    return Array.from(map.entries());
  }, [spec.components]);

  // Filtered components for sidebar search
  const filteredSubsystemGroups = useMemo(() => {
    if (!sidebarSearch.trim()) return subsystemGroups;
    const query = sidebarSearch.toLowerCase();
    return subsystemGroups
      .map(([group, comps]) => {
        const filtered = comps.filter(
          (c) => c.name.toLowerCase().includes(query) || c.summary.toLowerCase().includes(query)
        );
        return [group, filtered] as [string, SceneComponent[]];
      })
      .filter(([_, comps]) => comps.length > 0);
  }, [subsystemGroups, sidebarSearch]);

  // Connection counts by type
  const connectionCounts = useMemo(() => {
    const counts: Record<ConnectionType, number> = {
      power: 0,
      signal: 0,
      data: 0,
      mechanical: 0,
      thermal: 0,
    };
    (spec.connections || []).forEach((c) => {
      if (counts[c.type] !== undefined) counts[c.type]++;
    });
    return counts;
  }, [spec.connections]);

  // All samples for switcher
  const allSamples = getAllSamples();
  const recentModels = getRecentModels();

  // Camera pill status dot color and label
  const cameraStatusDotColor = !isVisionConnected
    ? 'var(--sl-text-muted)'
    : !cameraEnabled
    ? 'var(--sl-text-muted)'
    : isHandDetected
    ? 'var(--sl-success)'
    : 'var(--sl-warning)';

  const cameraPillLabel = !isVisionConnected
    ? 'Vision service not running'
    : !cameraEnabled
    ? 'Camera off'
    : isHandDetected
    ? 'Camera on'
    : 'Hand not detected';

  // Mode instruction banner text
  const modeInstructionBanner = useMemo(() => {
    switch (mode) {
      case 'explore':
        return 'Explore: Select or click parts to inspect subsystems, mechanics, and connections.';
      case 'trace':
        return 'Trace: Select a part to trace physical wiring, data bus, and power pathways.';
      case 'operate':
        return 'Operate: Observe dynamic mechanical rotation and functional motion.';
      case 'experiment':
        return 'Experiment: Test simulated failure modes and observe degradation.';
      case 'assembly':
        return 'Assembly: Follow step-by-step assembly manual timeline.';
      default:
        return '';
    }
  }, [mode]);

  return (
    <div
      className="screen-enter w-full h-screen flex flex-col overflow-hidden relative select-none"
      style={{
        backgroundColor: 'var(--sl-bg-base)',
        color: 'var(--sl-text-primary)',
        fontFamily: 'var(--sl-font-ui)',
      }}
    >
      {/* ========================================================
          TOP BAR (Step 1 & Step 3)
          ======================================================== */}
      <header
        className="h-14 border-b flex items-center justify-between px-3 sm:px-4 shrink-0 z-30 backdrop-blur-md transition-colors"
        style={{
          backgroundColor: 'var(--sl-bg-surface)',
          borderColor: 'var(--sl-border)',
        }}
      >
        {/* Left: Logo, Breadcrumb, Model Switcher */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold border shrink-0"
            style={{
              backgroundColor: 'var(--sl-accent-muted)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-accent)',
            }}
          >
            SL
          </div>

          {/* Breadcrumb: Library / Model Title */}
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onBackToPrompt}
              className="text-xs font-medium transition cursor-pointer hover:underline shrink-0"
              style={{ color: 'var(--sl-text-secondary)' }}
            >
              Library
            </button>
            <span className="text-xs" style={{ color: 'var(--sl-text-muted)' }}>
              /
            </span>
            <button
              type="button"
              onClick={() => setIsModelSwitcherOpen((v) => !v)}
              className="flex items-center gap-1 text-xs font-bold truncate max-w-[140px] sm:max-w-xs p-1 rounded-md border transition cursor-pointer"
              style={{
                backgroundColor: 'var(--sl-bg-raised)',
                borderColor: 'var(--sl-border-subtle)',
                color: 'var(--sl-text-primary)',
              }}
              title="Click to switch model"
            >
              <span className="truncate">{spec.title}</span>
              <ChevronDown className="w-3 h-3 shrink-0" style={{ color: 'var(--sl-text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Center: Mode Segmented Control (Hidden on narrow mobile, available in floating toolbar) */}
        <div
          className="hidden xl:flex items-center gap-1 p-1 rounded-xl border text-xs font-medium"
          style={{
            backgroundColor: 'var(--sl-bg-base)',
            borderColor: 'var(--sl-border)',
          }}
        >
          {[
            { id: 'explore', label: 'Explore (E)', icon: Box },
            { id: 'trace', label: 'Trace (T)', icon: Layers },
            { id: 'operate', label: 'Operate (O)', icon: Play },
            ...(spec.experiments && spec.experiments.length > 0
              ? [{ id: 'experiment', label: 'Experiment', icon: AlertTriangle }]
              : []),
            ...(spec.assemblySteps && spec.assemblySteps.length > 0
              ? [{ id: 'assembly', label: 'Assembly', icon: Wrench }]
              : []),
          ].map((m) => {
            const Icon = m.icon;
            const isCurrent = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => switchMode(m.id as any)}
                className="px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5"
                style={{
                  backgroundColor: isCurrent ? 'var(--sl-accent)' : 'transparent',
                  color: isCurrent ? '#ffffff' : 'var(--sl-text-secondary)',
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: View mode segmented control, Camera Pill, Theme toggle, Export, Help */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View mode segmented control (Solid / X-ray / Exploded) */}
          <div
            className="hidden md:flex items-center gap-1 p-1 rounded-lg border text-xs"
            style={{ backgroundColor: 'var(--sl-bg-base)', borderColor: 'var(--sl-border)' }}
          >
            <button
              type="button"
              onClick={() => {
                setViewMode('solid');
                setExplodedProgress(0);
              }}
              className="px-2 py-0.5 rounded transition cursor-pointer"
              style={{
                backgroundColor: viewMode === 'solid' && explodedProgress === 0 ? 'var(--sl-bg-surface)' : 'transparent',
                color: viewMode === 'solid' && explodedProgress === 0 ? 'var(--sl-text-primary)' : 'var(--sl-text-muted)',
                fontWeight: viewMode === 'solid' && explodedProgress === 0 ? 600 : 400,
              }}
            >
              Solid
            </button>
            <button
              type="button"
              onClick={() => setViewMode((c) => (c === 'xray' ? 'solid' : 'xray'))}
              className="px-2 py-0.5 rounded transition cursor-pointer"
              style={{
                backgroundColor: viewMode === 'xray' ? 'var(--sl-bg-surface)' : 'transparent',
                color: viewMode === 'xray' ? 'var(--sl-text-primary)' : 'var(--sl-text-muted)',
                fontWeight: viewMode === 'xray' ? 600 : 400,
              }}
            >
              X-ray (X)
            </button>
            <button
              type="button"
              onClick={() => {
                const next = explodedProgress > 0 ? 0 : 1;
                setExplodedProgress(next);
                setViewMode(next > 0 ? 'exploded' : 'solid');
              }}
              className="px-2 py-0.5 rounded transition cursor-pointer"
              style={{
                backgroundColor: explodedProgress > 0 ? 'var(--sl-bg-surface)' : 'transparent',
                color: explodedProgress > 0 ? 'var(--sl-text-primary)' : 'var(--sl-text-muted)',
                fontWeight: explodedProgress > 0 ? 600 : 400,
              }}
            >
              Explode
            </button>
          </div>

          {/* Camera Control Pill (Step 3) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCameraPillOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer"
              style={{
                backgroundColor: 'var(--sl-bg-raised)',
                borderColor: cameraEnabled && isHandDetected ? 'var(--sl-success)' : 'var(--sl-border)',
                color: 'var(--sl-text-primary)',
              }}
              title="Camera gesture controls and OpenCV settings"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: cameraStatusDotColor }}
              />
              <span className="hidden sm:inline font-mono">{cameraPillLabel}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Camera Pill Settings Popover */}
            {isCameraPillOpen && (
              <div
                className="absolute right-0 top-11 w-72 p-3.5 rounded-xl border shadow-2xl z-50 space-y-3 backdrop-blur-xl"
                style={{
                  backgroundColor: 'var(--sl-bg-surface)',
                  borderColor: 'var(--sl-border)',
                  color: 'var(--sl-text-primary)',
                }}
              >
                <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--sl-border-subtle)' }}>
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Camera className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
                    <span>Camera & OpenCV Vision</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCameraPillOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Camera Toggle Button */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Camera Feed</span>
                  <button
                    type="button"
                    onClick={handleToggleCamera}
                    disabled={!isVisionConnected}
                    className="px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer disabled:opacity-40"
                    style={{
                      backgroundColor: cameraEnabled ? 'var(--sl-success-muted)' : 'var(--sl-bg-raised)',
                      borderColor: cameraEnabled ? 'var(--sl-success)' : 'var(--sl-border)',
                      color: cameraEnabled ? 'var(--sl-success)' : 'var(--sl-text-muted)',
                    }}
                  >
                    {cameraEnabled ? 'Turn Off' : 'Turn On'}
                  </button>
                </div>

                {/* CLAHE & Filter controls */}
                <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'var(--sl-border-subtle)' }}>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--sl-text-secondary)' }}>CLAHE Contrast</span>
                    <button
                      type="button"
                      onClick={() => visionClient.toggleClahe()}
                      className="px-2 py-0.5 rounded text-xs border font-mono cursor-pointer"
                      style={{
                        backgroundColor: visionServiceState?.clahe ? 'var(--sl-accent-muted)' : 'transparent',
                        borderColor: 'var(--sl-border)',
                        color: visionServiceState?.clahe ? 'var(--sl-accent)' : 'var(--sl-text-muted)',
                      }}
                    >
                      {visionServiceState?.clahe ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--sl-text-secondary)' }}>Smoothing Filter</span>
                    <select
                      value={visionServiceState?.filter || 'kalman'}
                      onChange={(e) => visionClient.setFilter(e.target.value as any)}
                      className="text-xs rounded border px-2 py-1 font-mono focus:outline-none"
                      style={{
                        backgroundColor: 'var(--sl-bg-raised)',
                        borderColor: 'var(--sl-border)',
                        color: 'var(--sl-text-primary)',
                      }}
                    >
                      <option value="kalman">Kalman</option>
                      <option value="none">None (Raw)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCameraPillOpen(false);
                        setIsCalibrationOpen(true);
                      }}
                      className="w-full py-1.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                      style={{
                        backgroundColor: 'var(--sl-bg-raised)',
                        borderColor: 'var(--sl-border)',
                        color: 'var(--sl-text-primary)',
                      }}
                    >
                      <Compass className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
                      <span>Calibrate Reach Bounds</span>
                    </button>
                  </div>
                </div>

                {/* Live Mini Metrics Row */}
                <div
                  className="p-2 rounded-lg border grid grid-cols-4 gap-1 text-center font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--sl-bg-base)',
                    borderColor: 'var(--sl-border-subtle)',
                  }}
                >
                  <div>
                    <span className="block text-[10px]" style={{ color: 'var(--sl-text-muted)' }}>FPS</span>
                    <span className="font-semibold" style={{ color: 'var(--sl-accent)' }}>{metrics.fps}</span>
                  </div>
                  <div>
                    <span className="block text-[10px]" style={{ color: 'var(--sl-text-muted)' }}>Conf</span>
                    <span className="font-semibold" style={{ color: 'var(--sl-success)' }}>
                      {(metrics.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px]" style={{ color: 'var(--sl-text-muted)' }}>Jitter</span>
                    <span className="font-semibold">±{metrics.jitterPx.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px]" style={{ color: 'var(--sl-text-muted)' }}>Loss</span>
                    <span className="font-semibold" style={{ color: 'var(--sl-warning)' }}>
                      {metrics.lossEvents}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border text-xs transition cursor-pointer"
            style={{
              backgroundColor: 'var(--sl-bg-raised)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-secondary)',
            }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportJson}
            className="p-1.5 rounded-lg border text-xs transition cursor-pointer hidden sm:flex items-center gap-1 font-medium"
            style={{
              backgroundColor: 'var(--sl-bg-raised)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
            title="Download SceneSpec JSON"
          >
            <Download className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
            <span>Export</span>
          </button>

          {/* Help (?) */}
          <button
            type="button"
            onClick={() => setIsHelpOpen((v) => !v)}
            className="p-1.5 rounded-lg border text-xs transition cursor-pointer"
            style={{
              backgroundColor: 'var(--sl-bg-raised)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-secondary)',
            }}
            title="Keyboard shortcuts & Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ========================================================
          MODEL SWITCHER DROPDOWN (Step 4)
          ======================================================== */}
      {isModelSwitcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 p-4 backdrop-blur-sm select-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
          onClick={() => setIsModelSwitcherOpen(false)}
        >
          <div
            className="max-w-xl w-full rounded-2xl border shadow-2xl p-4 space-y-3"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--sl-border-subtle)' }}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <FolderOpen className="w-4 h-4" style={{ color: 'var(--sl-accent)' }} />
                <span>Switch Engineering Model</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModelSwitcherOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* New Topic Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--sl-text-muted)' }} />
              <input
                type="text"
                value={switcherSearch}
                onChange={(e) => setSwitcherSearch(e.target.value)}
                placeholder="Search models or enter new engineering topic..."
                className="w-full border rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none"
                style={{
                  backgroundColor: 'var(--sl-bg-base)',
                  borderColor: 'var(--sl-border)',
                  color: 'var(--sl-text-primary)',
                }}
              />
            </div>

            {/* Recent Models Section */}
            {recentModels.length > 0 && (
              <div>
                <span className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--sl-text-muted)' }}>
                  Recent Session Models
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {recentModels.map((m) => (
                    <button
                      key={`switcher-recent-${m.topic}`}
                      type="button"
                      onClick={() => handleSelectNewModel(m)}
                      className="px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition"
                      style={{
                        backgroundColor: m.topic === spec.topic ? 'var(--sl-accent-muted)' : 'var(--sl-bg-raised)',
                        borderColor: m.topic === spec.topic ? 'var(--sl-accent)' : 'var(--sl-border)',
                        color: m.topic === spec.topic ? 'var(--sl-accent)' : 'var(--sl-text-primary)',
                      }}
                    >
                      {m.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Library Grid */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pt-1">
              <span className="text-xs font-semibold block" style={{ color: 'var(--sl-text-muted)' }}>
                Bundled Library Assemblies
              </span>
              <div className="grid grid-cols-2 gap-2">
                {allSamples
                  .filter(
                    (s) =>
                      !switcherSearch ||
                      s.title.toLowerCase().includes(switcherSearch.toLowerCase()) ||
                      s.topic.toLowerCase().includes(switcherSearch.toLowerCase())
                  )
                  .map((s) => (
                    <button
                      key={`switcher-${s.id}`}
                      type="button"
                      onClick={() => handleSelectNewModel(s.spec)}
                      className="p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between"
                      style={{
                        backgroundColor: s.topic === spec.topic ? 'var(--sl-accent-muted)' : 'var(--sl-bg-raised)',
                        borderColor: s.topic === spec.topic ? 'var(--sl-accent)' : 'var(--sl-border)',
                      }}
                    >
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--sl-text-primary)' }}>
                        {s.title}
                      </div>
                      <div className="text-xs font-mono mt-1 flex items-center justify-between" style={{ color: 'var(--sl-text-muted)' }}>
                        <span>{s.tag}</span>
                        <span>{s.componentCount} parts</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          ONE-LINE INSTRUCTION BANNER (Step 2)
          ======================================================== */}
      <div
        className="px-4 py-1.5 border-b text-xs flex items-center justify-between shrink-0 font-medium"
        style={{
          backgroundColor: 'var(--sl-bg-raised)',
          borderColor: 'var(--sl-border-subtle)',
          color: 'var(--sl-text-secondary)',
        }}
      >
        <span className="truncate">{modeInstructionBanner}</span>
        <span className="hidden sm:inline font-mono text-xs" style={{ color: 'var(--sl-text-muted)' }}>
          {exploredComponentIds.size} of {spec.components.length} explored ({Math.round((exploredComponentIds.size / spec.components.length) * 100)}%)
        </span>
      </div>

      {/* ========================================================
          MAIN WORKSPACE LAYOUT (Sidebar + Center 3D + Inspector)
          ======================================================== */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* --------------------------------------------------------
            LEFT SIDEBAR: Component Tree & Exploration Progress
            -------------------------------------------------------- */}
        <aside
          className={`shrink-0 border-r flex flex-col transition-all duration-200 z-20 ${
            isSidebarOpen ? 'w-64 sm:w-72' : 'w-0 overflow-hidden border-none'
          } ${mobileActiveSheet === 'tree' ? 'fixed inset-y-14 left-0 w-80 z-40 shadow-2xl' : 'hidden lg:flex'}`}
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border)',
          }}
        >
          {/* Sidebar Header & Exploration Progress */}
          <div className="p-3.5 border-b space-y-2.5 shrink-0" style={{ borderColor: 'var(--sl-border-subtle)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sl-text-secondary)' }}>
                Component Tree
              </span>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white lg:block hidden"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Progress Bar: Explored X of Y components */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span style={{ color: 'var(--sl-text-secondary)' }}>
                  Explored {exploredComponentIds.size} of {spec.components.length}
                </span>
                <span style={{ color: 'var(--sl-accent)' }}>
                  {Math.round((exploredComponentIds.size / spec.components.length) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sl-border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(exploredComponentIds.size / spec.components.length) * 100}%`,
                    backgroundColor: 'var(--sl-accent)',
                  }}
                />
              </div>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--sl-text-muted)' }} />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search parts..."
                className="w-full border rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none"
                style={{
                  backgroundColor: 'var(--sl-bg-base)',
                  borderColor: 'var(--sl-border)',
                  color: 'var(--sl-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Subsystem Grouped Tree */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
            {filteredSubsystemGroups.map(([groupName, components]) => (
              <div key={groupName} className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider px-2 py-1" style={{ color: 'var(--sl-text-muted)' }}>
                  {groupName} ({components.length})
                </div>
                <div className="space-y-0.5">
                  {components.map((comp) => {
                    const isSelected = selectedComponentId === comp.id;
                    const isVisited = exploredComponentIds.has(comp.id);

                    return (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() => handleSelectComponent(comp.id)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition cursor-pointer"
                        style={{
                          backgroundColor: isSelected ? 'var(--sl-accent-muted)' : 'transparent',
                          color: isSelected ? 'var(--sl-accent)' : 'var(--sl-text-primary)',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {isVisited ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--sl-success)' }} />
                          ) : (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: 'var(--sl-border)' }}
                            />
                          )}
                          <span className="truncate">{comp.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* --------------------------------------------------------
            CENTER 3D VIEWPORT WITH CORNER OVERLAYS
            -------------------------------------------------------- */}
        <main className="flex-1 min-h-0 relative overflow-hidden">
          {/* Expand Sidebar toggle button (when collapsed) */}
          {!isSidebarOpen && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="absolute top-3 left-3 z-20 p-2 rounded-lg border shadow-md transition cursor-pointer hidden lg:flex items-center gap-1.5 text-xs font-medium"
              style={{
                backgroundColor: 'var(--sl-bg-surface)',
                borderColor: 'var(--sl-border)',
                color: 'var(--sl-text-primary)',
              }}
              title="Expand component tree"
            >
              <Box className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
              <span>Parts Tree</span>
            </button>
          )}

          {/* Dismissible Learning Goals Card (Step 2) */}
          {showLearningGoals && spec.learningObjectives && spec.learningObjectives.length > 0 && (
            <div
              className="absolute top-3 right-3 sm:right-6 z-20 max-w-sm w-[calc(100%-1.5rem)] rounded-xl border p-3.5 shadow-xl backdrop-blur-xl animate-in fade-in"
              style={{
                backgroundColor: 'var(--sl-bg-surface)',
                borderColor: 'var(--sl-border)',
                color: 'var(--sl-text-primary)',
              }}
            >
              <div className="flex items-center justify-between pb-1.5 border-b mb-2" style={{ borderColor: 'var(--sl-border-subtle)' }}>
                <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--sl-accent)' }}>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Learning Objectives</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLearningGoals(false)}
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                  title="Dismiss learning goals"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {spec.overview && (
                <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--sl-text-secondary)' }}>
                  {spec.overview}
                </p>
              )}

              <ul className="space-y-1 text-xs">
                {spec.learningObjectives.slice(0, 3).map((goal, idx) => (
                  <li key={idx} className="flex items-start gap-1.5" style={{ color: 'var(--sl-text-secondary)' }}>
                    <span style={{ color: 'var(--sl-accent)' }}>•</span>
                    <span>{goal}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 3D Canvas */}
          <GenericSceneCanvas
            spec={spec}
            viewMode={viewMode}
            mode={mode}
            explodedProgress={explodedProgress}
            selectedComponentId={selectedComponentId}
            onSelectComponent={handleSelectComponent}
            connectionFilter={connectionFilter}
            activeExperiment={activeExperiment}
            activeAssemblyStepIndex={currentStepIndex}
            gestureCursor={cameraEnabled ? gestureCursor : null}
            gestureState={cameraEnabled ? gestureState : 'IDLE'}
            rotateMode={cameraEnabled && rotateMode}
            detected={cameraEnabled && isHandDetected}
            resetToken={cameraResetToken}
          />

          {/* Gesture Cursor Overlay (Only active when camera is enabled & hand detected) */}
          {cameraEnabled && isHandDetected && gestureCursor && (
            <GestureCursorOverlay
              cursor={gestureCursor}
              gestureState={gestureState}
              rotateMode={rotateMode}
              pinchDistance={pinchDistance}
            />
          )}

          {/* Bottom-Center Floating Toolbar (Rotate, Explode, Connections, Operate, Reset) */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 rounded-xl border shadow-xl backdrop-blur-xl"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
          >
            {/* Rotate toggle */}
            <button
              type="button"
              onClick={() => setRotateMode((v) => !v)}
              className="p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              style={{
                backgroundColor: rotateMode ? 'var(--sl-accent-muted)' : 'var(--sl-bg-raised)',
                borderColor: rotateMode ? 'var(--sl-accent)' : 'var(--sl-border-subtle)',
                color: rotateMode ? 'var(--sl-accent)' : 'var(--sl-text-secondary)',
              }}
              title="Toggle model auto-rotation"
            >
              <Rotate3d className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rotate</span>
            </button>

            {/* Explode toggle */}
            <button
              type="button"
              onClick={() => {
                const next = explodedProgress > 0 ? 0 : 1;
                setExplodedProgress(next);
                setViewMode(next > 0 ? 'exploded' : 'solid');
              }}
              className="p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              style={{
                backgroundColor: explodedProgress > 0 ? 'var(--sl-accent-muted)' : 'var(--sl-bg-raised)',
                borderColor: explodedProgress > 0 ? 'var(--sl-accent)' : 'var(--sl-border-subtle)',
                color: explodedProgress > 0 ? 'var(--sl-accent)' : 'var(--sl-text-secondary)',
              }}
              title="Explode assembly view"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Explode</span>
            </button>

            {/* Connections toggle */}
            <button
              type="button"
              onClick={() => setIsTraceLegendOpen((v) => !v)}
              className="p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              style={{
                backgroundColor: isTraceLegendOpen ? 'var(--sl-accent-muted)' : 'var(--sl-bg-raised)',
                borderColor: isTraceLegendOpen ? 'var(--sl-accent)' : 'var(--sl-border-subtle)',
                color: isTraceLegendOpen ? 'var(--sl-accent)' : 'var(--sl-text-secondary)',
              }}
              title="Toggle connection wiring layer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connections</span>
            </button>

            {/* Operate toggle */}
            <button
              type="button"
              onClick={() => switchMode(mode === 'operate' ? 'explore' : 'operate')}
              className="p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              style={{
                backgroundColor: mode === 'operate' ? 'var(--sl-success-muted)' : 'var(--sl-bg-raised)',
                borderColor: mode === 'operate' ? 'var(--sl-success)' : 'var(--sl-border-subtle)',
                color: mode === 'operate' ? 'var(--sl-success)' : 'var(--sl-text-secondary)',
              }}
              title="Toggle mechanism animation"
            >
              <Play className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Operate</span>
            </button>

            {/* Reset Camera (R) */}
            <button
              type="button"
              onClick={() => setCameraResetToken((v) => v + 1)}
              className="p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              style={{
                backgroundColor: 'var(--sl-bg-raised)',
                borderColor: 'var(--sl-border-subtle)',
                color: 'var(--sl-text-secondary)',
              }}
              title="Reset camera framing (R)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>

          {/* Bottom-Right Small Gesture / FPS Chip */}
          <div
            className="absolute bottom-4 right-4 z-20 px-2.5 py-1 rounded-lg border text-xs font-mono backdrop-blur-md flex items-center gap-2"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-secondary)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: cameraEnabled && isHandDetected ? 'var(--sl-success)' : 'var(--sl-text-muted)',
              }}
            />
            <span>{cameraEnabled ? `${metrics.fps} FPS · ${gestureState}` : 'Mouse Mode'}</span>
          </div>

          {/* Assembly timeline bottom panel */}
          <AssemblyStepsPanel
            isOpen={mode === 'assembly'}
            steps={spec.assemblySteps || []}
            currentStepIndex={currentStepIndex}
            onSelectStepIndex={setCurrentStepIndex}
            onClose={() => switchMode('explore')}
          />

          {/* Trace Legend layer filter */}
          {isTraceLegendOpen && (
            <TraceLegend
              activeFilter={connectionFilter}
              onSelectFilter={setConnectionFilter}
              counts={connectionCounts}
              onClose={() => setIsTraceLegendOpen(false)}
            />
          )}

          {/* Mobile Sheet Buttons */}
          <div className="absolute top-3 right-3 lg:hidden flex items-center gap-1.5 z-20">
            <button
              type="button"
              onClick={() => setMobileActiveSheet(mobileActiveSheet === 'tree' ? 'none' : 'tree')}
              className="p-2 rounded-lg border text-xs font-semibold"
              style={{ backgroundColor: 'var(--sl-bg-surface)', borderColor: 'var(--sl-border)' }}
            >
              Parts
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveSheet(mobileActiveSheet === 'inspector' ? 'none' : 'inspector')}
              className="p-2 rounded-lg border text-xs font-semibold"
              style={{ backgroundColor: 'var(--sl-bg-surface)', borderColor: 'var(--sl-border)' }}
            >
              Inspector
            </button>
          </div>
        </main>

        {/* --------------------------------------------------------
            RIGHT INSPECTOR: Component Detail Card with Tabs & Quiz
            -------------------------------------------------------- */}
        <div
          className={`shrink-0 border-l flex flex-col transition-all duration-200 z-20 ${
            isInspectorOpen ? 'w-80 md:w-96' : 'w-0 overflow-hidden border-none'
          } ${mobileActiveSheet === 'inspector' ? 'fixed inset-y-14 right-0 w-80 z-40 shadow-2xl' : 'hidden lg:flex'}`}
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border)',
          }}
        >
          <ComponentDetailCard
            spec={spec}
            selectedComponentId={selectedComponentId}
            onSelectComponent={handleSelectComponent}
            onClose={() => setIsInspectorOpen(false)}
          />
        </div>
      </div>

      {/* ========================================================
          FOOTER (Step 1)
          ======================================================== */}
      <footer
        className="h-7 px-4 border-t flex items-center justify-between text-xs font-mono shrink-0 select-none"
        style={{
          backgroundColor: 'var(--sl-bg-base)',
          borderColor: 'var(--sl-border-subtle)',
          color: 'var(--sl-text-muted)',
        }}
      >
        <span>AI-generated, conceptual model. Verify critical details.</span>
        <span className="hidden sm:inline">Press ? for shortcuts</span>
      </footer>

      {/* ========================================================
          MODALS & OVERLAYS
          ======================================================== */}
      {/* Help Modal */}
      {isHelpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
          onClick={() => setIsHelpOpen(false)}
        >
          <div
            className="max-w-md w-full rounded-2xl border p-5 shadow-2xl space-y-4"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--sl-border-subtle)' }}>
              <div className="flex items-center gap-2 font-bold text-sm">
                <HelpCircle className="w-4 h-4" style={{ color: 'var(--sl-accent)' }} />
                <span>Keyboard Shortcuts & Controls</span>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--sl-text-muted)' }}>
                Hotkeys
              </div>
              {[
                { key: 'E', desc: 'Explore Mode' },
                { key: 'T', desc: 'Trace Wiring Mode' },
                { key: 'O', desc: 'Operate Mechanism Animation' },
                { key: 'X', desc: 'Toggle X-ray View' },
                { key: 'R', desc: 'Reset Camera Framing' },
                { key: 'Esc', desc: 'Close any panel, popover, or modal' },
              ].map((h) => (
                <div key={h.key} className="flex items-center justify-between p-1.5 rounded" style={{ backgroundColor: 'var(--sl-bg-raised)' }}>
                  <span className="font-mono font-bold px-2 py-0.5 rounded border" style={{ borderColor: 'var(--sl-border)', backgroundColor: 'var(--sl-bg-base)' }}>
                    {h.key}
                  </span>
                  <span style={{ color: 'var(--sl-text-secondary)' }}>{h.desc}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs pt-1 border-t" style={{ borderColor: 'var(--sl-border-subtle)', color: 'var(--sl-text-secondary)' }}>
              <span className="font-semibold block mb-1" style={{ color: 'var(--sl-text-muted)' }}>
                Hand Gestures (OpenCV)
              </span>
              <p>• Point with index finger to move 3D cursor</p>
              <p>• Pinch thumb + index to select a component</p>
              <p>• Open palm for 0.5s to toggle rotation mode</p>
            </div>
          </div>
        </div>
      )}

      {/* Failure Experiment Lab Modal */}
      {isExperimentOpen && spec.experiments && (
        <ExperimentModal
          isOpen={isExperimentOpen}
          experiments={spec.experiments}
          onClose={() => {
            setIsExperimentOpen(false);
            switchMode('explore');
          }}
          onApplyExperiment={setActiveExperiment}
        />
      )}

      {/* Reach Bounds Calibration Modal */}
      {isCalibrationOpen && (
        <CalibrationModal
          isOpen={isCalibrationOpen}
          isConnected={isVisionConnected}
          isHandDetected={isHandDetected}
          currentCursor={rawCursor}
          calibrationStatus={calibrationStatus}
          onCalibrationComplete={(samples) => {
            setCalibrationStatus('pending');
            const sent = visionClient.sendCalibrationSamples(samples);
            if (!sent) setCalibrationStatus('failure');
            return sent;
          }}
          onClose={() => setIsCalibrationOpen(false)}
        />
      )}
    </div>
  );
};
