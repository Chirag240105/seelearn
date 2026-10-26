import { HandTrackingPacket, VisionServiceState } from '../types/vision';

type PacketCallback = (packet: HandTrackingPacket) => void;
type StatusCallback = (isConnected: boolean, statusMessage: string) => void;
type StateCallback = (state: VisionServiceState) => void;

export class VisionWebSocketClient {
  private socket: WebSocket | null = null;
  private readonly wsUrl: string;
  private readonly minReconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 8000;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private cameraOn = true;
  private hasDetectedHand = false;
  private shouldConnect = false;
  private packetListeners = new Set<PacketCallback>();
  private statusListeners = new Set<StatusCallback>();
  private stateListeners = new Set<StateCallback>();

  constructor() {
    const rawUrl = (import.meta as any).env?.VITE_VISION_WS_URL;
    this.wsUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        try {
          this.sendAction('camera_off');
        } catch {
          // ignore
        }
      });
    }
  }

  public getUrl(): string {
    return this.wsUrl;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public connect(): void {
    this.shouldConnect = true;
    if (!this.wsUrl) {
      this.updateStatus();
      return;
    }
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      const socket = new WebSocket(this.wsUrl);
      this.socket = socket;
      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.isConnected = true;
        this.hasDetectedHand = false;
        this.reconnectAttempts = 0;
        this.updateStatus();
        this.sendAction('get_state');
      };
      socket.onmessage = (event) => {
        if (this.socket === socket) this.handleMessage(event.data);
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.isConnected = false;
        this.hasDetectedHand = false;
        this.updateStatus();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.warn('[VisionClient] WebSocket connection failed:', error);
      this.isConnected = false;
      this.updateStatus();
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.isConnected = false;
    this.hasDetectedHand = false;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    this.updateStatus();
  }

  public sendAction(action: string, payload: Record<string, unknown> = {}): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify({ action, ...payload }));
      return true;
    } catch (error) {
      console.warn('[VisionClient] Failed to send action:', error);
      return false;
    }
  }

  public turnCameraOn(): boolean {
    return this.sendAction('camera_on');
  }

  public turnCameraOff(): boolean {
    return this.sendAction('camera_off');
  }

  public getCameraOn(): boolean {
    return this.cameraOn;
  }

  public toggleClahe(): boolean {
    return this.sendAction('toggle_clahe');
  }

  public setFilter(value: 'kalman' | 'none'): boolean {
    return this.sendAction('set_filter', { value });
  }

  public sendCalibrationSamples(samples: [number, number][]): boolean {
    return this.sendAction('calibrate', { samples });
  }

  public onPacket(callback: PacketCallback): () => void {
    this.packetListeners.add(callback);
    return () => this.packetListeners.delete(callback);
  }

  public onServiceState(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  public onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.isConnected, this.statusMessage());
    return () => this.statusListeners.delete(callback);
  }

  private handleMessage(payload: unknown): void {
    try {
      const data = JSON.parse(String(payload));
      if (data?.type === 'state' && typeof data.clahe === 'boolean' &&
          (data.filter === 'kalman' || data.filter === 'none') && typeof data.calibrated === 'boolean') {
        if (typeof data.camera === 'boolean') {
          this.cameraOn = data.camera;
          this.updateStatus();
        }
        this.stateListeners.forEach((listener) => listener(data as VisionServiceState));
        return;
      }
      if (!data || typeof data !== 'object') return;

      if (typeof data.camera === 'boolean' && data.camera !== this.cameraOn) {
        this.cameraOn = data.camera;
        this.updateStatus();
      }

      if (typeof data.detected !== 'boolean' ||
          !data.cursorNormalized || typeof data.cursorNormalized.x !== 'number' ||
          typeof data.cursorNormalized.y !== 'number') return;

      const validStates = ['IDLE', 'POINTING', 'PINCH_START', 'PINCH_HOLD', 'PINCH_RELEASE', 'PALM_ROTATE'];
      const gestureState = validStates.includes(data.gestureState) ? data.gestureState : 'IDLE';
      const rawMetrics = data.metrics || {};
      const packet: HandTrackingPacket = {
        camera: typeof data.camera === 'boolean' ? data.camera : this.cameraOn,
        cameraError: data.cameraError,
        detected: data.detected && this.cameraOn,
        cursorNormalized: {
          x: Math.max(0, Math.min(1, data.cursorNormalized.x)),
          y: Math.max(0, Math.min(1, data.cursorNormalized.y)),
        },
        cursorRaw: data.cursorRaw && typeof data.cursorRaw.x === 'number' && typeof data.cursorRaw.y === 'number'
          ? data.cursorRaw
          : data.cursorNormalized,
        gestureState: this.cameraOn ? gestureState : 'IDLE',
        isOpenPalm: this.cameraOn && data.isOpenPalm === true,
        rotateMode: this.cameraOn && data.rotateMode === true,
        pinchDistanceNormalized: typeof data.pinchDistanceNormalized === 'number' ? data.pinchDistanceNormalized : 1,
        metrics: {
          fps: this.numberOrZero(rawMetrics.fps),
          confidence: this.numberOrZero(rawMetrics.confidence),
          jitterPx: this.numberOrZero(rawMetrics.jitterPx),
          lossEvents: this.numberOrZero(rawMetrics.lossEvents),
          latencyMs: this.numberOrZero(rawMetrics.latencyMs),
        },
      };
      this.hasDetectedHand = packet.detected;
      this.updateStatus();
      this.packetListeners.forEach((listener) => listener(packet));
    } catch (error) {
      console.warn('[VisionClient] Received malformed message:', error);
    }
  }

  private numberOrZero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private statusMessage(): string {
    if (!this.isConnected) return 'Vision service not running';
    if (!this.cameraOn) return 'Camera off';
    return this.hasDetectedHand ? 'Camera on' : 'Hand not detected';
  }

  private updateStatus(): void {
    this.statusListeners.forEach((listener) => listener(this.isConnected, this.statusMessage()));
  }

  private scheduleReconnect(): void {
    if (!this.shouldConnect || this.reconnectTimer || !this.wsUrl) return;
    const delay = Math.min(this.minReconnectDelayMs * (2 ** this.reconnectAttempts), this.maxReconnectDelayMs);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldConnect) this.connect();
    }, delay);
  }
}

export const visionClient = new VisionWebSocketClient();
