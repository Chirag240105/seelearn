/**
 * SeeLearn Assembly Template Data Models & Type Definitions
 * Grounded 3D Engineering Knowledge Representation
 */

export type ConnectionType = 'power' | 'signal' | 'mechanical';

export type SubsystemType = 
  | 'structural'
  | 'propulsion'
  | 'power'
  | 'flight_control'
  | 'avionics_rf'
  | 'imaging'
  | 'chassis'
  | 'actuation'
  | 'sensing';

export interface MeshPrimitiveConfig {
  type: 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'group' | 'compound';
  dimensions: [number, number, number]; // [x, y, z] or [radiusTop, radiusBottom, height] or [radius, tube, radialSegments]
  rotation?: [number, number, number];  // Euler angles in radians
  offset?: [number, number, number];
  color?: string;
  wireframe?: boolean;
  opacity?: number;
  subMeshes?: Array<{
    type: 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus';
    dimensions: [number, number, number];
    offset: [number, number, number];
    rotation?: [number, number, number];
    color?: string;
  }>;
}

export interface AssemblyComponent {
  id: string;
  name: string;
  subsystem: SubsystemType;
  mesh: MeshPrimitiveConfig;
  position: [number, number, number]; // [x, y, z] default resting coordinate in 3D scene space
  explodedOffset: [number, number, number]; // Offset vector when exploded view is engaged
  rotation?: [number, number, number];
  short_description: string;
  detailed_description: string;
  inputs: string[];
  outputs: string[];
  why_needed: string;
  specs?: Record<string, string>;
  operationalBehavior?: {
    type: 'rotor' | 'led_blink' | 'sensor_ping' | 'power_flow' | 'camera_fov';
    spinDirection?: 'cw' | 'ccw';
    rpmMax?: number;
    colorIndicator?: string;
  };
}

export interface AssemblyConnection {
  id: string;
  from: string; // Component ID
  to: string;   // Component ID
  type: ConnectionType;
  label: string;
  description: string;
  specs?: string; // e.g. "DShot600, 600kbit/s digital pulse", "22.2V DC, up to 150A burst"
  waypoints?: [number, number, number][]; // Optional intermediate 3D spline points
}

export interface AssemblyStep {
  step: number;
  title: string;
  description: string;
  componentIds: string[];
  toolsRequired: string[];
  safetyNotes?: string;
}

export interface MechanismExplanation {
  id: string;
  name: string;
  summary: string;
  componentsInvolved: string[];
  physicsPrinciple: string;
  howItWorks: string;
  conceptualDisclaimer?: string;
}

export interface WhatIfExperiment {
  id: string;
  title: string;
  hypothesisPrompt: string; // What the user must predict before running
  componentId: string;
  modificationType: 'disable' | 'reverse' | 'disconnect' | 'overheat';
  predictionOptions: string[];
  correctPredictionIndex: number;
  observationSummary: string;
  engineeringExplanation: string;
  recoveryAction: string;
}

export interface AssemblyTemplate {
  id: string;
  name: string;
  category: string;
  tagline: string;
  cameraDefaultPosition: [number, number, number];
  cameraTarget: [number, number, number];
  components: AssemblyComponent[];
  connections: AssemblyConnection[];
  assembly_steps: AssemblyStep[];
  mechanisms: MechanismExplanation[];
  experiments: WhatIfExperiment[];
  notes: {
    fidelity: 'engineering-accurate' | 'data-only-stub';
    isConceptualDemonstrator: boolean;
    simplifications: string[];
    safetyDisclaimer: string;
  };
}

export interface TemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    componentCount: number;
    connectionCount: number;
    powerConnections: number;
    signalConnections: number;
    mechanicalConnections: number;
    stepsCount: number;
    experimentsCount: number;
  };
}
