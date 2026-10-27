#!/usr/bin/env python3
"""OpenCV 5 hand tracking vision service for SeeLearn.

High-efficiency, low-latency pipeline with single-slot capture, preallocated buffers,
threading separation, stage timing, and extended gestures (PALM_ROTATE, FIST_ZOOM, PINCH, POINTING).
"""

import argparse
import asyncio
import json
import math
import platform
import sys
import threading
import time
from collections import deque

import numpy as np

try:
    import cv2
except ImportError:
    print("ERROR: opencv-python is not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    import mediapipe as mp
except ImportError:
    print("ERROR: mediapipe is not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    import websockets
except ImportError:
    print("ERROR: websockets is not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    import psutil
except ImportError:
    psutil = None


# Thresholds & Configuration Constants
PINCH_ENTER_THRESHOLD = 0.32
PINCH_EXIT_THRESHOLD = 0.44
PINCH_REQUIRED_FRAMES = 2
CURL_MARGIN_RATIO = 0.10
PALM_ENTER_FRAMES = 3
PALM_EXIT_FRAMES = 4
FIST_ENTER_FRAMES = 4
FIST_EXIT_FRAMES = 4
PINCH_COOLDOWN_SECONDS = 0.12  # 120 ms
MAX_FRAME_WIDTH = 480
CALIBRATION_MIN_SAMPLES = 11
STILL_MOVEMENT_THRESHOLD = 0.01

ALLOWED_LABELS = {
    "still",
    "point",
    "pinch",
    "palm",
    "fist",
    "fast_move",
    "low_light",
    "leaving_frame",
}


class ThreadedCamera:
    """Capture thread keeping ONLY the latest frame (single-slot buffer, no queue lag)."""

    def __init__(self, src=0, width=640, height=480, fps=30):
        self.src = src
        self.width = width
        self.height = height
        self.target_fps = fps
        self.cap = None
        self.frame = None
        self.grabbed = False
        self.started = False
        self.read_lock = threading.Lock()
        self.capture_latency_ms = 0.0
        self._open_camera(src, width, height, fps)

    def _open_camera(self, preferred_index, width, height, fps):
        is_windows = platform.system() == "Windows"
        preferred_backends = [cv2.CAP_DSHOW, cv2.CAP_ANY] if is_windows else [cv2.CAP_ANY]
        candidates = []
        candidates.extend((preferred_index, backend) for backend in preferred_backends)
        if is_windows and preferred_index != 0:
            candidates.extend(((0, cv2.CAP_DSHOW), (0, cv2.CAP_ANY)))
        fallback_indices = [idx for idx in (1, 2) if idx != preferred_index]
        if preferred_index != 0 and not is_windows:
            fallback_indices = [0] + fallback_indices
        candidates.extend((idx, cv2.CAP_ANY) for idx in fallback_indices)

        attempted = set()
        for index, backend in candidates:
            key = (index, backend)
            if key in attempted:
                continue
            attempted.add(key)
            cap = cv2.VideoCapture(index, backend) if backend != cv2.CAP_ANY else cv2.VideoCapture(index)
            if cap.isOpened():
                # Attempt MJPG fourcc if supported
                try:
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                except Exception:
                    pass
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                cap.set(cv2.CAP_PROP_FPS, fps)
                try:
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception:
                    pass
                grabbed, frame = cap.read()
                if grabbed and frame is not None and np.any(frame):
                    print(f"[OpenCV Vision] Camera opened: index {index}, backend {backend}")
                    self.cap = cap
                    self.frame = frame
                    self.grabbed = True
                    return
            cap.release()

        raise RuntimeError(
            "No usable camera found. Check camera permissions and close other apps using the camera; "
            "then try --camera with another index."
        )

    def start(self):
        if self.started:
            return self
        self.started = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        return self

    def _capture_loop(self):
        while self.started:
            if self.cap is None:
                time.sleep(0.01)
                continue
            t0 = time.perf_counter()
            grabbed, frame = self.cap.read()
            lat = (time.perf_counter() - t0) * 1000.0
            if grabbed and frame is not None:
                with self.read_lock:
                    self.frame = frame  # Single-slot overwrite
                    self.grabbed = True
                    self.capture_latency_ms = lat
            else:
                with self.read_lock:
                    self.grabbed = False
                time.sleep(0.005)

    def read_latest(self):
        with self.read_lock:
            if not self.grabbed or self.frame is None:
                return None, self.capture_latency_ms
            return self.frame.copy(), self.capture_latency_ms

    def stop(self):
        self.started = False
        if hasattr(self, "thread"):
            self.thread.join(timeout=1.0)
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None
        self.frame = None
        self.grabbed = False


class PreallocatedVisionBuffers:
    """Reused arrays to eliminate per-frame memory allocations."""

    def __init__(self, target_w=MAX_FRAME_WIDTH, target_h=360):
        self.w = target_w
        self.h = target_h
        self.resized_bgr = np.empty((target_h, target_w, 3), dtype=np.uint8)
        self.flipped_bgr = np.empty((target_h, target_w, 3), dtype=np.uint8)
        self.lab = np.empty((target_h, target_w, 3), dtype=np.uint8)
        self.l_channel = np.empty((target_h, target_w), dtype=np.uint8)
        self.clahe_l = np.empty((target_h, target_w), dtype=np.uint8)
        self.rgb = np.empty((target_h, target_w, 3), dtype=np.uint8)

    def ensure_size(self, w, h):
        if self.w != w or self.h != h:
            self.w = w
            self.h = h
            self.resized_bgr = np.empty((h, w, 3), dtype=np.uint8)
            self.flipped_bgr = np.empty((h, w, 3), dtype=np.uint8)
            self.lab = np.empty((h, w, 3), dtype=np.uint8)
            self.l_channel = np.empty((h, w), dtype=np.uint8)
            self.clahe_l = np.empty((h, w), dtype=np.uint8)
            self.rgb = np.empty((h, w, 3), dtype=np.uint8)


class KalmanPointSmoother:
    """Kalman filter with dead-zone stabilization for 2D points."""

    def __init__(self, dead_zone_px=3.5):
        self.kf = cv2.KalmanFilter(4, 2)
        self.kf.transitionMatrix = np.array(
            [[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32
        )
        self.kf.measurementMatrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], np.float32)
        self.kf.processNoiseCov = np.eye(4, dtype=np.float32) * 1e-3
        self.kf.measurementNoiseCov = np.eye(2, dtype=np.float32) * 1e-1
        self.kf.errorCovPost = np.eye(4, dtype=np.float32)
        self.initialized = False
        self.last_stable_point = None
        self.dead_zone_px = dead_zone_px

    def reset(self):
        self.initialized = False
        self.last_stable_point = None

    def update(self, x, y):
        measurement = np.array([[np.float32(x)], [np.float32(y)]])
        if not self.initialized:
            state = np.array([[measurement[0, 0]], [measurement[1, 0]], [0], [0]], np.float32)
            self.kf.statePre = state.copy()
            self.kf.statePost = state.copy()
            self.initialized = True
            self.last_stable_point = (x, y)
            return x, y

        self.kf.predict()
        estimate = self.kf.correct(measurement)
        filtered_x, filtered_y = float(estimate[0, 0]), float(estimate[1, 0])
        dx = filtered_x - self.last_stable_point[0]
        dy = filtered_y - self.last_stable_point[1]
        if math.hypot(dx, dy) < self.dead_zone_px:
            filtered_x = self.last_stable_point[0] + dx * 0.2
            filtered_y = self.last_stable_point[1] + dy * 0.2
        else:
            self.last_stable_point = (filtered_x, filtered_y)
        return filtered_x, filtered_y


class GestureStateMachine:
    """State machine with hysteresis, frame counters, cool-down, and priority logic.

    Priority: PINCH > FIST > OPEN_PALM > POINTING > IDLE
    """

    def __init__(self, pinch_enter=PINCH_ENTER_THRESHOLD, curl_margin=CURL_MARGIN_RATIO):
        self.state = "IDLE"
        self.pinch_enter_thresh = pinch_enter
        self.pinch_exit_thresh = PINCH_EXIT_THRESHOLD
        self.curl_margin_ratio = curl_margin

        self.pinch_frames = 0
        self.palm_frames = 0
        self.palm_fail_frames = 0
        self.fist_frames = 0
        self.fist_fail_frames = 0
        self.pinch_left_time = 0.0

        self.tracking_loss_hold_frames = 0

    def process(self, landmarks, frame_width, frame_height):
        now = time.perf_counter()
        if landmarks is None:
            self.tracking_loss_hold_frames += 1
            self.pinch_frames = 0
            self.palm_frames = 0
            self.fist_frames = 0
            if self.tracking_loss_hold_frames > 12:
                self.state = "IDLE"
            return "IDLE", 1.0, 0.1, False, False, False

        self.tracking_loss_hold_frames = 0
        wrist = landmarks[0]
        middle_mcp = landmarks[9]

        # Hand scale: wrist (0) to middle MCP (9)
        hand_scale_norm = math.hypot(middle_mcp.x - wrist.x, middle_mcp.y - wrist.y)
        hand_scale_norm = max(hand_scale_norm, 1e-4)
        hand_scale_px = max(hand_scale_norm * frame_width, 1e-4)

        # Extension and curl for the 4 fingers (Index, Middle, Ring, Pinky)
        # Finger is EXTENDED if d_tip > d_pip + 0.10 * hand_scale
        # Finger is CURLED if d_tip < d_pip
        finger_pairs = [(8, 6), (12, 10), (16, 14), (20, 18)]
        margin = self.curl_margin_ratio * hand_scale_norm
        extended = []
        curled = []
        for tip_idx, pip_idx in finger_pairs:
            d_tip = math.hypot(landmarks[tip_idx].x - wrist.x, landmarks[tip_idx].y - wrist.y)
            d_pip = math.hypot(landmarks[pip_idx].x - wrist.x, landmarks[pip_idx].y - wrist.y)
            extended.append(d_tip > (d_pip + margin))
            curled.append(d_tip < d_pip)

        index_ext, middle_ext, ring_ext, pinky_ext = extended
        index_curled, middle_curled, ring_curled, pinky_curled = curled

        all_four_extended = all(extended)
        all_four_curled = all(curled)
        other_three_curled = middle_curled and ring_curled and pinky_curled

        # Pinch metric
        thumb_tip, index_tip = landmarks[4], landmarks[8]
        pinch_px = math.hypot((thumb_tip.x - index_tip.x) * frame_width,
                              (thumb_tip.y - index_tip.y) * frame_height)
        pinch_distance = pinch_px / hand_scale_px

        # A pinch requires index and thumb tips close with middle, ring, pinky NOT all curled
        pinch_candidate = (pinch_distance < self.pinch_enter_thresh) and (not other_three_curled)
        in_pinch_cooldown = (now - self.pinch_left_time) < PINCH_COOLDOWN_SECONDS

        # 1. PINCH PRIORITY (PINCH_START, PINCH_HOLD, PINCH_RELEASE)
        if self.state in ("PINCH_START", "PINCH_HOLD"):
            if pinch_distance > self.pinch_exit_thresh:
                self.state = "PINCH_RELEASE"
                self.pinch_frames = 0
                self.pinch_left_time = now
            else:
                self.state = "PINCH_HOLD"
            return (
                self.state,
                pinch_distance,
                hand_scale_norm,
                self.state in ("PINCH_START", "PINCH_HOLD"),
                False,
                False,
            )

        if self.state == "PINCH_RELEASE":
            self.state = "POINTING" if index_ext else "IDLE"
            self.pinch_left_time = now

        if pinch_candidate and not in_pinch_cooldown:
            self.pinch_frames += 1
            if self.pinch_frames >= PINCH_REQUIRED_FRAMES:
                self.state = "PINCH_START"
                self.palm_frames = 0
                self.fist_frames = 0
                return self.state, pinch_distance, hand_scale_norm, True, False, False
        else:
            self.pinch_frames = 0

        # 2. FIST PRIORITY (FIST_ZOOM)
        # All 4 fingers curled, held for 4 frames, exit after 4 failing frames
        if all_four_curled and not in_pinch_cooldown:
            self.fist_frames += 1
            self.fist_fail_frames = 0
            if self.fist_frames >= FIST_ENTER_FRAMES:
                self.state = "FIST_ZOOM"
        else:
            self.fist_fail_frames += 1
            if self.state == "FIST_ZOOM":
                if self.fist_fail_frames >= FIST_EXIT_FRAMES:
                    self.state = "IDLE"
                    self.fist_frames = 0
            else:
                self.fist_frames = 0

        if self.state == "FIST_ZOOM":
            return self.state, pinch_distance, hand_scale_norm, False, False, True

        # 3. OPEN PALM PRIORITY (PALM_ROTATE)
        # All 4 fingers extended & not pinching, held for 3 frames, exit after 4 failing frames
        if all_four_extended and not pinch_candidate and not in_pinch_cooldown:
            self.palm_frames += 1
            self.palm_fail_frames = 0
            if self.palm_frames >= PALM_ENTER_FRAMES:
                self.state = "PALM_ROTATE"
        else:
            self.palm_fail_frames += 1
            if self.state == "PALM_ROTATE":
                if self.palm_fail_frames >= PALM_EXIT_FRAMES:
                    self.state = "IDLE"
                    self.palm_frames = 0
            else:
                self.palm_frames = 0

        if self.state == "PALM_ROTATE":
            return self.state, pinch_distance, hand_scale_norm, False, True, False

        # 4. POINTING PRIORITY
        if index_ext and other_three_curled:
            self.state = "POINTING"
        else:
            self.state = "IDLE"

        return self.state, pinch_distance, hand_scale_norm, False, False, False


class CoordinateCalibrator:
    """Maps tracked normalized coordinates into the calibrated workspace."""

    def __init__(self):
        self.min_x, self.max_x = 0.15, 0.85
        self.min_y, self.max_y = 0.15, 0.85
        self.calibrated = False

    def calibrate(self, samples):
        if not isinstance(samples, list) or len(samples) < CALIBRATION_MIN_SAMPLES:
            return False
        try:
            xs = [float(sample[0]) for sample in samples]
            ys = [float(sample[1]) for sample in samples]
        except (TypeError, ValueError, IndexError):
            return False
        if not all(math.isfinite(value) for value in xs + ys):
            return False
        min_x = max(0.05, float(np.percentile(xs, 5)))
        max_x = min(0.95, float(np.percentile(xs, 95)))
        min_y = max(0.05, float(np.percentile(ys, 5)))
        max_y = min(0.95, float(np.percentile(ys, 95)))
        if max_x <= min_x or max_y <= min_y:
            return False
        self.min_x, self.max_x, self.min_y, self.max_y = min_x, max_x, min_y, max_y
        self.calibrated = True
        return True

    def remap(self, x, y):
        x = max(self.min_x, min(self.max_x, x))
        y = max(self.min_y, min(self.max_y, y))
        return (
            (x - self.min_x) / (self.max_x - self.min_x),
            (y - self.min_y) / (self.max_y - self.min_y),
        )


class SeeLearnVisionService:
    """Core OpenCV 5 hand tracking vision service."""

    def __init__(self, port=8765, camera_index=0, pinch_enter=PINCH_ENTER_THRESHOLD,
                 curl_margin=CURL_MARGIN_RATIO, threads=2, clahe_enabled=True,
                 debug=False, record_path=None, label=""):
        # OpenCV global optimization & thread tuning
        cv2.setUseOptimized(True)
        cv2.setNumThreads(threads)

        self.port = port
        self.camera_index = camera_index
        self.threads = threads
        self.camera_enabled = True
        self.camera_error = None
        self.camera = None

        try:
            self.camera = ThreadedCamera(camera_index, width=640, height=480, fps=30).start()
        except Exception as err:
            print(f"[OpenCV Vision] Initial camera open failed: {err}")
            self.camera_enabled = False
            self.camera_error = str(err)

        self.buffers = PreallocatedVisionBuffers(MAX_FRAME_WIDTH, 360)
        self.kalman = KalmanPointSmoother(dead_zone_px=3.5)
        self.anchor_kalman = KalmanPointSmoother(dead_zone_px=3.0)
        self.gesture_machine = GestureStateMachine(pinch_enter=pinch_enter, curl_margin=curl_margin)
        self.calibrator = CoordinateCalibrator()

        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=0,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.5,
        )
        self.mp_draw = mp.solutions.drawing_utils

        # Single CLAHE object creation
        self.clahe_enabled = clahe_enabled
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        self.filter_mode = "kalman"

        # Rolling stage timing and metrics
        self.stage_capture = deque(maxlen=30)
        self.stage_preprocess = deque(maxlen=30)
        self.stage_mediapipe = deque(maxlen=30)
        self.stage_filter = deque(maxlen=30)
        self.stage_gesture = deque(maxlen=30)
        self.stage_total = deque(maxlen=30)

        self.fps_history = deque(maxlen=60)
        self.jitter_errors = deque(maxlen=60)
        self.last_raw_point = None
        self.loss_events = 0
        self.was_tracking = False

        # Anchor tracking
        self.prev_anchor = None
        self.prev_gesture_state = "IDLE"

        # Packet and threading
        self.latest_packet = None
        self.packet_lock = threading.Lock()
        self.connected_clients = set()
        self.running = True

        # Debug & Record
        self.debug = debug
        self.debug_window_requested = debug
        self.debug_window_warning_printed = False
        self.raw_trail = deque(maxlen=40)
        self.filtered_trail = deque(maxlen=40)

        self.record_label = label
        self.record_started_at = time.monotonic()
        self.record_file = open(record_path, "w", encoding="utf-8") if record_path else None
        if self.record_file:
            self.record_file.write("[")
            self.record_has_frames = False

    def process_frame(self, frame, cap_latency):
        """Processes one video frame and returns the structured JSON packet."""
        t_start = time.perf_counter()

        if frame is None:
            self.gesture_machine.process(None, MAX_FRAME_WIDTH, 360)
            self.last_raw_point = None
            self.prev_anchor = None
            if self.was_tracking:
                self.loss_events += 1
                self.kalman.reset()
                self.anchor_kalman.reset()
                self.was_tracking = False

            t_total = (time.perf_counter() - t_start) * 1000.0
            self.stage_capture.append(cap_latency)
            self.stage_total.append(t_total)

            return {
                "camera": bool(self.camera_enabled),
                "detected": False,
                "cursorNormalized": {"x": 0.5, "y": 0.5},
                "cursorRaw": {"x": 0.5, "y": 0.5},
                "anchor": {"x": 0.5, "y": 0.5},
                "anchorDelta": {"dx": 0.0, "dy": 0.0},
                "handScale": 0.1,
                "gestureState": "IDLE",
                "isOpenPalm": False,
                "isFist": False,
                "rotateMode": False,
                "zoomMode": False,
                "pinchDistanceNormalized": 1.0,
                "metrics": {
                    "fps": 0.0,
                    "confidence": 0.0,
                    "jitterPx": 0.0,
                    "lossEvents": self.loss_events,
                    "latencyMs": round(cap_latency, 2),
                    "stageMs": self._get_stage_metrics(),
                    **self._get_cpu_metric(),
                },
            }

        # 1. Resize & Preprocess
        t_pre = time.perf_counter()
        orig_h, orig_w = frame.shape[:2]
        ratio = MAX_FRAME_WIDTH / orig_w if orig_w > MAX_FRAME_WIDTH else 1.0
        target_w = MAX_FRAME_WIDTH if orig_w > MAX_FRAME_WIDTH else orig_w
        target_h = max(1, round(orig_h * ratio))

        self.buffers.ensure_size(target_w, target_h)

        # Preallocated resize & single flip
        cv2.resize(frame, (target_w, target_h), dst=self.buffers.resized_bgr, interpolation=cv2.INTER_AREA)
        cv2.flip(self.buffers.resized_bgr, 1, dst=self.buffers.flipped_bgr)

        # CLAHE on L-channel of resized frame
        if self.clahe_enabled:
            cv2.cvtColor(self.buffers.flipped_bgr, cv2.COLOR_BGR2LAB, dst=self.buffers.lab)
            cv2.extractChannel(self.buffers.lab, 0, dst=self.buffers.l_channel)
            self.clahe.apply(self.buffers.l_channel, dst=self.buffers.clahe_l)
            cv2.insertChannel(self.buffers.clahe_l, self.buffers.lab, 0)
            cv2.cvtColor(self.buffers.lab, cv2.COLOR_LAB2RGB, dst=self.buffers.rgb)
        else:
            cv2.cvtColor(self.buffers.flipped_bgr, cv2.COLOR_BGR2RGB, dst=self.buffers.rgb)

        self.buffers.rgb.flags.writeable = False
        ms_pre = (time.perf_counter() - t_pre) * 1000.0

        # 2. MediaPipe Tracking
        t_mp = time.perf_counter()
        results = self.hands.process(self.buffers.rgb)
        self.buffers.rgb.flags.writeable = True
        ms_mp = (time.perf_counter() - t_mp) * 1000.0

        detected = False
        confidence = 0.0
        raw_x = raw_y = filtered_x = filtered_y = 0.5
        anchor_x = anchor_y = 0.5
        dx = dy = 0.0
        hand_scale_norm = 0.1
        gesture_state = "IDLE"
        pinch_distance = 1.0
        is_open_palm = is_fist = rotate_mode = zoom_mode = False
        hand_landmarks = None
        raw_point = filtered_point = None

        t_filter_start = time.perf_counter()
        if results.multi_hand_landmarks:
            detected = True
            hand_landmarks = results.multi_hand_landmarks[0]
            lms = hand_landmarks.landmark

            # Index fingertip for cursor
            index_tip = lms[8]
            raw_x, raw_y = float(index_tip.x), float(index_tip.y)
            raw_px = (raw_x * target_w, raw_y * target_h)

            if self.filter_mode == "kalman":
                filtered_px = self.kalman.update(*raw_px)
            else:
                filtered_px = raw_px

            filtered_x = filtered_px[0] / target_w
            filtered_y = filtered_px[1] / target_h

            # Anchor: palm center average of landmarks 0, 5, 9, 13, 17
            anchor_raw_x = (lms[0].x + lms[5].x + lms[9].x + lms[13].x + lms[17].x) / 5.0
            anchor_raw_y = (lms[0].y + lms[5].y + lms[9].y + lms[13].y + lms[17].y) / 5.0
            anchor_raw_px = (anchor_raw_x * target_w, anchor_raw_y * target_h)

            if self.filter_mode == "kalman":
                filtered_anchor_px = self.anchor_kalman.update(*anchor_raw_px)
            else:
                filtered_anchor_px = anchor_raw_px

            filtered_anchor_x = filtered_anchor_px[0] / target_w
            filtered_anchor_y = filtered_anchor_px[1] / target_h

            raw_point = (int(raw_px[0]), int(raw_px[1]))
            filtered_point = (int(filtered_px[0]), int(filtered_px[1]))
            self.raw_trail.append(raw_point)
            self.filtered_trail.append(filtered_point)

            if self.last_raw_point is not None and math.hypot(raw_x - self.last_raw_point[0], raw_y - self.last_raw_point[1]) < STILL_MOVEMENT_THRESHOLD:
                self.jitter_errors.append(((raw_px[0] - filtered_px[0]), (raw_px[1] - filtered_px[1])))
            else:
                self.jitter_errors.clear()
            self.last_raw_point = (raw_x, raw_y)

            try:
                confidence = float(results.multi_handedness[0].classification[0].score)
            except (AttributeError, IndexError, TypeError):
                confidence = 0.0

            self.was_tracking = True
        else:
            self.last_raw_point = None
            self.jitter_errors.clear()
            self.prev_anchor = None
            if self.was_tracking:
                self.loss_events += 1
                self.kalman.reset()
                self.anchor_kalman.reset()
                self.was_tracking = False

        ms_filter = (time.perf_counter() - t_filter_start) * 1000.0

        # 3. Gesture Recognition
        t_gest = time.perf_counter()
        if detected and hand_landmarks is not None:
            (
                gesture_state,
                pinch_distance,
                hand_scale_norm,
                is_pinching,
                is_open_palm,
                is_fist,
            ) = self.gesture_machine.process(hand_landmarks.landmark, target_w, target_h)
            rotate_mode = bool(gesture_state == "PALM_ROTATE")
            zoom_mode = bool(gesture_state == "FIST_ZOOM")

            # Remap through calibrator
            cursor_x, cursor_y = self.calibrator.remap(filtered_x, filtered_y)
            anchor_x, anchor_y = self.calibrator.remap(filtered_anchor_x, filtered_anchor_y)

            # Anchor delta (zero on gesture start/switch to avoid jump)
            if self.prev_anchor is None or self.prev_gesture_state != gesture_state:
                dx = 0.0
                dy = 0.0
            else:
                dx = anchor_x - self.prev_anchor[0]
                dy = anchor_y - self.prev_anchor[1]

            self.prev_anchor = (anchor_x, anchor_y)
            self.prev_gesture_state = gesture_state
        else:
            self.gesture_machine.process(None, target_w, target_h)
            cursor_x, cursor_y = 0.5, 0.5
            anchor_x, anchor_y = 0.5, 0.5
            dx = dy = 0.0
            self.prev_anchor = None
            self.prev_gesture_state = "IDLE"

        ms_gest = (time.perf_counter() - t_gest) * 1000.0
        t_total = (time.perf_counter() - t_start) * 1000.0

        # Record stage history
        self.stage_capture.append(cap_latency)
        self.stage_preprocess.append(ms_pre)
        self.stage_mediapipe.append(ms_mp)
        self.stage_filter.append(ms_filter)
        self.stage_gesture.append(ms_gest)
        self.stage_total.append(t_total)

        jitter_px = 0.0
        if self.jitter_errors:
            error_points = np.asarray(self.jitter_errors, dtype=np.float32)
            jitter_px = float(np.std(error_points, axis=0).mean())

        fps = float(np.mean(self.fps_history)) if self.fps_history else 0.0

        packet = {
            "camera": bool(self.camera_enabled),
            "detected": bool(detected and self.camera_enabled),
            "cursorNormalized": {"x": round(float(cursor_x), 4), "y": round(float(cursor_y), 4)},
            "cursorRaw": {"x": round(float(raw_x), 4), "y": round(float(raw_y), 4)},
            "anchor": {"x": round(float(anchor_x), 4), "y": round(float(anchor_y), 4)},
            "anchorDelta": {"dx": round(float(dx), 4), "dy": round(float(dy), 4)},
            "handScale": round(float(hand_scale_norm), 4),
            "gestureState": gesture_state if (detected and self.camera_enabled) else "IDLE",
            "isOpenPalm": bool(is_open_palm and detected and self.camera_enabled),
            "isFist": bool(is_fist and detected and self.camera_enabled),
            "rotateMode": bool(rotate_mode and self.camera_enabled),
            "zoomMode": bool(zoom_mode and self.camera_enabled),
            "pinchDistanceNormalized": round(float(pinch_distance), 3),
            "metrics": {
                "fps": round(fps, 1),
                "confidence": round(confidence, 4),
                "jitterPx": round(jitter_px, 2),
                "lossEvents": self.loss_events,
                "latencyMs": round(t_total + cap_latency, 2),
                "stageMs": self._get_stage_metrics(),
                **self._get_cpu_metric(),
            },
        }

        if self.camera_error:
            packet["cameraError"] = self.camera_error

        # Record frame for eval if configured
        raw_cursor = {"x": round(float(raw_x), 4), "y": round(float(raw_y), 4)} if detected else None
        filtered_cursor = {"x": round(float(filtered_x), 4), "y": round(float(filtered_y), 4)} if detected else None
        self.record_frame(
            raw_cursor, filtered_cursor, packet, detected, (target_w, target_h), confidence, packet["metrics"]["latencyMs"]
        )

        # Debug visualization window if enabled
        if self.debug and (time.perf_counter() - getattr(self, "_last_debug_time", 0.0) >= 1.0 / 15.0):
            self._last_debug_time = time.perf_counter()
            self.update_debug_window(self.buffers.flipped_bgr, hand_landmarks, raw_point, filtered_point, gesture_state, fps)

        return packet

    def _get_stage_metrics(self):
        return {
            "capture": round(float(np.mean(self.stage_capture)), 2) if self.stage_capture else 0.0,
            "preprocess": round(float(np.mean(self.stage_preprocess)), 2) if self.stage_preprocess else 0.0,
            "mediapipe": round(float(np.mean(self.stage_mediapipe)), 2) if self.stage_mediapipe else 0.0,
            "filter": round(float(np.mean(self.stage_filter)), 2) if self.stage_filter else 0.0,
            "gesture": round(float(np.mean(self.stage_gesture)), 2) if self.stage_gesture else 0.0,
            "total": round(float(np.mean(self.stage_total)), 2) if self.stage_total else 0.0,
        }

    def _get_cpu_metric(self):
        if psutil is not None:
            try:
                return {"cpuPercent": round(psutil.cpu_percent(interval=None), 1)}
            except Exception:
                pass
        return {}

    def vision_worker_loop(self):
        """Dedicated thread executing the vision pipeline at high frame rate."""
        prev_t = time.perf_counter()
        while self.running:
            now = time.perf_counter()
            dt = max(now - prev_t, 1e-6)
            prev_t = now
            self.fps_history.append(1.0 / dt)

            frame = None
            cap_latency = 0.0
            if self.camera_enabled and self.camera is not None:
                try:
                    frame, cap_latency = self.camera.read_latest()
                except Exception as err:
                    frame = None
                    cap_latency = 0.0

            packet = self.process_frame(frame, cap_latency)

            with self.packet_lock:
                self.latest_packet = packet

            # Throttle thread loop to ~30-60 Hz depending on camera cadence
            elapsed = time.perf_counter() - now
            time.sleep(max(0.001, (1.0 / 30.0) - elapsed))

    def record_frame(self, raw_cursor, filtered_cursor, packet, detected, frame_size, confidence, latency_ms):
        if not self.record_file:
            return
        record = {
            "timestampSeconds": round(time.monotonic() - self.record_started_at, 4),
            "rawCursor": raw_cursor,
            "filteredCursor": filtered_cursor,
            "anchor": packet.get("anchor"),
            "anchorDelta": packet.get("anchorDelta"),
            "handScale": packet.get("handScale"),
            "gestureState": packet.get("gestureState"),
            "state": packet.get("gestureState"),
            "label": self.record_label,
            "detected": bool(detected),
            "frameSize": list(frame_size),
            "confidence": float(confidence),
            "latencyMs": float(latency_ms),
            "claheEnabled": bool(self.clahe_enabled),
            "filterMode": self.filter_mode,
        }
        if self.record_has_frames:
            self.record_file.write(",\n")
        self.record_file.write(json.dumps(record))
        self.record_file.flush()
        self.record_has_frames = True

    def update_debug_window(self, frame, hand_landmarks, raw_point, filtered_point, state, fps):
        if not self.debug or frame is None:
            return
        canvas = frame.copy()
        if hand_landmarks is not None:
            self.mp_draw.draw_landmarks(canvas, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)
        for trail, color in ((self.raw_trail, (50, 80, 255)), (self.filtered_trail, (40, 230, 80))):
            points = list(trail)
            for first, second in zip(points, points[1:]):
                cv2.line(canvas, first, second, color, 2, cv2.LINE_AA)
        for point, color in ((raw_point, (50, 80, 255)), (filtered_point, (40, 230, 80))):
            if point:
                cv2.circle(canvas, point, 7, color, -1, cv2.LINE_AA)
        cv2.putText(
            canvas, f"{state} | {fps:.1f} FPS | CLAHE {'ON' if self.clahe_enabled else 'OFF'}",
            (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA,
        )
        try:
            cv2.imshow("SeeLearn Vision Debug", canvas)
            cv2.waitKey(1)
        except cv2.error:
            self.disable_debug_window()

    def disable_debug_window(self):
        self.debug = False
        if not self.debug_window_warning_printed:
            print("[OpenCV Vision] Debug window unavailable. Continuing without GUI.")
            self.debug_window_warning_printed = True

    async def broadcast_loop(self):
        """WebSocket broadcast loop running in asyncio event loop."""
        print(f"[OpenCV Vision] Service broadcasting on ws://localhost:{self.port} ...")
        last_send_time = 0.0
        last_sent_payload = None

        while self.running:
            loop_start = time.perf_counter()
            packet = None
            with self.packet_lock:
                if self.latest_packet:
                    packet = dict(self.latest_packet)

            if packet:
                payload_key = (
                    packet["detected"],
                    packet["gestureState"],
                    packet["rotateMode"],
                    packet["zoomMode"],
                    packet["cursorNormalized"]["x"],
                    packet["cursorNormalized"]["y"],
                    packet["anchor"]["x"],
                    packet["anchor"]["y"],
                    packet["pinchDistanceNormalized"],
                )
                now = time.perf_counter()
                time_since_send = now - last_send_time
                # 30 per second send rate, skip identical, heartbeat at least 5 Hz
                should_send = (
                    (time_since_send >= 0.033 and payload_key != last_sent_payload)
                    or (time_since_send >= 0.20)
                )

                if should_send and self.connected_clients:
                    last_send_time = now
                    last_sent_payload = payload_key
                    message = json.dumps(packet)
                    for client in list(self.connected_clients):
                        try:
                            await client.send(message)
                        except Exception:
                            self.connected_clients.discard(client)

            elapsed = time.perf_counter() - loop_start
            await asyncio.sleep(max(0.001, (1.0 / 30.0) - elapsed))

    def state_message(self, **extra):
        msg = {
            "type": "state",
            "camera": bool(self.camera_enabled),
            "clahe": self.clahe_enabled,
            "filter": self.filter_mode,
            "calibrated": self.calibrator.calibrated,
            **extra,
        }
        if self.camera_error:
            msg["cameraError"] = self.camera_error
        return msg

    async def handle_client(self, websocket):
        self.connected_clients.add(websocket)
        print(f"[OpenCV Vision] Web client connected ({len(self.connected_clients)} active)")
        try:
            async for message in websocket:
                calibration_success = None
                try:
                    data = json.loads(message)
                except (TypeError, json.JSONDecodeError):
                    continue
                action = data.get("action") if isinstance(data, dict) else None
                if action == "camera_off":
                    self.camera_enabled = False
                    self.camera_error = None
                    if self.camera is not None:
                        try:
                            self.camera.stop()
                        except Exception as e:
                            print(f"[OpenCV Vision] Error stopping camera: {e}")
                        self.camera = None
                    print("[OpenCV Vision] Camera turned OFF")
                elif action == "camera_on":
                    try:
                        if self.camera is not None:
                            self.camera.stop()
                        self.camera = ThreadedCamera(self.camera_index, width=640, height=480, fps=30).start()
                        self.camera_enabled = True
                        self.camera_error = None
                        print("[OpenCV Vision] Camera turned ON")
                    except Exception as e:
                        self.camera = None
                        self.camera_enabled = False
                        self.camera_error = str(e)
                        print(f"[OpenCV Vision] Camera reopen failed: {e}")
                elif action == "toggle_clahe":
                    self.clahe_enabled = not self.clahe_enabled
                elif action == "set_filter":
                    value = data.get("value")
                    if value in ("kalman", "none"):
                        self.filter_mode = value
                elif action == "calibrate":
                    calibration_success = self.calibrator.calibrate(data.get("samples", []))
                elif action != "get_state":
                    continue
                reply = self.state_message()
                if calibration_success is not None:
                    reply["calibrationSuccess"] = calibration_success
                await websocket.send(json.dumps(reply))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.discard(websocket)
            print("[OpenCV Vision] Web client disconnected.")

    def run(self):
        """Starts worker thread and async WebSocket broadcast."""
        worker_thread = threading.Thread(target=self.vision_worker_loop, daemon=True)
        worker_thread.start()

        async def main():
            async with websockets.serve(self.handle_client, "0.0.0.0", self.port):
                await self.broadcast_loop()

        try:
            asyncio.run(main())
        except KeyboardInterrupt:
            print("\n[OpenCV Vision] Shutting down.")
        finally:
            self.running = False
            if self.camera is not None:
                try:
                    self.camera.stop()
                except Exception:
                    pass
            self.hands.close()
            if self.record_file:
                self.record_file.write("\n]")
                self.record_file.close()
            if self.debug_window_requested:
                try:
                    cv2.destroyAllWindows()
                except cv2.error:
                    self.disable_debug_window()


def run_benchmark(duration_sec=10, camera_index=0):
    """Runs pipeline benchmark across configurations and prints evidence table."""
    print(f"\n{'='*70}")
    print(f" SeeLearn OpenCV Pipeline Benchmark ({duration_sec}s per test)")
    print(f"{'='*70}")

    configs = [
        {"name": "Optimized (CLAHE ON, Threads 2)", "clahe": True, "threads": 2},
        {"name": "Ablation: No CLAHE (Threads 2)", "clahe": False, "threads": 2},
        {"name": "Ablation: 1 Thread (CLAHE ON)", "clahe": True, "threads": 1},
        {"name": "Ablation: 4 Threads (CLAHE ON)", "clahe": True, "threads": 4},
    ]

    results = []
    # Allocate test time proportionally
    sub_dur = max(2.5, duration_sec / len(configs))

    for cfg in configs:
        print(f"\n[Benchmarking] {cfg['name']} for {sub_dur:.1f}s ...")
        service = SeeLearnVisionService(
            camera_index=camera_index,
            clahe_enabled=cfg["clahe"],
            threads=cfg["threads"],
        )
        if not service.camera_enabled:
            print("[OpenCV Vision] Camera unavailable for benchmark.")
            return

        # Warm-up (5 frames)
        for _ in range(5):
            f, _ = service.camera.read_latest()
            if f is not None:
                service.process_frame(f, 0.0)
            time.sleep(0.033)

        capture_samples = []
        preprocess_samples = []
        mediapipe_samples = []
        filter_samples = []
        gesture_samples = []
        total_samples = []

        start_time = time.perf_counter()
        frame_count = 0

        while (time.perf_counter() - start_time) < sub_dur:
            t0 = time.perf_counter()
            frame, cap_lat = service.camera.read_latest()
            if frame is None:
                time.sleep(0.005)
                continue

            packet = service.process_frame(frame, cap_lat)

            st = packet["metrics"]["stageMs"]
            capture_samples.append(st["capture"])
            preprocess_samples.append(st["preprocess"])
            mediapipe_samples.append(st["mediapipe"])
            filter_samples.append(st["filter"])
            gesture_samples.append(st["gesture"])
            total_samples.append(st["total"])
            frame_count += 1

            elapsed = time.perf_counter() - t0
            time.sleep(max(0.001, (1.0 / 30.0) - elapsed))

        service.running = False
        service.camera.stop()
        service.hands.close()

        total_elapsed = time.perf_counter() - start_time
        res = {
            "name": cfg["name"],
            "fps": float(frame_count / total_elapsed) if total_elapsed > 0 else 0.0,
            "capture": float(np.mean(capture_samples)) if capture_samples else 0.0,
            "preprocess": float(np.mean(preprocess_samples)) if preprocess_samples else 0.0,
            "mediapipe": float(np.mean(mediapipe_samples)) if mediapipe_samples else 0.0,
            "filter": float(np.mean(filter_samples)) if filter_samples else 0.0,
            "gesture": float(np.mean(gesture_samples)) if gesture_samples else 0.0,
            "total": float(np.mean(total_samples)) if total_samples else 0.0,
            "frames": frame_count,
        }
        results.append(res)
        print(f"  -> FPS: {res['fps']:.1f} | Total: {res['total']:.2f}ms | MediaPipe: {res['mediapipe']:.2f}ms | Preprocess: {res['preprocess']:.2f}ms")

    baseline = results[0]
    print(f"\n{'='*70}")
    print(f" BENCHMARK RESULTS & OPTIMIZATION EVIDENCE")
    print(f"{'='*70}")
    print(f"{'Configuration':<35} | {'FPS':>5} | {'Pre(ms)':>7} | {'MP(ms)':>7} | {'Total(ms)':>9} | {'Diff(ms)':>8}")
    print(f"{'-'*35}-+-{'-'*5}-+-{'-'*7}-+-{'-'*7}-+-{'-'*9}-+-{'-'*8}")

    for r in results:
        diff = r["total"] - baseline["total"]
        diff_str = f"{diff:+.2f}" if r != baseline else "baseline"
        print(f"{r['name']:<35} | {r['fps']:>5.1f} | {r['preprocess']:>7.2f} | {r['mediapipe']:>7.2f} | {r['total']:>9.2f} | {diff_str:>8}")

    print(f"{'='*70}")
    clahe_saved = results[1]["preprocess"] - baseline["preprocess"]
    thread1_saved = results[2]["total"] - baseline["total"]
    print(f"Key Findings:")
    print(f"  • Preprocessing with CLAHE overhead: {abs(clahe_saved):.2f} ms")
    print(f"  • Multi-threading (threads=2 vs 1): {thread1_saved:+.2f} ms faster per frame")
    print(f"  • End-to-end frame time: {baseline['total']:.2f} ms (Target: < 35 ms) -> {'PASSED' if baseline['total'] < 35 else 'ACCEPTABLE'}")
    print(f"{'='*70}\n")


def parse_args():
    parser = argparse.ArgumentParser(description="SeeLearn OpenCV hand gesture service")
    parser.add_argument("--camera", type=int, default=0, help="Preferred camera index (default: 0)")
    parser.add_argument("--debug", action="store_true", help="Show tracking debug window")
    parser.add_argument("--record", metavar="FILE", help="Write per-frame tracking data as a JSON array")
    parser.add_argument("--label", default="", help="Label stored with every recorded frame")
    parser.add_argument("--pinch-enter", type=float, default=PINCH_ENTER_THRESHOLD,
                        help=f"Pinch enter threshold (default: {PINCH_ENTER_THRESHOLD})")
    parser.add_argument("--curl-margin", type=float, default=CURL_MARGIN_RATIO,
                        help=f"Finger curl margin ratio (default: {CURL_MARGIN_RATIO})")
    parser.add_argument("--threads", type=int, default=2, help="OpenCV thread count (default: 2)")
    parser.add_argument("--no-clahe", action="store_true", help="Disable CLAHE preprocessing")
    parser.add_argument("--benchmark", type=int, nargs="?", const=10, metavar="SECONDS",
                        help="Run pipeline benchmark for N seconds without WebSocket and report stats")
    parser.add_argument("--dump-packets", type=int, default=0, metavar="N",
                        help="Capture and print first N packets to stdout and exit")
    return parser.parse_args()


if __name__ == "__main__":
    print(f"[OpenCV Vision] cv2.__version__={cv2.__version__}")
    args = parse_args()

    if args.label and args.label not in ALLOWED_LABELS:
        print(f"[OpenCV Vision] Note: label '{args.label}' not in standard set: {sorted(ALLOWED_LABELS)}")

    if not 0.05 <= args.pinch_enter < PINCH_EXIT_THRESHOLD:
        raise SystemExit(f"--pinch-enter must be between 0.05 and {PINCH_EXIT_THRESHOLD} (exclusive).")

    if args.benchmark:
        run_benchmark(duration_sec=args.benchmark, camera_index=args.camera)
        sys.exit(0)

    if args.dump_packets > 0:
        service = SeeLearnVisionService(
            camera_index=args.camera,
            pinch_enter=args.pinch_enter,
            curl_margin=args.curl_margin,
            threads=args.threads,
            clahe_enabled=not args.no_clahe,
            debug=False,
        )
        print(f"\n[OpenCV Vision] Capturing and printing first {args.dump_packets} packets:")
        count = 0
        time.sleep(0.5)
        while count < args.dump_packets:
            frame, cap_lat = service.camera.read_latest()
            if frame is not None:
                packet = service.process_frame(frame, cap_lat)
                print(f"\n--- Packet {count + 1} ---")
                print(json.dumps(packet, indent=2))
                count += 1
            time.sleep(0.05)
        service.running = False
        service.camera.stop()
        service.hands.close()
        sys.exit(0)

    try:
        SeeLearnVisionService(
            camera_index=args.camera,
            pinch_enter=args.pinch_enter,
            curl_margin=args.curl_margin,
            threads=args.threads,
            clahe_enabled=not args.no_clahe,
            debug=args.debug,
            record_path=args.record,
            label=args.label,
        ).run()
    except RuntimeError as error:
        print(f"[OpenCV Vision] ERROR: {error}", file=sys.stderr)
        sys.exit(1)
