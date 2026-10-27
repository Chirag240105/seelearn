#!/usr/bin/env python3
"""OpenCV hand tracking service for the SeeLearn WebSocket client."""

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


PINCH_ENTER_THRESHOLD = 0.32
PINCH_EXIT_THRESHOLD = 0.44
PINCH_REQUIRED_FRAMES = 2
OPEN_PALM_HOLD_SECONDS = 0.5
MAX_FRAME_WIDTH = 640
CALIBRATION_MIN_SAMPLES = 11
STILL_MOVEMENT_THRESHOLD = 0.01


class ThreadedCamera:
    """Try the requested camera and common Windows backends before starting capture."""

    def __init__(self, src=0, width=640, height=480):
        self.src = src
        self.cap, self.frame = self._open_camera(src, width, height)
        self.grabbed = True
        self.started = False
        self.read_lock = threading.Lock()
        self.capture_latency_ms = 0.0

    @staticmethod
    def _open_camera(preferred_index, width, height):
        candidates = []
        is_windows = platform.system() == "Windows"
        preferred_backends = [cv2.CAP_DSHOW, cv2.CAP_ANY] if is_windows else [cv2.CAP_ANY]
        candidates.extend((preferred_index, backend) for backend in preferred_backends)
        if is_windows and preferred_index != 0:
            candidates.extend(((0, cv2.CAP_DSHOW), (0, cv2.CAP_ANY)))
        fallback_indices = [index for index in (1, 2) if index != preferred_index]
        if preferred_index != 0 and not is_windows:
            fallback_indices = [0] + fallback_indices
        candidates.extend((index, cv2.CAP_ANY) for index in fallback_indices)

        attempted = set()
        for index, backend in candidates:
            key = (index, backend)
            if key in attempted:
                continue
            attempted.add(key)
            cap = cv2.VideoCapture(index, backend) if backend != cv2.CAP_ANY else cv2.VideoCapture(index)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                cap.set(cv2.CAP_PROP_FPS, 60)
                grabbed, frame = cap.read()
                if grabbed and frame is not None and np.any(frame):
                    print(f"[OpenCV Vision] Camera opened: index {index}, backend {backend}")
                    return cap, frame
                if grabbed and frame is not None:
                    print(f"[OpenCV Vision] Camera index {index}, backend {backend} returned a black frame; trying the next backend.")
            cap.release()

        raise RuntimeError(
            "No usable camera found. Check camera permissions and close other apps using the camera; "
            "then try --camera with another index."
        )

    def start(self):
        if self.started:
            return self
        self.started = True
        self.thread = threading.Thread(target=self.update, daemon=True)
        self.thread.start()
        return self

    def update(self):
        while self.started:
            started_at = time.perf_counter()
            grabbed, frame = self.cap.read()
            elapsed_ms = (time.perf_counter() - started_at) * 1000.0
            with self.read_lock:
                self.grabbed = grabbed
                self.frame = frame if grabbed else None
                self.capture_latency_ms = elapsed_ms
            time.sleep(0.001)

    def read(self):
        with self.read_lock:
            frame = self.frame.copy() if self.grabbed and self.frame is not None else None
            return frame, self.capture_latency_ms

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


