import * as THREE from 'three';
import { MaterialPreset } from '../../types/sceneSpec';

export interface MaterialStyleOptions {
  viewMode?: 'solid' | 'xray' | 'exploded';
  isSelected?: boolean;
  isHovered?: boolean;
  isDimmed?: boolean; // when another component is selected
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
    roughness: 0.15,
    metalness: 0.75,
    clearcoat: 0.8,
  },
  ceramic: {
    color: '#e2e8f0',
    roughness: 0.85,
    metalness: 0.05,
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
    emissiveIntensity: 0.25,
  },
  led_emissive: {
    color: '#38bdf8',
    roughness: 0.1,
    metalness: 0.1,
    emissive: '#38bdf8',
    emissiveIntensity: 2.5,
  },
};

export function getPresetColor(preset: MaterialPreset): string {
  return PRESET_CONFIGS[preset]?.color || '#64748b';
}

/**
 * Creates or adjusts a Three.js material based on preset and active interaction states
 */
export function createPartMaterial(preset: MaterialPreset, options: MaterialStyleOptions = {}): THREE.Material {
  const cfg = PRESET_CONFIGS[preset] || PRESET_CONFIGS.aluminum_heatsink;
  const { viewMode = 'solid', isSelected, isHovered, isDimmed, isEmissiveBlink } = options;

  let baseColor = new THREE.Color(cfg.color);
  let emissiveColor = cfg.emissive ? new THREE.Color(cfg.emissive) : new THREE.Color(0x000000);
  let emissiveIntensity = cfg.emissiveIntensity || 0;
  let opacity = cfg.opacity ?? 1.0;
  let transparent = cfg.transparent ?? false;
  let wireframe = false;

  // Selected state: bright cyan/blue outline glow
  if (isSelected) {
    baseColor = baseColor.clone().lerp(new THREE.Color('#38bdf8'), 0.35);
    emissiveColor = new THREE.Color('#0284c7');
    emissiveIntensity = Math.max(emissiveIntensity, 0.6);
    opacity = 1.0;
    transparent = false;
  } else if (isHovered) {
    // Hover state: soft sky-blue edge glow
    baseColor = baseColor.clone().lerp(new THREE.Color('#7dd3fc'), 0.2);
    emissiveColor = new THREE.Color('#0369a1');
    emissiveIntensity = Math.max(emissiveIntensity, 0.3);
  } else if (isDimmed) {
    // Another component is focused: dim non-selected to ~35% opacity
    opacity = Math.min(opacity, 0.35);
    transparent = true;
  }

  // X-Ray Mode
  if (viewMode === 'xray') {
    transparent = true;
    opacity = isSelected ? 0.8 : 0.25;
    wireframe = !isSelected;
    if (!isSelected) {
      baseColor = new THREE.Color('#38bdf8');
      emissiveColor = new THREE.Color('#0284c7');
      emissiveIntensity = 0.2;
    }
  }

  // Emissive blink for mechanisms
  if (isEmissiveBlink) {
    emissiveIntensity = 3.0;
    emissiveColor = new THREE.Color('#38bdf8');
  }

  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    transparent,
    opacity,
    emissive: emissiveColor,
    emissiveIntensity,
    wireframe,
  });

  return mat;
}
