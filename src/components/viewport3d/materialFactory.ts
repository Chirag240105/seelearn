import * as THREE from 'three';
import { MaterialPreset } from '../../types/sceneSpec';

export interface MaterialStyleOptions {
  viewMode?: 'solid' | 'xray' | 'exploded';
  isSelected?: boolean;
  isHovered?: boolean;
  isDimmed?: boolean; // when another component is selected (dimmed to ~40%)
  isEmissiveBlink?: boolean;
  isMotorBell?: boolean;
}

// Procedural texture caches so canvases are generated once and shared
let carbonTextureCache: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
let pcbTextureCache: Record<string, { roughness: THREE.CanvasTexture; bump: THREE.CanvasTexture }> = {};
let brushedTextureCache: THREE.CanvasTexture | null = null;
let microNoiseTextureCache: THREE.CanvasTexture | null = null;

// Material cache to prevent duplicate allocations
const materialCache = new Map<string, THREE.Material>();

export function clearMaterialCache(): void {
  materialCache.forEach((mat) => mat.dispose());
  materialCache.clear();
}

/**
 * Procedural twill weave texture for carbon fiber
 * Simulates real 2x2 3k carbon fiber twill weave with specular and normal depth
 */
function getCarbonFiberTextures() {
  if (carbonTextureCache) return carbonTextureCache;
  if (typeof document === 'undefined') return { map: null as any, normal: null as any };

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;

  const imgData = ctx.createImageData(size, size);
  const nData = nCtx.createImageData(size, size);

  const tileSize = 16; // 8x8 weave blocks
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const bx = Math.floor(x / tileSize);
      const by = Math.floor(y / tileSize);
      const isHorizontal = ((bx + by) % 2) === 0;

      // Thread striation
      const local = isHorizontal ? (y % tileSize) / tileSize : (x % tileSize) / tileSize;
      const threadCurvature = Math.sin(local * Math.PI);
      const microFiber = (Math.sin((isHorizontal ? y : x) * 2.5) + 1) * 0.1;

      // Base carbon color: deep graphite with subtle thread sheen
      const baseTone = 24 + Math.round(threadCurvature * 22 + microFiber * 15);
      imgData.data[idx] = baseTone;
      imgData.data[idx + 1] = baseTone + 2;
      imgData.data[idx + 2] = baseTone + 5;
      imgData.data[idx + 3] = 255;

      // Normal map generation (tangent space normal: R=X, G=Y, B=Z)
      const nx = isHorizontal ? 0 : Math.cos(local * Math.PI) * 0.4;
      const ny = isHorizontal ? Math.cos(local * Math.PI) * 0.4 : 0;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      nData.data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      nData.data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      nData.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      nData.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  nCtx.putImageData(nData, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 4);

  const normal = new THREE.CanvasTexture(normalCanvas);
  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(4, 4);

  carbonTextureCache = { map, normal };
  return carbonTextureCache;
}

/**
 * Procedural PCB soldermask roughness & trace map
 */
function getPcbTextures(isGreen: boolean) {
  const key = isGreen ? 'green' : 'black';
  if (pcbTextureCache[key]) return pcbTextureCache[key];
  if (typeof document === 'undefined') return { roughness: null as any, bump: null as any };

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Background: matte soldermask (high roughness)
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, size, size);

  // Draw orthogonal copper traces (smooth, low roughness ~#303030)
  ctx.strokeStyle = '#303030';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const seededTraces = [
    [[16, 32], [64, 32], [96, 64], [160, 64]],
    [[32, 120], [80, 120], [120, 160], [200, 160]],
    [[180, 40], [210, 70], [210, 180], [240, 210]],
    [[50, 200], [90, 200], [130, 240]],
    [[140, 90], [170, 90], [190, 110], [190, 140]],
  ];

  seededTraces.forEach((pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
  });

  // Draw IC landing pads & surface mount pads
  ctx.fillStyle = '#202020';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(36 + i * 16, 75, 8, 14);
    ctx.fillRect(36 + i * 16, 95, 8, 14);
  }
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(150 + i * 18, 110, 10, 10);
  }

  const roughness = new THREE.CanvasTexture(canvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(2, 2);

  pcbTextureCache[key] = { roughness, bump: roughness };
  return pcbTextureCache[key];
}

/**
 * Procedural brushed metal / aluminum striation bump map
 */
function getBrushedMetalTexture() {
  if (brushedTextureCache) return brushedTextureCache;
  if (typeof document === 'undefined') return null;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const imgData = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const rowNoise = (Math.sin(y * 12.0) + Math.cos(y * 31.0)) * 0.5;
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const grain = Math.floor(128 + rowNoise * 35 + (Math.random() - 0.5) * 20);
      imgData.data[idx] = grain;
      imgData.data[idx + 1] = grain;
      imgData.data[idx + 2] = grain;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  brushedTextureCache = texture;
  return texture;
}

