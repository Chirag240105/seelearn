import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Edges } from '@react-three/drei';
import { ScenePart } from '../../types/sceneSpec';
import { createPartMaterial, MaterialStyleOptions } from './materialFactory';
import {
  createCarbonArmGeometry,
  createCarbonPlateGeometry,
  createPropellerBladeGeometry,
  createMotorBellGeometry,
  createStatorWindingsGeometry,
  createScrewHeadGeometry,
} from './droneGeometryFactory';

interface ProceduralPartMeshProps {
  part: ScenePart;
  options?: MaterialStyleOptions;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
  onClick?: (e: any) => void;
}

export const ProceduralPartMesh: React.FC<ProceduralPartMeshProps> = ({
  part,
  options = {},
  onPointerOver,
  onPointerOut,
  onClick,
}) => {
  const { shape, size, position, rotation, material, path } = part;

  // Classify part type for specialized industrial CAD geometry
  const partType = useMemo(() => {
    if (shape === 'box') {
      const w = size[0] ?? 1;
      const h = size[1] ?? 1;
      const d = size[2] ?? 1;
      // Propeller blade: long, very thin, moderate chord
      if (w > 1.2 && h <= 0.08 && d <= 0.6 && (material === 'black_plastic' || material === 'rubber')) {
        return 'propeller_blade';
      }
      // Carbon fiber arm: long, thin thickness, arm-like width
      if (
        material === 'carbon_fiber' &&
        ((w / h > 7 && w > 2.5 && d < 1.2) || (d / h > 7 && d > 2.5 && w < 1.2))
      ) {
        return 'carbon_arm';
      }
      // Carbon fiber plate: broad flat plate
      if (material === 'carbon_fiber' && ((w > 1.4 && d > 2.0) || (d > 1.4 && w > 2.0))) {
        return 'carbon_plate';
      }
      return 'box';
    }
    if (shape === 'cylinder') {
      const r = size[0] ?? 0.5;
      const h = size[1] ?? 1;
      // Motor bell: brushed metal cylinder with radius > 0.35
      if (material === 'brushed_metal' && r >= 0.35 && h >= 0.35) {
        return 'motor_bell';
      }
      // Standoff pillar: thin brushed metal cylinder
      if (material === 'brushed_metal' && r <= 0.15 && h >= 0.6) {
        return 'standoff';
      }
      return 'cylinder';
    }
    return shape;
  }, [shape, size, material]);

  // Compute primary geometry based on shape & part type
  const geometry = useMemo(() => {
    try {
      switch (partType) {
        case 'propeller_blade': {
          const length = size[0] ?? 2.05;
          const thickness = size[1] ?? 0.04;
          const chord = size[2] ?? 0.4;
          return createPropellerBladeGeometry(length, thickness, chord);
        }
        case 'carbon_arm': {
          const w = size[0] ?? 4.1;
          const h = size[1] ?? 0.16;
          const d = size[2] ?? 0.7;
          const length = Math.max(w, d);
          const width = Math.min(w, d);
          return createCarbonArmGeometry(length, h, width);
        }
        case 'carbon_plate': {
          const w = size[0] ?? 2.0;
          const h = size[1] ?? 0.12;
          const d = size[2] ?? 4.4;
          const isTopPlate = (position?.[1] ?? 0) > 0.5;
          return createCarbonPlateGeometry(w, h, d, isTopPlate);
        }
        case 'motor_bell': {
          const r = size[0] ?? 0.42;
          const h = size[1] ?? 0.5;
          return createMotorBellGeometry(r, h);
        }
        case 'standoff':
        case 'cylinder': {
          const r = size[0] ?? 0.5;
          const h = size[1] ?? 1;
          return new THREE.CylinderGeometry(r, r, h, 48);
        }
        case 'roundedBox': {
          const w = size[0] ?? 1;
          const h = size[1] ?? 0.5;
          const d = size[2] ?? 1;
          const minSide = Math.min(w, h, d);
          const radius = minSide * 0.12;
          return new RoundedBoxGeometry(w, h, d, 3, radius);
        }
        case 'box': {
          const w = size[0] ?? 1;
          const h = size[1] ?? 1;
          const d = size[2] ?? 1;
          const minSide = Math.min(w, h, d);
          const isFlatPlate = minSide <= 0.15 && Math.max(w, d) > 1.0;
          const radius = isFlatPlate ? minSide * 0.08 : minSide * 0.12;
          return new RoundedBoxGeometry(w, h, d, 3, Math.max(0.005, radius));
        }
        case 'sphere': {
          const r = size[0] ?? 0.5;
          return new THREE.SphereGeometry(r, 32, 32);
        }
        case 'cone': {
          const r = size[0] ?? 0.5;
          const h = size[1] ?? 1;
          return new THREE.ConeGeometry(r, h, 36);
        }
        case 'torus': {
          const r = size[0] ?? 0.5;
          const tube = size[1] ?? 0.08;
          return new THREE.TorusGeometry(r, tube, 20, 48);
        }
        case 'ring': {
          const innerR = size[0] ?? 0.3;
          const outerR = size[1] ?? 0.6;
          return new THREE.RingGeometry(innerR, outerR, 48);
        }
        case 'tube': {
          const r = size[0] ?? 0.05;
          if (path && path.length >= 2) {
            const points = path.map((pt) => new THREE.Vector3(pt[0], pt[1], pt[2]));
            const curve = new THREE.CatmullRomCurve3(points);
            return new THREE.TubeGeometry(curve, 32, r, 12, false);
          }
          return new THREE.CylinderGeometry(r, r, 0.5, 24);
        }
        default:
          return new THREE.BoxGeometry(1, 1, 1);
      }
    } catch (e) {
      console.warn('Error creating geometry for part:', shape, e);
      return new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }
  }, [partType, shape, size, position, path]);

  // Compute main material
  const meshMaterial = useMemo(() => {
    return createPartMaterial(material, options);
  }, [material, options]);

  // Ancillary materials for realistic detail sub-elements
  const detailMaterials = useMemo(() => {
    return {
      screw: createPartMaterial('brushed_metal', { ...options, isSelected: false }),
      copper: createPartMaterial('gold', { ...options, isSelected: false }),
      smdChip: createPartMaterial('silicon_die', { ...options, isSelected: false }),
      goldPad: createPartMaterial('gold', { ...options, isSelected: false }),
    };
  }, [options]);

  const isXray = options.viewMode === 'xray';
  const edgeColor = options.isSelected
    ? '#38bdf8'
    : isXray
    ? '#06b6d4'
    : '#0f172a';

  const edgeOpacity = options.isSelected
    ? 0.85
    : isXray
    ? 0.5
    : options.isHovered
    ? 0.4
    : options.isDimmed
    ? 0.1
    : 0.35;

  // Stator coils and shaft nut for motor bell
  const motorDetails = useMemo(() => {
    if (partType !== 'motor_bell' || isXray) return null;
    const r = size[0] ?? 0.42;
    const h = size[1] ?? 0.5;
    const statorGeom = createStatorWindingsGeometry(r, h);
    const hexNutGeom = new THREE.CylinderGeometry(r * 0.32, r * 0.32, h * 0.22, 6);
    return { statorGeom, hexNutGeom, r, h };
  }, [partType, size, isXray]);

  // Screw heads for standoffs
  const standoffScrews = useMemo(() => {
    if (partType !== 'standoff' || isXray) return null;
    const r = size[0] ?? 0.07;
    const h = size[1] ?? 1.08;
    const screwGeom = createScrewHeadGeometry(r * 1.35, 0.04);
    return { screwGeom, h };
  }, [partType, size, isXray]);

  // SMD chips for PCBs
  const pcbChips = useMemo(() => {
    if ((material !== 'pcb_black' && material !== 'pcb_green') || isXray) return null;
    const w = size[0] ?? 1.2;
    const h = size[1] ?? 0.08;
    const d = size[2] ?? 1.2;

    // Fixed deterministic seed positions for micro SMD components
    const chips = [
      { x: -w * 0.25, z: -d * 0.25, sw: w * 0.18, sd: d * 0.18, sh: 0.03 },
      { x: w * 0.22, z: -d * 0.2, sw: w * 0.15, sd: d * 0.12, sh: 0.025 },
      { x: -w * 0.2, z: d * 0.25, sw: w * 0.14, sd: d * 0.14, sh: 0.02 },
      { x: w * 0.26, z: d * 0.22, sw: w * 0.12, sd: d * 0.2, sh: 0.028 },
    ];
    return { chips, h };
  }, [material, size, isXray]);

  return (
    <group position={position} rotation={rotation || [0, 0, 0]}>
      {/* Primary Part Mesh */}
      <mesh
        geometry={geometry}
        material={meshMaterial}
        castShadow={!isXray && !options.isDimmed}
        receiveShadow={!isXray}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        {/* Subtle CAD edges for crisp industrial silhouette */}
        <Edges
          threshold={25}
          color={edgeColor}
          opacity={edgeOpacity}
          transparent
        />
      </mesh>

      {/* Realistic Motor Internals: 12 copper stator coils & top hex shaft nut */}
      {motorDetails && (
        <>
          <mesh
            geometry={motorDetails.statorGeom}
            material={detailMaterials.copper}
            position={[0, -motorDetails.h * 0.08, 0]}
          />
          <mesh
            geometry={motorDetails.hexNutGeom}
            material={detailMaterials.screw}
            position={[0, motorDetails.h * 0.55, 0]}
          />
        </>
      )}

      {/* Realistic Standoff Screws on both ends */}
      {standoffScrews && (
        <>
          <mesh
            geometry={standoffScrews.screwGeom}
            material={detailMaterials.screw}
            position={[0, standoffScrews.h / 2 + 0.02, 0]}
          />
          <mesh
            geometry={standoffScrews.screwGeom}
            material={detailMaterials.screw}
            position={[0, -standoffScrews.h / 2 - 0.02, 0]}
            rotation={[Math.PI, 0, 0]}
          />
        </>
      )}

      {/* Surface-Mounted Device (SMD) chips on electronics boards */}
      {pcbChips &&
        pcbChips.chips.map((chip, idx) => (
          <mesh
            key={`smd_${idx}`}
            position={[chip.x, pcbChips.h / 2 + chip.sh / 2, chip.z]}
            material={detailMaterials.smdChip}
          >
            <boxGeometry args={[chip.sw, chip.sh, chip.sd]} />
          </mesh>
        ))}
    </group>
  );
};