class KalmanPointSmoother:
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
    def __init__(self, pinch_enter=PINCH_ENTER_THRESHOLD):
        self.state = "IDLE"
        self.pinch_enter_thresh = pinch_enter
        self.pinch_exit_thresh = PINCH_EXIT_THRESHOLD
        self.pinch_frames = 0
        self.reentry_grace_frames = 0
        self.tracking_loss_hold_frames = 0

    def process(self, landmarks, frame_width, frame_height):
        if landmarks is None:
            self.tracking_loss_hold_frames += 1
            self.pinch_frames = 0
            if self.tracking_loss_hold_frames > 12:
                self.state = "IDLE"
                self.reentry_grace_frames = 8
            return "IDLE", 1.0, False, False

        self.tracking_loss_hold_frames = 0
        if self.reentry_grace_frames > 0:
            self.reentry_grace_frames -= 1
            self.state = "POINTING"
            return self.state, 1.0, False, self._is_open_palm(landmarks)

        wrist, thumb_tip, index_tip, middle_mcp = landmarks[0], landmarks[4], landmarks[8], landmarks[9]
        hand_scale = math.hypot((middle_mcp.x - wrist.x) * frame_width,
                                (middle_mcp.y - wrist.y) * frame_height)
        hand_scale = max(hand_scale, 1e-4)
        pinch_px = math.hypot((thumb_tip.x - index_tip.x) * frame_width,
                             (thumb_tip.y - index_tip.y) * frame_height)
        pinch_distance = pinch_px / hand_scale
        open_palm = self._is_open_palm(landmarks)

        if open_palm:
            self.state = "PALM_ROTATE"
            self.pinch_frames = 0
            return self.state, pinch_distance, False, True

        if self.state in ("IDLE", "POINTING", "PALM_ROTATE"):
            if pinch_distance < self.pinch_enter_thresh:
                self.pinch_frames += 1
                if self.pinch_frames >= PINCH_REQUIRED_FRAMES:
                    self.state = "PINCH_START"
            else:
                self.pinch_frames = 0
                self.state = "POINTING"
        elif self.state == "PINCH_START":
            self.state = "PINCH_HOLD"
        elif self.state == "PINCH_HOLD" and pinch_distance > self.pinch_exit_thresh:
            self.state = "PINCH_RELEASE"
            self.pinch_frames = 0
        elif self.state == "PINCH_RELEASE":
            self.state = "POINTING"

        return self.state, pinch_distance, self.state in ("PINCH_START", "PINCH_HOLD"), False

    @staticmethod
    def _is_open_palm(landmarks):
        fingers_extended = all(landmarks[tip].y < landmarks[pip].y for tip, pip in ((8, 6), (12, 10), (16, 14), (20, 18)))
        thumb_extended = abs(landmarks[4].x - landmarks[17].x) > abs(landmarks[3].x - landmarks[17].x)
        return fingers_extended and thumb_extended


class CoordinateCalibrator:
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
        min_x, max_x = max(0.05, float(np.percentile(xs, 5))), min(0.95, float(np.percentile(xs, 95)))
        min_y, max_y = max(0.05, float(np.percentile(ys, 5))), min(0.95, float(np.percentile(ys, 95)))
        if max_x <= min_x or max_y <= min_y:
            return False
        self.min_x, self.max_x, self.min_y, self.max_y = min_x, max_x, min_y, max_y
        self.calibrated = True
        return True

    def remap(self, x, y):
        x = max(self.min_x, min(self.max_x, x))
        y = max(self.min_y, min(self.max_y, y))
        return ((x - self.min_x) / (self.max_x - self.min_x),
                (y - self.min_y) / (self.max_y - self.min_y))