/**
 * Micro-surface noise texture for random roughness variation
 */
function getMicroNoiseTexture() {
  if (microNoiseTextureCache) return microNoiseTextureCache;
  if (typeof document === 'undefined') return null;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const val = Math.floor(128 + (Math.random() - 0.5) * 45);
    imgData.data[i * 4] = val;
    imgData.data[i * 4 + 1] = val;
    imgData.data[i * 4 + 2] = val;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  microNoiseTextureCache = texture;
  return texture;
}

// Preset physical properties tuned for real industrial design
const PRESET_CONFIGS: Record<
  MaterialPreset,
  {
    color: string;
    roughness: number;
    metalness: number;
    transmission?: number;
    ior?: number;
    transparent?: boolean;
    opacity?: number;
    emissive?: string;
    emissiveIntensity?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    anisotropy?: number;
  }
> = {
  carbon_fiber: {
    color: '#1a1f26',
    roughness: 0.35,
    metalness: 0.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  },
  brushed_metal: {
    color: '#94a3b8',
    roughness: 0.35,
    metalness: 1.0,
    anisotropy: 0.85,
    clearcoat: 0.1,
  },
  polished_metal: {
    color: '#e2e8f0',
    roughness: 0.12,
    metalness: 0.98,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  },
  gold: {
    color: '#eab308',
    roughness: 0.3,
    metalness: 1.0,
    clearcoat: 0.2,
  },
  copper: {
    color: '#c2581f',
    roughness: 0.28,
    metalness: 0.95,
    clearcoat: 0.15,
  },
  aluminum_heatsink: {
    color: '#64748b',
    roughness: 0.35,
    metalness: 1.0,
    anisotropy: 0.7,
  },
  pcb_green: {
    color: '#14532d',
    roughness: 0.55,
    metalness: 0.1,
    clearcoat: 0.2,
  },
  pcb_black: {
    color: '#0f172a',
    roughness: 0.55,
    metalness: 0.1,
    clearcoat: 0.2,
  },
  silicon_die: {
    color: '#1e293b',
    roughness: 0.25,
    metalness: 0.45,
    clearcoat: 0.7,
    clearcoatRoughness: 0.1,
  },
  ceramic: {
    color: '#f1f5f9',
    roughness: 0.25,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  },
  black_plastic: {
    color: '#18181b',
    roughness: 0.7,
    metalness: 0.0,
  },
  white_plastic: {
    color: '#f8fafc',
    roughness: 0.7,
    metalness: 0.0,
  },
  rubber: {
    color: '#27272a',
    roughness: 0.7,
    metalness: 0.0,
  },
  glass: {
    color: '#e0f2fe',
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.88,
    ior: 1.45,
    transparent: true,
    opacity: 0.65,
  },
  smoked_glass: {
    color: '#1e293b',
    roughness: 0.12,
    metalness: 0.15,
    transmission: 0.68,
    ior: 1.45,
    transparent: true,
    opacity: 0.75,
  },
  translucent_blue: {
    color: '#0284c7',
    roughness: 0.2,
    metalness: 0.08,
    transmission: 0.75,
    ior: 1.45,
    transparent: true,
    opacity: 0.72,
    emissive: '#0369a1',
    emissiveIntensity: 0.18,
  },
  led_emissive: {
    color: '#38bdf8',
    roughness: 0.1,
    metalness: 0.1,
    emissive: '#38bdf8',
    emissiveIntensity: 0.35, // Capped at 0.35 per spec (no blown-out glow)
    clearcoat: 0.35,
    clearcoatRoughness: 0.12,
  },
};

export function getPresetColor(preset: MaterialPreset): string {
  return PRESET_CONFIGS[preset]?.color || '#64748b';
}

/**
 * Creates high-fidelity MeshPhysicalMaterial tuned per preset with procedural maps
 */
