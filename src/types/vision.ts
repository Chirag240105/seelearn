/**
 * SeeLearn Vision Service Types & Protocol Definitions
 */

export type GestureState = 
  | 'IDLE'
  | 'POINTING'
  | 'PINCH_START'
  | 'PINCH_HOLD'
  | 'PINCH_RELEASE'
  | 'PALM_ROTATE';

export interface VisionMetrics {
  fps: number;
  confidence: number;
  jitterPx: number; // Pixels standard deviation when stationary
  lossEvents: number;
  gestureAccuracy?: number;
  captureLatencyMs?: number;
  preprocessLatencyMs?: number;
  trackingLatencyMs?: number;
  claheEnabled?: boolean;
  filterMode?: 'kalman' | 'one_euro' | 'none';
}

/**
 * Exact specification message from OpenCV Python Service over WebSocket
 */
export interface VisionWebSocketMessage {
  cursor: { x: number; y: number }; // 0 to 1
  state: GestureState;
  rotateMode: boolean;
  metrics: {
    fps: number;
    confidence: number;
    jitterPx: number;
    lossEvents: number;
  };
}

export interface HandTrackingPacket {
  timestamp: number;
  detected: boolean;
  cursorNormalized: { x: number; y: number }; // [0, 1] mapped to viewport
  cursorRaw?: { x: number; y: number };
  gestureState: GestureState;
  rotateMode: boolean;
  pinchDistanceNormalized?: number;
  isPinching: boolean;
  isOpenPalm?: boolean;
  metrics: VisionMetrics;
}

export interface CalibrationRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
