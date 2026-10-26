import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ScenePart } from '../../types/sceneSpec';
import { createPartMaterial, MaterialStyleOptions } from './materialFactory';

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

  // Compute geometry based on shape
  const geometry = useMemo(() => {
    try {
      switch (shape) {
        case 'box': {
          const w = size[0] ?? 1;
          const h = size[1] ?? 1;
          const d = size[2] ?? 1;
          return new THREE.BoxGeometry(w, h, d);
        }
        case 'roundedBox': {
          const w = size[0] ?? 1;
          const h = size[1] ?? 0.5;
          const d = size[2] ?? 1;
          return new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h, d) * 0.12);
        }
        case 'cylinder': {
          const r = size[0] ?? 0.5;
          const h = size[1] ?? 1;
          return new THREE.CylinderGeometry(r, r, h, 32);
        }
        case 'sphere': {
          const r = size[0] ?? 0.5;
          return new THREE.SphereGeometry(r, 24, 24);
        }
        case 'cone': {
          const r = size[0] ?? 0.5;
          const h = size[1] ?? 1;
          return new THREE.ConeGeometry(r, h, 24);
        }
        case 'torus': {
          const r = size[0] ?? 0.5;
          const tube = size[1] ?? 0.08;
          return new THREE.TorusGeometry(r, tube, 16, 32);
        }
        case 'ring': {
          const innerR = size[0] ?? 0.3;
          const outerR = size[1] ?? 0.6;
          return new THREE.RingGeometry(innerR, outerR, 32);
        }
        case 'tube': {
          const r = size[0] ?? 0.04;
          if (path && path.length >= 2) {
            const points = path.map((pt) => new THREE.Vector3(pt[0], pt[1], pt[2]));
            const curve = new THREE.CatmullRomCurve3(points);
            return new THREE.TubeGeometry(curve, 24, r, 8, false);
          }
          return new THREE.CylinderGeometry(r, r, 0.5, 16);
        }
        default:
          return new THREE.BoxGeometry(1, 1, 1);
      }
    } catch (e) {
      console.warn('Error creating geometry for part:', shape, e);
      return new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }
  }, [shape, size, path]);

  // Compute material
  const meshMaterial = useMemo(() => {
    return createPartMaterial(material, options);
  }, [material, options]);

  const isXray = options.viewMode === 'xray';
  const edgeColor = options.isSelected
    ? '#38bdf8'
    : isXray
    ? '#06b6d4'
    : '#1e293b';

  const edgeOpacity = options.isSelected
    ? 0.88
    : isXray
    ? 0.55
    : options.isHovered
    ? 0.45
    : options.isDimmed
    ? 0.1
    : 0.22;

  return (
    <mesh
      geometry={geometry}
      material={meshMaterial}
      position={position}
      rotation={rotation || [0, 0, 0]}
      castShadow={!isXray && !options.isDimmed}
      receiveShadow={!isXray}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <lineSegments>
        <edgesGeometry args={[geometry, isXray ? 15 : 24]} />
        <lineBasicMaterial
          color={edgeColor}
          transparent
          opacity={edgeOpacity}
          depthWrite={false}
        />
      </lineSegments>
    </mesh>
  );
};
