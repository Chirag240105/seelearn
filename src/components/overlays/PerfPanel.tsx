import React, { useEffect, useRef, useState } from 'react';
import { perfStore, PerfMetrics } from '../../services/perfStore';
import { Activity, X } from 'lucide-react';

export const PerfPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(perfStore.getIsOpen());

  const fpsRef = useRef<HTMLSpanElement>(null);
  const frameTimeRef = useRef<HTMLSpanElement>(null);
  const callsRef = useRef<HTMLSpanElement>(null);
  const trisRef = useRef<HTMLSpanElement>(null);
  const geomRef = useRef<HTMLSpanElement>(null);
  const texRef = useRef<HTMLSpanElement>(null);
  const heapRef = useRef<HTMLSpanElement>(null);
  const commitsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const unsub = perfStore.subscribeOpen((open) => {
      setIsOpen(open);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let animId: number;
    const updateDom = (m: PerfMetrics) => {
      if (fpsRef.current) {
        fpsRef.current.textContent = `${m.fps}`;
        fpsRef.current.style.color =
          m.fps >= 55 ? '#22c55e' : m.fps >= 45 ? '#eab308' : '#ef4444';
      }
      if (frameTimeRef.current) frameTimeRef.current.textContent = `${m.frameTimeMs} ms`;
      if (callsRef.current) callsRef.current.textContent = `${m.drawCalls}`;
      if (trisRef.current) trisRef.current.textContent = m.triangles.toLocaleString();
      if (geomRef.current) geomRef.current.textContent = `${m.geometries}`;
      if (texRef.current) texRef.current.textContent = `${m.textures}`;
      if (heapRef.current) heapRef.current.textContent = m.jsHeapMb != null ? `${m.jsHeapMb} MB` : 'N/A';
      if (commitsRef.current) {
        commitsRef.current.textContent = `${m.reactCommitsPerSec}/s`;
        commitsRef.current.style.color =
          m.reactCommitsPerSec <= 4 ? '#22c55e' : m.reactCommitsPerSec <= 15 ? '#eab308' : '#ef4444';
      }
    };

    const unsubMetrics = perfStore.subscribeMetrics((metrics) => {
      updateDom(metrics);
    });

    // Initial fill
    updateDom(perfStore.currentMetrics);

    return () => {
      unsubMetrics();
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => perfStore.toggle(true)}
        title="Toggle Performance HUD (Press P)"
        className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono font-medium shadow-md transition-all cursor-pointer opacity-70 hover:opacity-100"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(71, 85, 105, 0.5)',
          color: '#94a3b8',
        }}
      >
        <Activity size={13} className="text-blue-400" />
        <span>PERF (P)</span>
      </button>
    );
  }

  return (
    <div
      className="fixed top-14 right-4 z-50 w-72 rounded-xl border shadow-2xl p-3 text-xs font-mono select-none transition-all"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
        borderColor: 'rgba(71, 85, 105, 0.6)',
        color: '#e2e8f0',
      }}
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-2 font-bold tracking-wider uppercase text-[11px] text-blue-400">
          <Activity size={14} />
          <span>Real-time Perf HUD</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-sans">[P to close]</span>
          <button
            type="button"
            onClick={() => perfStore.toggle(false)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Frame Rate:</span>
          <span ref={fpsRef} className="font-bold text-sm text-green-400">
            60
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Frame Time:</span>
          <span ref={frameTimeRef} className="font-semibold text-slate-200">
            16.6 ms
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Draw Calls:</span>
          <span ref={callsRef} className="font-semibold text-sky-400">
            0
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Triangles:</span>
          <span ref={trisRef} className="font-semibold text-slate-200">
            0
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Geometries:</span>
          <span ref={geomRef} className="font-semibold text-slate-300">
            0
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Textures:</span>
          <span ref={texRef} className="font-semibold text-slate-300">
            0
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">JS Heap:</span>
          <span ref={heapRef} className="font-semibold text-amber-300">
            --
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
          <span className="text-slate-400">React Commits:</span>
          <span ref={commitsRef} className="font-semibold text-green-400">
            0/s
          </span>
        </div>
      </div>
    </div>
  );
};
