import React, { useMemo } from 'react';
import * as THREE from 'three';
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
        case 'box':
        case 'roundedBox': {
          const w = size[0] ?? 1;
          const h = size[1] ?? 1;
          const d = size[2] ?? 1;
          return new THREE.BoxGeometry(w, h, d);
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
          // Fallback if no path
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

  return (
    <mesh
      geometry={geometry}
      material={meshMaterial}
      position={position}
      rotation={rotation || [0, 0, 0]}
      castShadow
      receiveShadow
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    />
  );
};
