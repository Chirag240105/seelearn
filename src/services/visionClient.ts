/**
 * SeeLearn Vision WebSocket Client
 * Connects to VITE_VISION_WS_URL and parses real-time hand-gesture packets.
 * 
 * Expected JSON message:
 * {
 *   cursor: { x: number, y: number }, // 0 to 1
 *   state: "IDLE" | "POINTING" | "PINCH_START" | "PINCH_HOLD" | "PINCH_RELEASE" | "PALM_ROTATE",
 *   rotateMode: boolean,
 *   metrics: { fps: number, confidence: number, jitterPx: number, lossEvents: number }
 * }
 * 
 * Auto-reconnects every 2 seconds.
 * If socket is down or URL empty: sets connected = false, UI displays "Gesture offline, using mouse",
 * while mouse/keyboard controls remain fully functional.
 */

import { HandTrackingPacket, GestureState, VisionMetrics } from '../types/vision';

type PacketCallback = (packet: HandTrackingPacket) => void;
type StatusCallback = (isConnected: boolean, statusMessage: string) => void;

export class VisionWebSocketClient {
  private socket: WebSocket | null = null;
  private wsUrl: string = '';
  private reconnectIntervalMs: number = 2000; // 2 seconds reconnect
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private packetListeners: Set<PacketCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private shouldConnect: boolean = true;

  constructor() {
    const rawUrl = (import.meta as any).env?.VITE_VISION_WS_URL;
    this.wsUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
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
      this.isConnected = false;
      this.notifyStatus(false, 'Gesture offline, using mouse');
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.notifyStatus(true, 'OpenCV Vision Connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          const packet = this.parseAndValidateMessage(rawData);
          if (packet) {
            this.packetListeners.forEach((listener) => {
              try {
                listener(packet);
              } catch (err) {
                console.error('[VisionClient] Error in packet listener:', err);
              }
            });
          }
        } catch (parseErr) {
          console.warn('[VisionClient] Received malformed message:', parseErr);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.notifyStatus(false, 'Gesture offline, using mouse');
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        this.isConnected = false;
        this.notifyStatus(false, 'Gesture offline, using mouse');
        this.socket?.close();
      };
    } catch (err) {
      this.isConnected = false;
      this.notifyStatus(false, 'Gesture offline, using mouse');
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.notifyStatus(false, 'Gesture offline, using mouse');
  }

  public sendAction(action: string, payload: Record<string, any> = {}): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ action, ...payload }));
        return true;
      } catch (err) {
        console.warn('[VisionClient] Failed to send action to WebSocket:', err);
      }
    }
    return false;
  }

  public toggleClahe(): void {
    this.sendAction('toggle_clahe');
  }

  public setFilter(mode: 'kalman' | 'one_euro' | 'none'): void {
    this.sendAction('set_filter', { mode });
  }

  public sendCalibrationSamples(samples: [number, number][]): boolean {
    return this.sendAction('calibrate', { samples });
  }

  public onPacket(callback: PacketCallback): () => void {
    this.packetListeners.add(callback);
    return () => this.packetListeners.delete(callback);
  }

  public onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.isConnected, this.isConnected ? 'OpenCV Vision Connected' : 'Gesture offline, using mouse');
    return () => this.statusListeners.delete(callback);
  }

  private notifyStatus(connected: boolean, message: string): void {
    this.statusListeners.forEach((fn) => fn(connected, message));
  }

  private scheduleReconnect(): void {
    if (!this.shouldConnect || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wsUrl && this.shouldConnect) {
        this.connect();
      }
    }, this.reconnectIntervalMs);
  }

  /**
   * Defensive parser ensuring zero crash on missing or unexpected fields
   */
  private parseAndValidateMessage(data: any): HandTrackingPacket | null {
    if (!data || typeof data !== 'object') return null;

    // 1. Extract Cursor coordinates safely [0, 1]
    const rawCursor = data.cursor || data.cursorNormalized || { x: 0.5, y: 0.5 };
    const x = typeof rawCursor.x === 'number' && !isNaN(rawCursor.x)
      ? Math.max(0, Math.min(1, rawCursor.x))
      : 0.5;
    const y = typeof rawCursor.y === 'number' && !isNaN(rawCursor.y)
      ? Math.max(0, Math.min(1, rawCursor.y))
      : 0.5;

    // 2. Extract State safely
    const rawState = String(data.state || data.gestureState || 'IDLE').toUpperCase();
    const validStates: GestureState[] = ['IDLE', 'POINTING', 'PINCH_START', 'PINCH_HOLD', 'PINCH_RELEASE', 'PALM_ROTATE'];
    const gestureState: GestureState = validStates.includes(rawState as GestureState)
      ? (rawState as GestureState)
      : 'IDLE';

    // 3. Extract Rotate Mode
    const rotateMode = Boolean(data.rotateMode === true || data.isOpenPalm === true || gestureState === 'PALM_ROTATE');

    // 4. Extract Metrics safely
    const rawMetrics = data.metrics || {};
    const metrics: VisionMetrics = {
      fps: typeof rawMetrics.fps === 'number' && !isNaN(rawMetrics.fps) ? Math.round(rawMetrics.fps) : 60,
      confidence: typeof rawMetrics.confidence === 'number' && !isNaN(rawMetrics.confidence) ? rawMetrics.confidence : 0.95,
      jitterPx: typeof rawMetrics.jitterPx === 'number' && !isNaN(rawMetrics.jitterPx) ? rawMetrics.jitterPx : 1.2,
      lossEvents: typeof rawMetrics.lossEvents === 'number' && !isNaN(rawMetrics.lossEvents) ? rawMetrics.lossEvents : 0,
      gestureAccuracy: typeof rawMetrics.gestureAccuracy === 'number' ? rawMetrics.gestureAccuracy : 98.4,
      claheEnabled: Boolean(rawMetrics.claheEnabled ?? true),
      filterMode: rawMetrics.filterMode || 'kalman',
    };

    const isPinching = gestureState === 'PINCH_START' || gestureState === 'PINCH_HOLD';

    return {
      timestamp: Date.now(),
      detected: gestureState !== 'IDLE',
      cursorNormalized: { x, y },
      cursorRaw: { x, y },
      gestureState,
      rotateMode,
      isPinching,
      pinchDistanceNormalized: isPinching ? 0.2 : 0.75,
      metrics,
    };
  }
}

export const visionClient = new VisionWebSocketClient();