export function createPartMaterial(preset: MaterialPreset, options: MaterialStyleOptions = {}): THREE.Material {
  const { viewMode = 'solid', isSelected, isHovered, isDimmed, isEmissiveBlink, isMotorBell } = options;

  const cacheKey = `${preset}_${viewMode}_${Boolean(isSelected)}_${Boolean(isHovered)}_${Boolean(isDimmed)}_${Boolean(isEmissiveBlink)}_${Boolean(isMotorBell)}`;
  if (materialCache.has(cacheKey)) {
    return materialCache.get(cacheKey)!;
  }

  const cfg = PRESET_CONFIGS[preset] || PRESET_CONFIGS.aluminum_heatsink;

  let baseColor = new THREE.Color(cfg.color);

  // Subtle anodized titanium/blue tint for motor bells
  if (isMotorBell && (preset === 'brushed_metal' || preset === 'aluminum_heatsink')) {
    baseColor = baseColor.clone().lerp(new THREE.Color('#384c66'), 0.35);
  }

  let emissiveColor = cfg.emissive ? new THREE.Color(cfg.emissive) : new THREE.Color(0x000000);
  let emissiveIntensity = Math.min(cfg.emissiveIntensity || 0, 0.35);
  let opacity = cfg.opacity ?? 1.0;
  let transparent = cfg.transparent ?? false;

  // Selected state: clear accent outline with soft glow
  if (isSelected) {
    baseColor = baseColor.clone().lerp(new THREE.Color('#38bdf8'), 0.25);
    emissiveColor = new THREE.Color('#0284c7');
    emissiveIntensity = 0.35;
    opacity = cfg.transparent ? Math.max(opacity, 0.85) : 1.0;
    transparent = Boolean(cfg.transparent);
  } else if (isHovered) {
    // Hover state: gentle highlight
    baseColor = baseColor.clone().lerp(new THREE.Color('#93c5fd'), 0.15);
    emissiveColor = new THREE.Color('#0369a1');
    emissiveIntensity = 0.2;
  } else if (isDimmed) {
    // Other parts dimmed to ~40% opacity/tone
    baseColor = baseColor.clone().lerp(new THREE.Color('#0f172a'), 0.55);
    opacity = cfg.transparent ? (cfg.opacity ?? 0.6) * 0.4 : 0.4;
    transparent = true;
    emissiveIntensity = 0;
  }

  // X-Ray Mode: ghosted fresnel shells, cyan tone, internals visible
  if (viewMode === 'xray') {
    transparent = true;
    opacity = isSelected ? 0.75 : 0.28;
    if (!isSelected) {
      baseColor = new THREE.Color('#06b6d4');
      emissiveColor = new THREE.Color('#0891b2');
      emissiveIntensity = 0.12;
    }
  }

  // Emissive blink for mechanisms (capped at 0.35)
  if (isEmissiveBlink) {
    emissiveIntensity = 0.35;
    emissiveColor = new THREE.Color('#38bdf8');
  }

  // Procedural texture maps
  let map: THREE.Texture | null = null;
  let normalMap: THREE.Texture | null = null;
  let roughnessMap: THREE.Texture | null = null;
  let bumpMap: THREE.Texture | null = null;

  if (preset === 'carbon_fiber' && viewMode !== 'xray') {
    const carbonTex = getCarbonFiberTextures();
    if (carbonTex.map) map = carbonTex.map;
    if (carbonTex.normal) normalMap = carbonTex.normal;
  } else if ((preset === 'pcb_black' || preset === 'pcb_green') && viewMode !== 'xray') {
    const pcbTex = getPcbTextures(preset === 'pcb_green');
    if (pcbTex.roughness) roughnessMap = pcbTex.roughness;
  } else if ((preset === 'brushed_metal' || preset === 'aluminum_heatsink') && viewMode !== 'xray') {
    const brushedTex = getBrushedMetalTexture();
    if (brushedTex) bumpMap = brushedTex;
  } else if ((preset === 'black_plastic' || preset === 'rubber') && viewMode !== 'xray') {
    const noiseTex = getMicroNoiseTexture();
    if (noiseTex) bumpMap = noiseTex;
  }

  let mat: THREE.Material;

  if (cfg.transmission && cfg.transmission > 0) {
    // Glass parts: MeshPhysicalMaterial with transmissionResolution 256
    mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      transparent: true,
      opacity,
      transmission: cfg.transmission,
      transmissionResolution: 256,
      ior: cfg.ior ?? 1.5,
      thickness: 0.4,
      depthWrite: !transparent || opacity >= 0.75,
      map: map || undefined,
    });
  } else if (preset === 'carbon_fiber') {
    // Carbon fiber: low clearcoat
    mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      transparent,
      opacity,
      emissive: emissiveColor,
      emissiveIntensity,
      depthWrite: !transparent || opacity >= 0.75,
      clearcoat: 0.4,
      clearcoatRoughness: 0.25,
      map: map || undefined,
      normalMap: normalMap || undefined,
      normalScale: normalMap ? new THREE.Vector2(0.4, 0.4) : undefined,
    });
  } else {
    // Standard high-performance PBR material for all other components
    mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      transparent,
      opacity,
      emissive: emissiveColor,
      emissiveIntensity,
      depthWrite: !transparent || opacity >= 0.75,
      map: map || undefined,
      normalMap: normalMap || undefined,
      normalScale: normalMap ? new THREE.Vector2(0.4, 0.4) : undefined,
      roughnessMap: roughnessMap || undefined,
      bumpMap: bumpMap || undefined,
      bumpScale: bumpMap ? 0.02 : undefined,
    });
  }

  materialCache.set(cacheKey, mat);
  return mat;
}
