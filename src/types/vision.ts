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
  jitterPx: number;
  lossEvents: number;
  latencyMs: number;
}

/** Hand-tracking frame sent by the Python vision service. */
export interface VisionWebSocketMessage {
  camera?: boolean;
  cameraError?: string;
  detected: boolean;
  cursorNormalized: { x: number; y: number };
  cursorRaw: { x: number; y: number };
  gestureState: GestureState;
  isOpenPalm: boolean;
  rotateMode: boolean;
  pinchDistanceNormalized: number;
  metrics: VisionMetrics;
}

export interface VisionServiceState {
  type: 'state';
  camera?: boolean;
  cameraError?: string;
  clahe: boolean;
  filter: 'kalman' | 'none';
  calibrated: boolean;
  calibrationSuccess?: boolean;
}

export interface HandTrackingPacket extends VisionWebSocketMessage {}

export interface CalibrationRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
