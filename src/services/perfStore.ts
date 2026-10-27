import * as THREE from 'three';

export interface PerfMetrics {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  jsHeapMb: number | null;
  reactCommitsPerSec: number;
}

class PerfStore {
  private isOpen = false;
  private listeners = new Set<(isOpen: boolean) => void>();
  private metricsListeners = new Set<(m: PerfMetrics) => void>();

  private commitCountInSecond = 0;
  private lastCommitReset = performance.now();
  private commitsPerSec = 0;

  private frameTimes: number[] = [];
  private lastFrameTimestamp = performance.now();

  public currentMetrics: PerfMetrics = {
    fps: 60,
    frameTimeMs: 16.6,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    jsHeapMb: null,
    reactCommitsPerSec: 0,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        // Toggle on 'P' or 'p' when not focused in an input
        if (
          (e.key === 'p' || e.key === 'P') &&
          !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
        ) {
          this.toggle();
        }
      });
    }
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public toggle(force?: boolean): void {
    this.isOpen = typeof force === 'boolean' ? force : !this.isOpen;
    this.listeners.forEach((fn) => fn(this.isOpen));
  }

  public subscribeOpen(fn: (isOpen: boolean) => void): () => void {
    this.listeners.add(fn);
    fn(this.isOpen);
    return () => this.listeners.delete(fn);
  }

  public recordReactCommit(): void {
    this.commitCountInSecond++;
    const now = performance.now();
    if (now - this.lastCommitReset >= 1000) {
      this.commitsPerSec = Math.round(
        (this.commitCountInSecond * 1000) / (now - this.lastCommitReset)
      );
      this.commitCountInSecond = 0;
      this.lastCommitReset = now;
      this.currentMetrics.reactCommitsPerSec = this.commitsPerSec;
    }
  }

  public updateThreeMetrics(gl: THREE.WebGLRenderer, delta: number): void {
    const now = performance.now();
    const frameDelta = now - this.lastFrameTimestamp;
    this.lastFrameTimestamp = now;

    this.frameTimes.push(frameDelta);
    if (this.frameTimes.length > 30) {
      this.frameTimes.shift();
    }

    const avgFrameTime =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = Math.round(1000 / Math.max(1, avgFrameTime));

    const heap = (performance as any)?.memory?.usedJSHeapSize;
    const jsHeapMb = heap ? Math.round((heap / (1024 * 1024)) * 10) / 10 : null;

    // Read webgl renderer info
    const info = gl.info;
    this.currentMetrics = {
      fps,
      frameTimeMs: Math.round(avgFrameTime * 10) / 10,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      jsHeapMb,
      reactCommitsPerSec: this.commitsPerSec,
    };

    // Also check commit timer reset if no commits happen
    if (now - this.lastCommitReset >= 1000) {
      this.commitsPerSec = this.commitCountInSecond;
      this.commitCountInSecond = 0;
      this.lastCommitReset = now;
      this.currentMetrics.reactCommitsPerSec = this.commitsPerSec;
    }

    this.metricsListeners.forEach((fn) => fn(this.currentMetrics));
  }

  public subscribeMetrics(fn: (m: PerfMetrics) => void): () => void {
    this.metricsListeners.add(fn);
    return () => this.metricsListeners.delete(fn);
  }
}

export const perfStore = new PerfStore();
