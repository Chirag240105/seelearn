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

// Geometry cache to reuse identical meshes (standoffs, screws, plates, cylinders)
const geometryCache = new Map<string, THREE.BufferGeometry>();

export function clearGeometryCache(): void {
  geometryCache.forEach((g) => g.dispose());
  geometryCache.clear();
}

interface ProceduralPartMeshProps {
  part: ScenePart;
  options?: MaterialStyleOptions;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
  onClick?: (e: any) => void;
}

export const ProceduralPartMesh = React.memo<ProceduralPartMeshProps>(function ProceduralPartMesh({
  part,
  options = {},
  onPointerOver,
  onPointerOut,
  onClick,
}) {
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

  // Compute primary geometry based on shape & part type with cache
  const geometry = useMemo(() => {
    const radialSeg = options.isSelected ? 48 : 24;
    const geomKey = `${partType}_${(size || []).join('_')}_${radialSeg}_${Boolean(position && position[1] > 0.5)}`;
    if (geometryCache.has(geomKey)) {
      return geometryCache.get(geomKey)!;
    }

    let geom: THREE.BufferGeometry;
    try {
      switch (partType) {
        case 'propeller_blade': {
          const length = size[0] ?? 2.05;
          const thickness = size[1] ?? 0.04;
          const chord = size[2] ?? 0.4;
          geom = createPropellerBladeGeometry(length, thickness, chord);
          break;
        }
        case 'carbon_arm': {
          const w = size[0] ?? 4.1;
          const h = size[1] ?? 0.16;
          const d = size[2] ?? 0.7;
          const length = Math.max(w, d);
          const width = Math.min(w, d);
          geom = createCarbonArmGeometry(length, h, width);
          break;
        }
        case 'carbon_plate': {
          const w = size[0] ?? 2.0;
          const h = size[1] ?? 0.12;
          const d = size[2] ?? 4.4;
          const isTopPlate = (position?.[1] ?? 0) > 0.5;
          geom = createCarbonPlateGeometry(w, h, d, isTopPlate);
          break;
        }
        case 'motor_bell': {
          const r = size[0] ?? 0.42;
          const h = size[1] ?? 0.5;
          geom = createMotorBellGeometry(r, h);
          break;
        }
        case 'standoff':
        case 'cylinder': {
          const r = size[0] ?? 0.5;
          const h = size[1] ?? 1;
          geom = new THREE.CylinderGeometry(r, r, h, radialSeg);
          break;
        }
        case 'roundedBox': {
          const w = size[0] ?? 1;
          const h = size[1] ?? 0.5;
          const d = size[2] ?? 1;
          const minSide = Math.min(w, h, d);
          const radius = minSide * 0.12;
          geom = new RoundedBoxGeometry(w, h, d, 2, radius);
          break;
        }
        case 'box': {
          const w = size[0] ?? 1;
          const h = size[1] ?? 1;
          const d = size[2] ?? 1;
          const minSide = Math.min(w, h, d);
          const isFlatPlate = minSide <= 0.15 && Math.max(w, d) > 1.0;
          const radius = isFlatPlate ? minSide * 0.08 : minSide * 0.12;
          geom = new RoundedBoxGeometry(w, h, d, 2, Math.max(0.005, radius));
          break;
        }
        case 'sphere': {
          const r = size[0] ?? 0.5;
          geom = new THREE.SphereGeometry(r, 24, 24);
          break;
        }
        case 'cone': {
          const r = size[0] ?? 0.5;
          const h = size[1] ?? 1;
          geom = new THREE.ConeGeometry(r, h, 24);
          break;
        }
        case 'torus': {
          const r = size[0] ?? 0.5;
          const tube = size[1] ?? 0.08;
          geom = new THREE.TorusGeometry(r, tube, 16, 24);
          break;
        }
        case 'ring': {
          const innerR = size[0] ?? 0.3;
          const outerR = size[1] ?? 0.6;
          geom = new THREE.RingGeometry(innerR, outerR, 32);
          break;
        }
        case 'tube': {
          const r = size[0] ?? 0.05;
          if (path && path.length >= 2) {
            const points = path.map((pt) => new THREE.Vector3(pt[0], pt[1], pt[2]));
            const curve = new THREE.CatmullRomCurve3(points);
            geom = new THREE.TubeGeometry(curve, 24, r, 8, false);
          } else {
            geom = new THREE.CylinderGeometry(r, r, 0.5, 16);
          }
          break;
        }
        default:
          geom = new THREE.BoxGeometry(1, 1, 1);
      }
    } catch (e) {
      geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }

    geometryCache.set(geomKey, geom);
    return geom;
  }, [partType, shape, size, position, path, options.isSelected]);

  // Compute main material
  const meshMaterial = useMemo(() => {
    return createPartMaterial(material, options);
  }, [material, options]);

  // Ancillary materials for realistic detail sub-elements (only if inspected/hovered)
  const isInspected = options.isSelected || options.isHovered;
  const detailMaterials = useMemo(() => {
    if (!isInspected) return null;
    return {
      screw: createPartMaterial('brushed_metal', { ...options, isSelected: false }),
      copper: createPartMaterial('gold', { ...options, isSelected: false }),
      smdChip: createPartMaterial('silicon_die', { ...options, isSelected: false }),
      goldPad: createPartMaterial('gold', { ...options, isSelected: false }),
    };
  }, [options, isInspected]);

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

  // Stator coils and shaft nut for motor bell (only rendered if inspected)
  const motorDetails = useMemo(() => {
    if (partType !== 'motor_bell' || isXray || !isInspected) return null;
    const r = size[0] ?? 0.42;
    const h = size[1] ?? 0.5;
    const statorGeom = createStatorWindingsGeometry(r, h);
    const hexNutGeom = new THREE.CylinderGeometry(r * 0.32, r * 0.32, h * 0.22, 6);
    return { statorGeom, hexNutGeom, r, h };
  }, [partType, size, isXray, isInspected]);

  // Screw heads for standoffs (only rendered if inspected)
  const standoffScrews = useMemo(() => {
    if (partType !== 'standoff' || isXray || !isInspected) return null;
    const r = size[0] ?? 0.07;
    const h = size[1] ?? 1.08;
    const screwGeom = createScrewHeadGeometry(r * 1.35, 0.04);
    return { screwGeom, h };
  }, [partType, size, isXray, isInspected]);

  // SMD chips for PCBs (only rendered if inspected)
  const pcbChips = useMemo(() => {
    if ((material !== 'pcb_black' && material !== 'pcb_green') || isXray || !isInspected) return null;
    const w = size[0] ?? 1.2;
    const h = size[1] ?? 0.08;
    const d = size[2] ?? 1.2;

    const chips = [
      { x: -w * 0.25, z: -d * 0.25, sw: w * 0.18, sd: d * 0.18, sh: 0.03 },
      { x: w * 0.22, z: -d * 0.2, sw: w * 0.15, sd: d * 0.12, sh: 0.025 },
      { x: -w * 0.2, z: d * 0.25, sw: w * 0.14, sd: d * 0.14, sh: 0.02 },
      { x: w * 0.26, z: d * 0.22, sw: w * 0.12, sd: d * 0.2, sh: 0.028 },
    ];
    return { chips, h };
  }, [material, size, isXray, isInspected]);

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
        {/* Subtle CAD edges only shown in X-ray, on hover, or for selected part */}
        {(isXray || options.isSelected || options.isHovered) && (
          <Edges
            threshold={25}
            color={edgeColor}
            opacity={edgeOpacity}
            transparent
          />
        )}
      </mesh>

      {/* Realistic Motor Internals: rendered only when inspected */}
      {isInspected && motorDetails && detailMaterials && (
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

      {/* Realistic Standoff Screws: rendered only when inspected */}
      {isInspected && standoffScrews && detailMaterials && (
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

      {/* SMD chips on electronics boards: rendered only when inspected */}
      {isInspected && pcbChips && detailMaterials &&
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
});
