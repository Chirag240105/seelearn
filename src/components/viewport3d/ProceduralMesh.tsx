import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { AssemblyComponent } from '../../types/assembly';

interface ProceduralMeshProps {
  component: AssemblyComponent;
  isSelected: boolean;
  isHovered: boolean;
  isFaded: boolean;
  explodedProgress: number; // 0 (compact) to 1 (fully exploded)
  viewMode: 'solid' | 'xray' | 'exploded';
  operateActive: boolean;
  motorRpm: number;
  experimentOverride?: {
    motorDisabled?: boolean;
    motorReversed?: boolean;
    batteryDisconnected?: boolean;
  };
  onClick: (id: string) => void;
  onPointerOver: (id: string) => void;
  onPointerOut: (id: string) => void;
}

export const ProceduralMesh: React.FC<ProceduralMeshProps> = ({
  component,
  isSelected,
  isHovered,
  isFaded,
  explodedProgress,
  viewMode,
  operateActive,
  motorRpm,
  experimentOverride,
  onClick,
  onPointerOver,
  onPointerOut,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Group>(null);

  // Compute interpolated position based on explodedProgress
  const currentPos: [number, number, number] = [
    component.position[0] + component.explodedOffset[0] * explodedProgress,
    component.position[1] + component.explodedOffset[1] * explodedProgress,
    component.position[2] + component.explodedOffset[2] * explodedProgress,
  ];

  // Motor / Propeller spinning animation in Operate mode
  useFrame((_, delta) => {
    if (rotorRef.current && operateActive && component.operationalBehavior?.type === 'rotor') {
      if (experimentOverride?.motorDisabled) {
        return; // Stopped
      }

      let speed = (motorRpm / 60) * Math.PI * 2 * delta;
      if (experimentOverride?.motorReversed) {
        speed = -speed;
      } else if (component.operationalBehavior.spinDirection === 'ccw') {
        speed = -speed;
      }
      rotorRef.current.rotation.y += speed;
    }
  });

  // Calculate material appearance
  const baseColor = isSelected
    ? '#38BDF8' // bright cyan-blue when selected
    : isHovered
    ? '#60A5FA' // light blue hover
    : component.mesh.color || '#0284C7';

  const opacity = isFaded
    ? 0.12
    : viewMode === 'xray'
    ? isSelected
      ? 0.65
      : 0.22
    : isSelected
    ? 0.95
    : 0.78;

  const wireframe = viewMode === 'xray' ? true : component.mesh.wireframe || false;

  const renderSingleGeometry = (type: string, dims: [number, number, number]) => {
    switch (type) {
      case 'box':
        return <boxGeometry args={[dims[0], dims[1], dims[2]]} />;
      case 'cylinder':
        return <cylinderGeometry args={[dims[0], dims[1], dims[2], 24]} />;
      case 'sphere':
        return <sphereGeometry args={[dims[0], 20, 20]} />;
      case 'cone':
        return <coneGeometry args={[dims[0], dims[2], 20]} />;
      default:
        return <boxGeometry args={[dims[0], dims[1], dims[2]]} />;
    }
  };

  return (
    <group
      ref={groupRef}
      position={currentPos}
      rotation={component.rotation || [0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick(component.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onPointerOver(component.id);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onPointerOut(component.id);
      }}
    >
      {/* If this component spins (propeller/motor rotor), place it inside rotor group */}
      <group ref={rotorRef}>
        {component.mesh.type === 'compound' && component.mesh.subMeshes ? (
          component.mesh.subMeshes.map((sub, idx) => (
            <mesh
              key={idx}
              position={sub.offset || [0, 0, 0]}
              rotation={sub.rotation || [0, 0, 0]}
            >
              {renderSingleGeometry(sub.type, sub.dimensions)}
              <meshStandardMaterial
                color={isSelected ? '#38BDF8' : sub.color || baseColor}
                transparent
                opacity={opacity}
                wireframe={wireframe}
                roughness={0.25}
                metalness={0.7}
                emissive={isSelected ? '#0284C7' : isHovered ? '#0369A1' : '#000000'}
                emissiveIntensity={isSelected ? 0.6 : isHovered ? 0.3 : 0}
              />
            </mesh>
          ))
        ) : (
          <mesh position={component.mesh.offset || [0, 0, 0]}>
            {renderSingleGeometry(component.mesh.type, component.mesh.dimensions)}
            <meshStandardMaterial
              color={baseColor}
              transparent
              opacity={opacity}
              wireframe={wireframe}
              roughness={0.2}
              metalness={0.8}
              emissive={isSelected ? '#38BDF8' : isHovered ? '#0284C7' : '#000000'}
              emissiveIntensity={isSelected ? 0.8 : isHovered ? 0.4 : 0}
            />
          </mesh>
        )}
      </group>

      {/* Selection / Hover Accent Glow Ring */}
      {(isSelected || isHovered) && (
        <mesh position={[0, 0, 0]}>
          <ringGeometry args={[0.35, 0.42, 32]} />
          <meshBasicMaterial
            color={isSelected ? '#38BDF8' : '#60A5FA'}
            transparent
            opacity={isSelected ? 0.8 : 0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};
