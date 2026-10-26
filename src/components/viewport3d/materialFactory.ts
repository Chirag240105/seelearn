import * as THREE from 'three';
import { MaterialPreset } from '../../types/sceneSpec';

export interface MaterialStyleOptions {
  viewMode?: 'solid' | 'xray' | 'exploded';
  isSelected?: boolean;
  isHovered?: boolean;
  isDimmed?: boolean; // when another component is selected (dimmed to ~40%)
  isEmissiveBlink?: boolean;
}

// Color and physical property definitions for the 17 allowed presets
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
  }
> = {
  carbon_fiber: {
    color: '#1a1f26',
    roughness: 0.35,
    metalness: 0.2,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
  },
  brushed_metal: {
    color: '#94a3b8',
    roughness: 0.45,
    metalness: 0.85,
  },
  polished_metal: {
    color: '#e2e8f0',
    roughness: 0.1,
    metalness: 0.95,
    clearcoat: 0.55,
    clearcoatRoughness: 0.12,
  },
  gold: {
    color: '#eab308',
    roughness: 0.2,
    metalness: 0.9,
  },
  copper: {
    color: '#f97316',
    roughness: 0.3,
    metalness: 0.85,
  },
  aluminum_heatsink: {
    color: '#64748b',
    roughness: 0.35,
    metalness: 0.7,
  },
  pcb_green: {
    color: '#15803d',
    roughness: 0.6,
    metalness: 0.15,
  },
  pcb_black: {
    color: '#0f172a',
    roughness: 0.7,
    metalness: 0.2,
  },
  silicon_die: {
    color: '#334155',
    roughness: 0.3,
    metalness: 0.35,
  },
  ceramic: {
    color: '#e2e8f0',
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
  },
  black_plastic: {
    color: '#18181b',
    roughness: 0.6,
    metalness: 0.05,
  },
  white_plastic: {
    color: '#f8fafc',
    roughness: 0.5,
    metalness: 0.05,
  },
  rubber: {
    color: '#27272a',
    roughness: 0.95,
    metalness: 0.0,
  },
  glass: {
    color: '#e0f2fe',
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.85,
    ior: 1.5,
    transparent: true,
    opacity: 0.6,
  },
  smoked_glass: {
    color: '#334155',
    roughness: 0.15,
    metalness: 0.2,
    transmission: 0.65,
    ior: 1.5,
    transparent: true,
    opacity: 0.7,
  },
  translucent_blue: {
    color: '#0ea5e9',
    roughness: 0.25,
    metalness: 0.1,
    transmission: 0.7,
    ior: 1.45,
    transparent: true,
    opacity: 0.7,
    emissive: '#0284c7',
    emissiveIntensity: 0.2,
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
 * Creates or adjusts a Three.js material based on preset and active interaction states.
 * Enforces controlled emissive intensities (max 0.35) and clean dimmed/selected states.
 */
export function createPartMaterial(preset: MaterialPreset, options: MaterialStyleOptions = {}): THREE.Material {
  const cfg = PRESET_CONFIGS[preset] || PRESET_CONFIGS.aluminum_heatsink;
  const { viewMode = 'solid', isSelected, isHovered, isDimmed, isEmissiveBlink } = options;

  let baseColor = new THREE.Color(cfg.color);
  let emissiveColor = cfg.emissive ? new THREE.Color(cfg.emissive) : new THREE.Color(0x000000);
  let emissiveIntensity = Math.min(cfg.emissiveIntensity || 0, 0.35);
  let opacity = cfg.opacity ?? 1.0;
  let transparent = cfg.transparent ?? false;
  let wireframe = false;

  // Selected state: clear outline and subtle accent glow (capped <= 0.35)
  if (isSelected) {
    baseColor = baseColor.clone().lerp(new THREE.Color('#38bdf8'), 0.25);
    emissiveColor = new THREE.Color('#0284c7');
    emissiveIntensity = 0.35;
    opacity = cfg.transparent ? Math.max(opacity, 0.85) : 1.0;
    transparent = Boolean(cfg.transparent);
  } else if (isHovered) {
    // Hover state: soft gentle glow
    baseColor = baseColor.clone().lerp(new THREE.Color('#93c5fd'), 0.18);
    emissiveColor = new THREE.Color('#0369a1');
    emissiveIntensity = 0.2;
  } else if (isDimmed) {
    // Other parts dimmed to ~40% opacity/tone
    baseColor = baseColor.clone().lerp(new THREE.Color('#0f172a'), 0.5);
    opacity = cfg.transparent ? (cfg.opacity ?? 0.6) * 0.4 : 0.4;
    transparent = true;
    emissiveIntensity = 0;
  }

  // X-Ray Mode: ghosted fresnel shells, cyan edges, internals visible
  if (viewMode === 'xray') {
    transparent = true;
    opacity = isSelected ? 0.75 : 0.28;
    wireframe = false;
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

  const MaterialClass =
    cfg.clearcoat !== undefined || cfg.transmission !== undefined
      ? THREE.MeshPhysicalMaterial
      : THREE.MeshStandardMaterial;

  const mat = new MaterialClass({
    color: baseColor,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    transparent,
    opacity,
    emissive: emissiveColor,
    emissiveIntensity,
    wireframe,
    depthWrite: !transparent || opacity >= 0.75,
    ...(MaterialClass === THREE.MeshPhysicalMaterial
      ? {
          transmission: cfg.transmission ?? 0,
          ior: cfg.ior ?? 1.5,
          clearcoat: cfg.clearcoat ?? 0,
          clearcoatRoughness: cfg.clearcoatRoughness ?? 0.1,
          thickness: cfg.transmission ? 0.3 : 0,
        }
      : {}),
  });

  return mat;
}
