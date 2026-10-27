import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GestureState } from '../../types/vision';

interface GestureCursorOverlayProps {
  /** Normalized viewport coordinates (0–1) */
  cursor: { x: number; y: number } | null;
  gestureState: GestureState;
  rotateMode: boolean;
  pinchDistance: number; // 0–1 normalized
}

interface TrailPoint {
  x: number;
  y: number;
  age: number; // 0 = fresh, 1 = expired
}

const TRAIL_MAX = 8;

/** State-to-color mapping */
function getCursorColor(gestureState: GestureState, rotateMode: boolean): string {
  if (rotateMode) return '#f59e0b'; // amber for rotate
  if (gestureState === 'PINCH_HOLD' || gestureState === 'PINCH_START') return '#22c55e'; // green for pinch
  if (gestureState === 'PINCH_RELEASE') return '#22c55e';
  return '#3b82f6'; // blue for pointing / idle
}

export const GestureCursorOverlay: React.FC<GestureCursorOverlayProps> = ({
  cursor,
  gestureState,
  rotateMode,
  pinchDistance,
}) => {
  const isPinching = gestureState === 'PINCH_HOLD' || gestureState === 'PINCH_START';
  const isRelease = gestureState === 'PINCH_RELEASE';
  const [dwellProgress, setDwellProgress] = useState(0);
  const [trail, setTrail] = useState<TrailPoint[]>([]);

  // Smooth lerp position via rAF
  const smoothPos = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number | null>(null);

  const updateTrail = useCallback(() => {
    if (!cursor) return;
    const { x, y } = cursor;
    const prev = smoothPos.current;
    // Lerp factor ~0.35
    smoothPos.current = {
      x: prev.x + (x - prev.x) * 0.35,
      y: prev.y + (y - prev.y) * 0.35,
    };
    setTrail((prev) => {
      const next = [
        { x: smoothPos.current.x, y: smoothPos.current.y, age: 0 },
        ...prev.slice(0, TRAIL_MAX - 1).map((p) => ({ ...p, age: p.age + 1 / TRAIL_MAX })),
      ];
      return next;
    });
    rafRef.current = requestAnimationFrame(updateTrail);
  }, [cursor]);

  useEffect(() => {
    if (cursor) {
      smoothPos.current = cursor; // snap on first appear
      rafRef.current = requestAnimationFrame(updateTrail);
    } else {
      setTrail([]);
    }
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [cursor, updateTrail]);

  // Dwell arc progress during pinch hold
  useEffect(() => {
    if (!isPinching) {
      setDwellProgress(0);
      return;
    }
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      setDwellProgress(Math.min(1, (performance.now() - startedAt) / 700));
    }, 24);
    return () => window.clearInterval(timer);
  }, [isPinching]);

  // UI interaction via hover simulation (data-gesture-hover attribute + synthetic click on pinch release)
  const prevGestureRef = useRef<GestureState>('IDLE');
  useEffect(() => {
    if (!cursor) return;
    const screenX = cursor.x * window.innerWidth;
    const screenY = cursor.y * window.innerHeight;

    const el = document.elementFromPoint(screenX, screenY) as HTMLElement | null;
    if (el) {
      // Apply hover attribute for CSS targeting
      el.setAttribute('data-gesture-hover', 'true');
      // Dispatch click on pinch release
      if (gestureState === 'PINCH_RELEASE' && prevGestureRef.current !== 'PINCH_RELEASE') {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    }

    // Remove hover from previous element
    prevGestureRef.current = gestureState;
  }, [cursor, gestureState]);

  if (!cursor) return null;

  const color = getCursorColor(gestureState, rotateMode);
  // Ring size scales with pinch distance
  const ringSize = Math.max(24, Math.min(52, pinchDistance * 70));

  return (
    <>
      {/* Fading 8-point trail */}
      {trail.slice(1).map((point, idx) => (
        <div
          key={idx}
          className="fixed pointer-events-none"
          style={{
            left: `${point.x * 100}%`,
            top: `${point.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 9990 + idx,
          }}
        >
          <div
            style={{
              width: `${Math.max(4, ringSize * 0.22 * (1 - point.age))}px`,
              height: `${Math.max(4, ringSize * 0.22 * (1 - point.age))}px`,
              borderRadius: '50%',
              backgroundColor: color,
              opacity: Math.max(0, (1 - point.age) * 0.45),
              transition: 'none',
            }}
          />
        </div>
      ))}

      {/* Main Cursor Ring */}
      <div
        className="fixed pointer-events-none"
        style={{
          left: `${cursor.x * 100}%`,
          top: `${cursor.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: `${ringSize}px`,
            height: `${ringSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 60ms ease-out',
            transform: isPinching ? 'scale(0.88)' : isRelease ? 'scale(1.12)' : 'scale(1)',
          }}
        >
          {/* Outer ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `2px solid ${color}`,
              backgroundColor: `${color}18`,
              boxShadow: isPinching ? `0 0 12px ${color}60` : 'none',
              transition: 'border-color 120ms, background-color 120ms, box-shadow 120ms',
            }}
          />

          {/* Dwell SVG arc */}
          <svg
            style={{ position: 'absolute', inset: -6, width: `calc(100% + 12px)`, height: `calc(100% + 12px)`, rotate: '-90deg' }}
          >
            <circle
              cx="50%"
              cy="50%"
              r="46%"
              fill="none"
              stroke={`${color}30`}
              strokeWidth="2.5"
              pathLength="100"
            />
            <circle
              cx="50%"
              cy="50%"
              r="46%"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="100"
              strokeDashoffset={100 * (1 - (isPinching ? dwellProgress : 0))}
              pathLength="100"
              style={{ transition: 'stroke-dashoffset 75ms linear, stroke 120ms' }}
            />
          </svg>

          {/* Center dot */}
          <div
            style={{
              width: isPinching ? '10px' : '6px',
              height: isPinching ? '10px' : '6px',
              borderRadius: '50%',
              backgroundColor: isPinching ? '#ffffff' : color,
              transition: 'width 100ms, height 100ms, background-color 120ms',
              zIndex: 1,
            }}
          />
        </div>

        {/* State tag */}
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '6px', whiteSpace: 'nowrap' }}>
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'var(--sl-font-mono, monospace)',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: isPinching ? color : 'rgba(15,23,42,0.85)',
              color: isPinching ? '#ffffff' : color,
              border: `1px solid ${isPinching ? 'transparent' : color}40`,
              letterSpacing: '0.05em',
            }}
          >
            {rotateMode ? 'ROTATE' : gestureState}
          </span>
        </div>
      </div>
    </>
  );
};
