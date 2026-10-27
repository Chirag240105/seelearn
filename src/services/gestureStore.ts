import { GestureState, HandTrackingPacket, VisionMetrics } from '../types/vision';

export interface GestureStoreSnapshot {
  cursor: { x: number; y: number } | null;
  rawCursor: { x: number; y: number } | null;
  gestureState: GestureState;
  rotateMode: boolean;
  pinchDistance: number;
  detected: boolean;
  cameraOn: boolean;
  metrics: VisionMetrics | null;
  hoveredComponentId: string | null;
  hoveredComponentName: string | null;
}

type Listener = () => void;
type LowFreqListener = (data: {
  detected: boolean;
  cameraOn: boolean;
  gestureState: GestureState;
  rotateMode: boolean;
}) => void;

class GestureStore {
  private listeners = new Set<Listener>();
  private lowFreqListeners = new Set<LowFreqListener>();

  public cursor: { x: number; y: number } | null = null;
  public rawCursor: { x: number; y: number } | null = null;
  public gestureState: GestureState = 'IDLE';
  public rotateMode = false;
  public pinchDistance = 1;
  public detected = false;
  public cameraOn = true;
  public metrics: VisionMetrics | null = null;
  public hoveredComponentId: string | null = null;
  public hoveredComponentName: string | null = null;

  // Visual settings for pointer
  public cursorVisible = true;
  public cursorSize: 'small' | 'medium' | 'large' = 'medium';
  public miniMapVisible = true;

  // Throttling for low-frequency React updates (max 4 per second = 250ms)
  private lastLowFreqNotify = 0;
  private lastLowFreqState = {
    detected: false,
    cameraOn: true,
    gestureState: 'IDLE' as GestureState,
    rotateMode: false,
  };
  private lowFreqTimer: ReturnType<typeof setTimeout> | null = null;

  public setCursorVisible(visible: boolean): void {
    this.cursorVisible = visible;
    this.notifyHighFreq();
  }

  public setCursorSize(size: 'small' | 'medium' | 'large'): void {
    this.cursorSize = size;
    this.notifyHighFreq();
  }

  public setMiniMapVisible(visible: boolean): void {
    this.miniMapVisible = visible;
    this.notifyHighFreq();
  }

  public updatePacket(packet: HandTrackingPacket): void {
    if (typeof packet.camera === 'boolean') {
      this.cameraOn = packet.camera;
    }
    this.detected = Boolean(packet.detected);

    if (this.detected && this.cameraOn) {
      this.cursor = packet.cursorNormalized || null;
      this.rawCursor = packet.cursorRaw || packet.cursorNormalized || null;
      this.gestureState = packet.gestureState || 'IDLE';
      this.rotateMode = Boolean(packet.rotateMode);
      this.pinchDistance =
        typeof packet.pinchDistanceNormalized === 'number'
          ? packet.pinchDistanceNormalized
          : 1;
    } else {
      this.cursor = null;
      this.rawCursor = null;
      this.gestureState = 'IDLE';
      this.rotateMode = false;
      this.pinchDistance = 1;
    }

    if (packet.metrics) {
      this.metrics = packet.metrics;
    }

    // High frequency notify (non-React subscribers like RAF loops, DOM ref updaters)
    this.notifyHighFreq();

    // Check low-frequency changes
    this.scheduleLowFreqCheck();
  }

  public setHoveredComponent(id: string | null, name: string | null = null): void {
    if (this.hoveredComponentId === id && this.hoveredComponentName === name) return;
    this.hoveredComponentId = id;
    this.hoveredComponentName = name;
    this.notifyHighFreq();
  }

  public setCameraOn(on: boolean): void {
    this.cameraOn = on;
    this.scheduleLowFreqCheck(true);
  }

  public setDetected(detected: boolean): void {
    this.detected = detected;
    this.scheduleLowFreqCheck(true);
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public subscribeLowFreq(fn: LowFreqListener): () => void {
    this.lowFreqListeners.add(fn);
    fn({
      detected: this.detected,
      cameraOn: this.cameraOn,
      gestureState: this.gestureState,
      rotateMode: this.rotateMode,
    });
    return () => this.lowFreqListeners.delete(fn);
  }

  private notifyHighFreq(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        // Prevent subscriber crash from breaking loop
      }
    });
  }

  private scheduleLowFreqCheck(immediate = false): void {
    const hasChanged =
      this.lastLowFreqState.detected !== this.detected ||
      this.lastLowFreqState.cameraOn !== this.cameraOn ||
      this.lastLowFreqState.gestureState !== this.gestureState ||
      this.lastLowFreqState.rotateMode !== this.rotateMode;

    if (!hasChanged) return;

    const now = performance.now();
    const elapsed = now - this.lastLowFreqNotify;

    if (immediate || elapsed >= 250) {
      if (this.lowFreqTimer) {
        clearTimeout(this.lowFreqTimer);
        this.lowFreqTimer = null;
      }
      this.emitLowFreq();
    } else if (!this.lowFreqTimer) {
      this.lowFreqTimer = setTimeout(() => {
        this.lowFreqTimer = null;
        this.emitLowFreq();
      }, 250 - elapsed);
    }
  }

  private emitLowFreq(): void {
    this.lastLowFreqNotify = performance.now();
    this.lastLowFreqState = {
      detected: this.detected,
      cameraOn: this.cameraOn,
      gestureState: this.gestureState,
      rotateMode: this.rotateMode,
    };
    this.lowFreqListeners.forEach((fn) => {
      try {
        fn(this.lastLowFreqState);
      } catch (err) {
        // ignore
      }
    });
  }
}

export const gestureStore = new GestureStore();
