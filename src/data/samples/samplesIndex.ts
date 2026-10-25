import { SceneSpec } from '../../types/sceneSpec';
import { validateAndRepairSceneSpec } from '../../utils/specValidator';

import racingDroneData from './racing_drone.json';
import dcMotorData from './dc_motor.json';
import smartphoneData from './smartphone.json';
import ddr5RamData from './ddr5_ram.json';

export interface SampleMeta {
  id: string;
  topic: string;
  title: string;
  subtitle: string;
  tag: string;
  componentCount: number;
  layoutStyle: string;
  spec: SceneSpec;
}

// Validate each sample during module loading
const validatedDrone = validateAndRepairSceneSpec(racingDroneData).spec;
const validatedMotor = validateAndRepairSceneSpec(dcMotorData).spec;
const validatedPhone = validateAndRepairSceneSpec(smartphoneData).spec;
const validatedRam = validateAndRepairSceneSpec(ddr5RamData).spec;

export const BUNDLED_SAMPLES: SampleMeta[] = [
  {
    id: 'racing_drone',
    topic: 'racing drone',
    title: '5" FPV Racing Drone',
    subtitle: 'True-X carbon fiber unibody with 6S brushless motors and FPV avionics',
    tag: 'Aerial Robotics',
    componentCount: validatedDrone.components.length,
    layoutStyle: validatedDrone.layoutStyle,
    spec: validatedDrone,
  },
  {
    id: 'dc_motor',
    topic: 'dc motor',
    title: 'Brushed DC Motor',
    subtitle: 'Cutaway stator, permanent magnets, commutator, and copper rotor windings',
    tag: 'Electromechanics',
    componentCount: validatedMotor.components.length,
    layoutStyle: validatedMotor.layoutStyle,
    spec: validatedMotor,
  },
  {
    id: 'smartphone',
    topic: 'smartphone',
    title: 'Flagship Smartphone',
    subtitle: 'AMOLED display, 4nm SoC, vapor chamber cooling, and 50MP triple camera',
    tag: 'Consumer Tech',
    componentCount: validatedPhone.components.length,
    layoutStyle: validatedPhone.layoutStyle,
    spec: validatedPhone,
  },
  {
    id: 'ddr5_ram',
    topic: 'ddr5 ram',
    title: 'DDR5 Memory Module',
    subtitle: 'High-speed 6400 MT/s DIMM with onboard PMIC, SPD hub, and aluminum spreader',
    tag: 'Semiconductor',
    componentCount: validatedRam.components.length,
    layoutStyle: validatedRam.layoutStyle,
    spec: validatedRam,
  },
];

export const DEFAULT_SAMPLE: SceneSpec = validatedDrone;

export function getSampleByTopic(query: string): SceneSpec | undefined {
  const q = query.toLowerCase().trim();
  if (q.includes('drone') || q.includes('quadcopter') || q.includes('uav')) {
    return validatedDrone;
  }
  if (q.includes('motor') || q.includes('dc motor') || q.includes('electromagnet')) {
    return validatedMotor;
  }
  if (q.includes('phone') || q.includes('smartphone') || q.includes('mobile')) {
    return validatedPhone;
  }
  if (q.includes('ram') || q.includes('memory') || q.includes('ddr5') || q.includes('dimm')) {
    return validatedRam;
  }
  return undefined;
}

export function getSampleById(id: string): SceneSpec | undefined {
  const match = BUNDLED_SAMPLES.find((s) => s.id === id);
  return match ? match.spec : undefined;
}
