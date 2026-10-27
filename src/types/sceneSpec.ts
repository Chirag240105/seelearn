/**
 * SeeLearn Scene Specification Data Types
 * Generic 3D Engineering Model Schema
 */

export type LayoutStyle = 'assembly' | 'board' | 'stack' | 'radial' | 'cross_section';

export type MaterialPreset =
  | 'carbon_fiber'
  | 'brushed_metal'
  | 'polished_metal'
  | 'gold'
  | 'copper'
  | 'aluminum_heatsink'
  | 'pcb_green'
  | 'pcb_black'
  | 'silicon_die'
  | 'ceramic'
  | 'black_plastic'
  | 'white_plastic'
  | 'rubber'
  | 'glass'
  | 'smoked_glass'
  | 'translucent_blue'
  | 'led_emissive';

export type PartShape =
  | 'box'
  | 'roundedBox'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'torus'
  | 'ring'
  | 'tube';

export interface ScenePart {
  shape: PartShape;
  size: number[]; // box: [w, h, d], cylinder: [r, h], sphere: [r], cone: [r, h], torus: [r, tube], ring: [innerR, outerR], tube: [r]
  position: [number, number, number];
  rotation?: [number, number, number]; // in radians
  material: MaterialPreset;
  path?: Array<[number, number, number]>; // tube only
  motionGroup?: string;
  motionCenter?: boolean;
  motionDirection?: number;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SceneComponent {
  id: string; // snake_case, unique
  name: string;
  group: string; // subsystem e.g. "Propulsion", "Logic", "Structure", "Power"
  parts: ScenePart[]; // 1-6 parts per component
  summary: string;
  howItWorks: string;
  whyNeeded: string;
  keyFacts?: string[]; // 0-3 key facts
  confidence: ConfidenceLevel;
  explode?: [number, number, number]; // optional displacement vector
}

export type ConnectionType = 'power' | 'signal' | 'data' | 'mechanical' | 'thermal';

export interface SceneConnection {
  from: string; // component id
  to: string; // component id
  type: ConnectionType;
  label: string;
  description: string;
}

export type MechanismType = 'spin' | 'oscillate' | 'blink';

export interface SceneMechanism {
  id: string;
  name: string;
  type: MechanismType;
  targets: string[]; // component IDs affected
  axis?: [number, number, number]; // e.g. [0, 1, 0] for Y rotation
  speed?: number; // multiplier e.g. 1.0
  direction?: number; // 1 or -1
  explanation?: string;
}

export interface SceneAssemblyStep {
  order: number;
  componentIds: string[];
  instruction: string;
}

export interface SceneExperiment {
  id: string;
  title: string;
  action: 'disable' | 'reverse' | 'remove' | 'overload';
  targets: string[];
  consequence: string;
  explanation: string;
}

export interface SceneSpec {
  schemaVersion: 1;
  topic: string;
  title: string;
  overview: string;
  scaleNote: string;
  layoutStyle: LayoutStyle;
  learningObjectives: string[]; // 3-5 objectives
  components: SceneComponent[]; // 8-30 components
  connections: SceneConnection[];
  mechanisms?: SceneMechanism[];
  assemblySteps?: SceneAssemblyStep[];
  experiments?: SceneExperiment[];
  provider?: string;
}