class SeeLearnVisionService:
    def __init__(self, port=8765, camera_index=0, pinch_enter=PINCH_ENTER_THRESHOLD,
                 debug=False, record_path=None, label=""):
        self.port = port
        self.camera_index = camera_index
        self.camera_enabled = True
        self.camera_error = None
        self.camera = None
        try:
            self.camera = ThreadedCamera(camera_index).start()
        except Exception as err:
            print(f"[OpenCV Vision] Initial camera open failed: {err}")
            self.camera_enabled = False
            self.camera_error = str(err)

        self.kalman = KalmanPointSmoother()
        self.gesture_machine = GestureStateMachine(pinch_enter)
        self.calibrator = CoordinateCalibrator()
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False, max_num_hands=1, model_complexity=0,
            min_detection_confidence=0.65, min_tracking_confidence=0.65
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.clahe_enabled = True
        self.filter_mode = "kalman"
        self.clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        self.fps_history = deque(maxlen=60)
        self.jitter_errors = deque(maxlen=60)
        self.last_raw_point = None
        self.loss_events = 0
        self.was_tracking = False
        self.connected_clients = set()
        self.running = True
        self.debug = debug
        self.debug_window_requested = debug
        self.debug_window_warning_printed = False
        self.raw_trail = deque(maxlen=40)
        self.filtered_trail = deque(maxlen=40)
        self.rotate_mode = False
        self.open_palm_since = None
        self.open_palm_toggle_fired = False
        self.record_label = label
        self.record_started_at = time.monotonic()
        self.record_file = open(record_path, "w", encoding="utf-8") if record_path else None
        if self.record_file:
            self.record_file.write("[")
            self.record_has_frames = False

    def apply_clahe(self, bgr_image):
        lab = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)
        return cv2.cvtColor(cv2.merge((self.clahe.apply(l_channel), a_channel, b_channel)), cv2.COLOR_LAB2BGR)

    def state_message(self, **extra):
        msg = {
            "type": "state",
            "camera": bool(self.camera_enabled),
            "clahe": self.clahe_enabled,
            "filter": self.filter_mode,
            "calibrated": self.calibrator.calibrated,
            **extra
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
                        self.camera = ThreadedCamera(self.camera_index).start()
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

    def resize_for_tracking(self, frame):
        height, width = frame.shape[:2]
        if width <= MAX_FRAME_WIDTH:
            return frame
        ratio = MAX_FRAME_WIDTH / width
        return cv2.resize(frame, (MAX_FRAME_WIDTH, max(1, round(height * ratio))), interpolation=cv2.INTER_AREA)

    def record_frame(self, raw_cursor, filtered_cursor, state, detected, frame_size,
                     confidence, latency_ms):
        if not self.record_file:
            return
        record = {
            "timestampSeconds": time.monotonic() - self.record_started_at,
            "rawCursor": raw_cursor,
            "filteredCursor": filtered_cursor,
            "state": state,
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
        if not self.debug:
            return
        canvas = frame.copy() if frame is not None else np.zeros((360, MAX_FRAME_WIDTH, 3), dtype=np.uint8)
        if hand_landmarks is not None:
            self.mp_draw.draw_landmarks(canvas, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)
        for trail, color in ((self.raw_trail, (50, 80, 255)), (self.filtered_trail, (40, 230, 80))):
            points = list(trail)
            for first, second in zip(points, points[1:]):
                cv2.line(canvas, first, second, color, 2, cv2.LINE_AA)
        for point, color in ((raw_point, (50, 80, 255)), (filtered_point, (40, 230, 80))):
            if point:
                cv2.circle(canvas, point, 7, color, -1, cv2.LINE_AA)
        cv2.putText(canvas, f"{state} | {fps:.1f} FPS | CLAHE {'ON' if self.clahe_enabled else 'OFF'}",
                    (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
        try:
            cv2.imshow("SeeLearn Vision Debug", canvas)
        except cv2.error:
            self.disable_debug_window()
            return
        try:
            cv2.waitKey(1)
        except cv2.error:
            self.disable_debug_window()

    def disable_debug_window(self):
        self.debug = False
        if not self.debug_window_warning_printed:
            print("Debug window unavailable (OpenCV was built without GUI support). Continuing without it.")
            self.debug_window_warning_printed = True

    async def broadcast_loop(self):
        print(f"[OpenCV Vision] Service broadcasting on ws://localhost:{self.port} ...")
        previous_loop_time = time.perf_counter()
        last_send_time = 0.0
        last_sent_payload = None
        last_debug_time = 0.0
        while self.running:
            loop_started = time.perf_counter()
            loop_delta = max(loop_started - previous_loop_time, 1e-6)
            previous_loop_time = loop_started
            self.fps_history.append(1.0 / loop_delta)

            frame = None
            capture_latency = 0.0
            if self.camera_enabled and self.camera is not None:
                try:
                    frame, capture_latency = self.camera.read()
                except Exception as read_err:
                    print(f"[OpenCV Vision] Camera read error: {read_err}")
                    frame = None

            debug_frame = None
            detected = False
            confidence = 0.0
            raw_x = raw_y = filtered_x = filtered_y = 0.5
            gesture_state, pinch_distance, is_pinching, is_open_palm = "IDLE", 1.0, False, False
            raw_point = filtered_point = None
            hand_landmarks = None
            frame_width, frame_height = MAX_FRAME_WIDTH, 360
            preprocess_latency = tracking_latency = 0.0

            if frame is not None:
                frame = self.resize_for_tracking(frame)
                height, width = frame.shape[:2]
                frame_width, frame_height = width, height
                t0 = time.perf_counter()
                flipped = cv2.flip(frame, 1)
                debug_frame = flipped
                processed = self.apply_clahe(flipped) if self.clahe_enabled else flipped
                preprocess_latency = (time.perf_counter() - t0) * 1000.0
                t0 = time.perf_counter()
                results = self.hands.process(cv2.cvtColor(processed, cv2.COLOR_BGR2RGB))
                tracking_latency = (time.perf_counter() - t0) * 1000.0
                if results.multi_hand_landmarks:
                    detected = True
                    hand_landmarks = results.multi_hand_landmarks[0]
                    index_tip = hand_landmarks.landmark[8]
                    raw_x, raw_y = float(index_tip.x), float(index_tip.y)
                    raw_px = (raw_x * width, raw_y * height)
                    if self.filter_mode == "kalman":
                        filtered_px = self.kalman.update(*raw_px)
                    else:
                        filtered_px = raw_px
                    filtered_x, filtered_y = filtered_px[0] / width, filtered_px[1] / height
                    raw_point = (int(raw_px[0]), int(raw_px[1]))
                    filtered_point = (int(filtered_px[0]), int(filtered_px[1]))
                    self.raw_trail.append(raw_point)
                    self.filtered_trail.append(filtered_point)
                    if self.last_raw_point is not None and math.hypot(raw_x - self.last_raw_point[0], raw_y - self.last_raw_point[1]) < STILL_MOVEMENT_THRESHOLD:
                        self.jitter_errors.append(((raw_px[0] - filtered_px[0]), (raw_px[1] - filtered_px[1])))
                    else:
                        self.jitter_errors.clear()
                    self.last_raw_point = (raw_x, raw_y)
                    gesture_state, pinch_distance, is_pinching, is_open_palm = self.gesture_machine.process(
                        hand_landmarks.landmark, width, height
                    )
                    try:
                        confidence = float(results.multi_handedness[0].classification[0].score)
                    except (AttributeError, IndexError, TypeError):
                        confidence = 0.0
                    self.was_tracking = True
                else:
                    gesture_state, pinch_distance, is_pinching, is_open_palm = self.gesture_machine.process(None, width, height)
                    self.last_raw_point = None
                    self.jitter_errors.clear()
                    if self.was_tracking:
                        self.loss_events += 1
                        self.kalman.reset()
                        self.was_tracking = False
            else:
                self.gesture_machine.process(None, MAX_FRAME_WIDTH, 360)
                self.last_raw_point = None
                if self.was_tracking:
                    self.loss_events += 1
                    self.kalman.reset()
                    self.was_tracking = False

            now = time.perf_counter()
            if is_open_palm and detected:
                if self.open_palm_since is None:
                    self.open_palm_since = now
                    self.open_palm_toggle_fired = False
                elif not self.open_palm_toggle_fired and now - self.open_palm_since >= OPEN_PALM_HOLD_SECONDS:
                    self.rotate_mode = not self.rotate_mode
                    self.open_palm_toggle_fired = True
                    print(f"[OpenCV Vision] Rotate mode: {self.rotate_mode}")
            else:
                self.open_palm_since = None
                self.open_palm_toggle_fired = False

            cursor_x, cursor_y = self.calibrator.remap(filtered_x, filtered_y) if detected else (filtered_x, filtered_y)
            jitter_px = 0.0
            if self.jitter_errors:
                error_points = np.asarray(self.jitter_errors, dtype=np.float32)
                jitter_px = float(np.std(error_points, axis=0).mean())
            frame_latency = (time.perf_counter() - loop_started) * 1000.0
            fps = float(np.mean(self.fps_history)) if self.fps_history else 0.0
            packet = {
                "camera": bool(self.camera_enabled),
                "detected": bool(detected and self.camera_enabled),
                "cursorNormalized": {"x": round(float(cursor_x), 4), "y": round(float(cursor_y), 4)},
                "cursorRaw": {"x": round(float(raw_x), 4), "y": round(float(raw_y), 4)},
                "gestureState": gesture_state if (detected and self.camera_enabled) else "IDLE",
                "isOpenPalm": bool(is_open_palm and detected and self.camera_enabled),
                "rotateMode": bool(self.rotate_mode and self.camera_enabled),
                "pinchDistanceNormalized": round(float(pinch_distance), 3),
                "metrics": {
                    "fps": round(fps, 1),
                    "confidence": round(confidence, 4),
                    "jitterPx": round(jitter_px, 2),
                    "lossEvents": self.loss_events,
                    "latencyMs": round(frame_latency + capture_latency, 2),
                },
            }
            if self.camera_error:
                packet["cameraError"] = self.camera_error
            raw_cursor = {"x": round(float(raw_x), 4), "y": round(float(raw_y), 4)} if detected else None
            filtered_cursor = {"x": round(float(filtered_x), 4), "y": round(float(filtered_y), 4)} if detected else None
            self.record_frame(
                raw_cursor, filtered_cursor, packet["gestureState"], detected,
                (frame_width, frame_height), confidence, packet["metrics"]["latencyMs"],
            )
            if self.debug_window_requested and (now - last_debug_time >= 1.0 / 15.0):
                last_debug_time = now
                self.update_debug_window(debug_frame, hand_landmarks, raw_point, filtered_point, packet["gestureState"], fps)

            payload_key = (
                packet["detected"],
                packet["gestureState"],
                packet["rotateMode"],
                packet["cursorNormalized"]["x"],
                packet["cursorNormalized"]["y"],
                packet["pinchDistanceNormalized"],
            )

            time_since_send = now - last_send_time
            # Throttle WebSocket sends to 30 per second (0.033s), skip identical packets, send at least 5 Hz heartbeat
            should_send = (
                (time_since_send >= 0.033 and payload_key != last_sent_payload)
                or (time_since_send >= 0.2)
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

            await asyncio.sleep(max(0.001, 1.0 / 60.0 - (time.perf_counter() - loop_started)))

    def run(self):
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


def parse_args():
    parser = argparse.ArgumentParser(description="SeeLearn OpenCV hand gesture service")
    parser.add_argument("--camera", type=int, default=0, help="Preferred camera index (default: 0)")
    parser.add_argument("--debug", action="store_true", help="Show tracking debug window")
    parser.add_argument("--record", metavar="FILE", help="Write per-frame tracking data as a JSON array")
    parser.add_argument("--label", default="", help="Label stored with every recorded frame")
    parser.add_argument("--pinch-enter", type=float, default=PINCH_ENTER_THRESHOLD,
                        help=f"Pinch enter threshold (default: {PINCH_ENTER_THRESHOLD})")
    return parser.parse_args()


if __name__ == "__main__":
    print(f"[OpenCV Vision] cv2.__version__={cv2.__version__}")
    args = parse_args()
    if not 0.05 <= args.pinch_enter < PINCH_EXIT_THRESHOLD:
        raise SystemExit(f"--pinch-enter must be between 0.05 and {PINCH_EXIT_THRESHOLD} (exclusive).")
    try:
        SeeLearnVisionService(
            camera_index=args.camera,
            pinch_enter=args.pinch_enter,
            debug=args.debug,
            record_path=args.record,
            label=args.label,
        ).run()
    except RuntimeError as error:
        print(f"[OpenCV Vision] ERROR: {error}", file=sys.stderr)
        sys.exit(1)
