import React, { useEffect, useRef } from 'react';
import { gestureStore } from '../../services/gestureStore';
import { Hand, RotateCcw } from 'lucide-react';
import { GestureState } from '../../types/vision';

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

export const GlobalGestureCursor: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const dwellArcRef = useRef<SVGCircleElement>(null);
  const rotateIconRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);

  // Mini-map refs
  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapDotRef = useRef<HTMLDivElement>(null);
  const miniMapBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animId: number;
    let smoothX = window.innerWidth / 2;
    let smoothY = window.innerHeight / 2;
    let targetX = smoothX;
    let targetY = smoothY;

    let hasEverDetected = false;
    let lastDetectedTime = 0;
    let isFadingOut = false;
    let currentOpacity = 0;

    let dwellStart = 0;
    let lastHoverCheck = 0;
    let hoveredElement: HTMLElement | null = null;
    let previousGestureState: GestureState = 'IDLE';

    const trailPoints: TrailPoint[] = [];
    const MAX_TRAIL = 8;

    const render = () => {
      const {
        cursor,
        rawCursor,
        detected,
        cameraOn,
        gestureState,
        rotateMode,
        cursorVisible,
        cursorSize,
        miniMapVisible,
        hoveredComponentName,
      } = gestureStore;

      const now = performance.now();
      const ringSize = cursorSize === 'small' ? 28 : cursorSize === 'large' ? 44 : 36;
      const dotSize = cursorSize === 'small' ? 7 : cursorSize === 'large' ? 11 : 9;

      // Handle visibility and detection fade
      if (detected && cameraOn && cursor && cursorVisible) {
        hasEverDetected = true;
        lastDetectedTime = now;
        isFadingOut = false;
        currentOpacity = 1;

        targetX = Math.max(10, Math.min(window.innerWidth - 10, cursor.x * window.innerWidth));
        targetY = Math.max(10, Math.min(window.innerHeight - 10, cursor.y * window.innerHeight));

        // Smooth position with lerp (~0.35)
        smoothX += (targetX - smoothX) * 0.35;
        smoothY += (targetY - smoothY) * 0.35;

        // Hide "Show your hand" hint while detected
        if (hintRef.current) {
          hintRef.current.style.opacity = '0';
          hintRef.current.style.pointerEvents = 'none';
        }
      } else {
        // Detected is false
        if (hasEverDetected && cameraOn && cursorVisible) {
          const timeSinceLost = now - lastDetectedTime;
          if (timeSinceLost < 600) {
            // Fade out smoothly to 30%
            isFadingOut = true;
            const progress = timeSinceLost / 600;
            currentOpacity = 1 - progress * 0.7; // down to 0.3
          } else {
            // Completely hide cursor and show "Show your hand" hint
            currentOpacity = 0;
            if (hintRef.current) {
              hintRef.current.style.opacity = '1';
            }
          }
        } else {
          currentOpacity = 0;
          if (hintRef.current) {
            hintRef.current.style.opacity = '0';
          }
        }
      }

      // Update cursor position and opacity
      if (cursorRef.current) {
        cursorRef.current.style.opacity = `${currentOpacity}`;
        cursorRef.current.style.transform = `translate3d(${smoothX - ringSize / 2}px, ${smoothY - ringSize / 2}px, 0)`;
        cursorRef.current.style.width = `${ringSize}px`;
        cursorRef.current.style.height = `${ringSize}px`;
      }

      // State-to-color mapping
      let stateColor = '#3b82f6'; // POINTING blue
      if (rotateMode || gestureState === 'PALM_ROTATE') {
        stateColor = '#f59e0b'; // PALM_ROTATE amber
      } else if (
        gestureState === 'PINCH_START' ||
        gestureState === 'PINCH_HOLD' ||
        gestureState === 'PINCH_RELEASE'
      ) {
        stateColor = '#22c55e'; // PINCH green
      }

      if (cursorRingRef.current) {
        cursorRingRef.current.style.width = `${ringSize}px`;
        cursorRingRef.current.style.height = `${ringSize}px`;
        cursorRingRef.current.style.borderColor = stateColor;
      }

      if (cursorDotRef.current) {
        cursorDotRef.current.style.width = `${dotSize}px`;
        cursorDotRef.current.style.height = `${dotSize}px`;
        cursorDotRef.current.style.backgroundColor = stateColor;
      }

      if (rotateIconRef.current) {
        rotateIconRef.current.style.display =
          rotateMode || gestureState === 'PALM_ROTATE' ? 'flex' : 'none';
      }

      // Dwell progress circle for PINCH_START / PINCH_HOLD
      if (dwellArcRef.current) {
        if (gestureState === 'PINCH_HOLD' || gestureState === 'PINCH_START') {
          if (!dwellStart) dwellStart = now;
          const dwellProgress = Math.min(1, (now - dwellStart) / 500);
          const circumference = 2 * Math.PI * (ringSize / 2 - 2);
          dwellArcRef.current.style.stroke = stateColor;
          dwellArcRef.current.style.strokeDasharray = `${circumference}`;
          dwellArcRef.current.style.strokeDashoffset = `${circumference * (1 - dwellProgress)}`;
          dwellArcRef.current.style.display = 'block';
        } else {
          dwellStart = 0;
          dwellArcRef.current.style.display = 'none';
        }
      }

      // Tooltip for 3D hovered component
      if (tooltipRef.current) {
        if (hoveredComponentName && currentOpacity > 0.2) {
          tooltipRef.current.textContent = hoveredComponentName;
          tooltipRef.current.style.display = 'block';
          tooltipRef.current.style.transform = `translate3d(${smoothX + ringSize / 2 + 8}px, ${smoothY - 12}px, 0)`;
        } else {
          tooltipRef.current.style.display = 'none';
        }
      }

      // Fading trail on canvas (8 positions)
      if (trailCanvasRef.current) {
        const ctx = trailCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          if (currentOpacity > 0.1 && cursorVisible) {
            trailPoints.unshift({ x: smoothX, y: smoothY, alpha: currentOpacity * 0.6 });
            if (trailPoints.length > MAX_TRAIL) trailPoints.pop();

            for (let i = 0; i < trailPoints.length; i++) {
              const pt = trailPoints[i];
              const progress = i / MAX_TRAIL;
              const radius = Math.max(2, (dotSize / 2) * (1 - progress * 0.7));
              const alpha = pt.alpha * (1 - progress);

              ctx.beginPath();
              ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
              ctx.fillStyle =
                stateColor === '#22c55e'
                  ? `rgba(34, 197, 94, ${alpha})`
                  : stateColor === '#f59e0b'
                  ? `rgba(245, 158, 11, ${alpha})`
                  : `rgba(59, 130, 246, ${alpha})`;
              ctx.fill();
            }
          } else {
            trailPoints.length = 0;
          }
        }
      }

      // Mini-map updates
      if (miniMapRef.current) {
        if (miniMapVisible && cameraOn) {
          miniMapRef.current.style.display = 'block';
          const pos = rawCursor || cursor;
          if (pos && detected) {
            const mapW = 120;
            const mapH = 90;
            const dotX = Math.max(4, Math.min(mapW - 8, pos.x * mapW));
            const dotY = Math.max(4, Math.min(mapH - 8, pos.y * mapH));

            if (miniMapDotRef.current) {
              miniMapDotRef.current.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;
              miniMapDotRef.current.style.opacity = '1';
            }

            // Check if near edge (within 8% = 0.08 of bounds)
            const nearEdge = pos.x < 0.08 || pos.x > 0.92 || pos.y < 0.08 || pos.y > 0.92;
            if (miniMapBoxRef.current) {
              miniMapBoxRef.current.style.borderColor = nearEdge ? '#f59e0b' : 'rgba(59, 130, 246, 0.4)';
              miniMapBoxRef.current.style.boxShadow = nearEdge
                ? '0 0 8px rgba(245, 158, 11, 0.5)'
                : 'none';
            }
          } else {
            if (miniMapDotRef.current) miniMapDotRef.current.style.opacity = '0.3';
            if (miniMapBoxRef.current) {
              miniMapBoxRef.current.style.borderColor = 'rgba(100, 116, 139, 0.4)';
              miniMapBoxRef.current.style.boxShadow = 'none';
            }
          }
        } else {
          miniMapRef.current.style.display = 'none';
        }
      }

      // UI Hover Feedback & Synthetic Click (throttled to 20 per second = 50ms)
      if (now - lastHoverCheck >= 50 && cursor && detected && cameraOn) {
        lastHoverCheck = now;
        const targetElement = document.elementFromPoint(targetX, targetY) as HTMLElement | null;

        if (targetElement !== hoveredElement) {
          if (hoveredElement) {
            hoveredElement.removeAttribute('data-gesture-hover');
          }
          if (targetElement && !targetElement.classList.contains('pointer-events-none')) {
            targetElement.setAttribute('data-gesture-hover', 'true');
            hoveredElement = targetElement;
          } else {
            hoveredElement = null;
          }
        }

        // On PINCH_RELEASE, click the element under pointer
        if (
          gestureState === 'PINCH_RELEASE' &&
          previousGestureState !== 'PINCH_RELEASE' &&
          hoveredElement
        ) {
          hoveredElement.click();
        }
      }

      previousGestureState = gestureState;
      animId = requestAnimationFrame(render);
    };

    // Resize canvas on window resize
    const handleResize = () => {
      if (trailCanvasRef.current) {
        trailCanvasRef.current.width = window.innerWidth;
        trailCanvasRef.current.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (hoveredElement) hoveredElement.removeAttribute('data-gesture-hover');
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none"
    >
      {/* Background canvas for high-perf trail */}
      <canvas ref={trailCanvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Main Cursor Element */}
      <div
        ref={cursorRef}
        className="absolute top-0 left-0 pointer-events-none flex items-center justify-center will-change-transform"
        style={{ opacity: 0 }}
      >
        {/* Outer 36px ring in white with 2px dark outline and soft shadow */}
        <div
          ref={cursorRingRef}
          className="absolute rounded-full border-2 transition-colors duration-150"
          style={{
            borderColor: '#3b82f6',
            boxShadow: '0 0 0 2px #0f172a, 0 4px 12px rgba(0, 0, 0, 0.45)',
          }}
        />

        {/* Center bright accent dot */}
        <div
          ref={cursorDotRef}
          className="absolute rounded-full shadow-md transition-colors duration-150"
          style={{
            backgroundColor: '#3b82f6',
            boxShadow: '0 0 0 1px #0f172a',
          }}
        />

        {/* Circular Dwell SVG Arc for Pinch */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
          <circle
            ref={dwellArcRef}
            cx="50%"
            cy="50%"
            r="16"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="transition-all"
            style={{ display: 'none' }}
          />
        </svg>

        {/* Rotate indicator icon */}
        <div
          ref={rotateIconRef}
          className="absolute -top-6 items-center justify-center p-1 rounded-full bg-slate-900/90 text-amber-400 border border-amber-500/40 shadow-lg text-[10px]"
          style={{ display: 'none' }}
        >
          <RotateCcw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
        </div>
      </div>

      {/* Tooltip for hovered 3D part */}
      <div
        ref={tooltipRef}
        className="absolute top-0 left-0 pointer-events-none px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-100 border border-blue-500/50 shadow-xl transition-opacity duration-150 will-change-transform"
        style={{
          display: 'none',
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
        }}
      />

      {/* "Show your hand" Hint Chip when hand is lost */}
      <div
        ref={hintRef}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full border border-slate-700 shadow-2xl text-xs font-medium text-slate-300 transition-opacity duration-300"
        style={{
          opacity: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        }}
      >
        <Hand size={14} className="text-blue-400 animate-pulse" />
        <span>Show your hand to the camera to interact</span>
      </div>

      {/* Small Hand Mini-Map in bottom-left (120x90px) */}
      <div
        ref={miniMapRef}
        className="absolute bottom-4 left-4 w-[120px] h-[90px] rounded-lg border border-slate-800 p-1 pointer-events-none shadow-xl transition-all"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          display: 'none',
        }}
      >
        <div className="text-[9px] font-mono text-slate-400 font-semibold mb-0.5 flex justify-between px-1">
          <span>CAMERA</span>
          <span className="text-blue-400">TRACK</span>
        </div>
        {/* Comfortable Zone Border */}
        <div
          ref={miniMapBoxRef}
          className="relative w-full h-[68px] rounded border border-blue-500/40 bg-slate-900/60 transition-all duration-150 overflow-hidden"
        >
          {/* Edge warning indicators (8% threshold guide) */}
          <div className="absolute inset-[8%] rounded-sm border border-dashed border-slate-600/40 pointer-events-none" />
          {/* Hand position dot */}
          <div
            ref={miniMapDotRef}
            className="absolute top-0 left-0 w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)] will-change-transform -translate-x-1 -translate-y-1"
          />
        </div>
      </div>
    </div>
  );
};
