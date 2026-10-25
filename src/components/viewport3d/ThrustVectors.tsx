import React from 'react';
import * as THREE from 'three';
import { AssemblyComponent } from '../../types/assembly';

interface ThrustVectorsProps {
  components: AssemblyComponent[];
  explodedProgress: number;
  motorRpm: number;
  experimentOverride?: {
    motorDisabled?: boolean;
    motorReversed?: boolean;
    batteryDisconnected?: boolean;
  };
}

export const ThrustVectors: React.FC<ThrustVectorsProps> = ({
  components,
  explodedProgress,
  motorRpm,
  experimentOverride,
}) => {
  const propComponents = components.filter(
    (c) => c.id.startsWith('propeller_') || c.id.startsWith('motor_')
  );

  // Group by propeller index (1 to 4)
  const propsOnly = components.filter((c) => c.id.startsWith('propeller_'));

  if (experimentOverride?.batteryDisconnected) {
    return null; // Zero thrust everywhere
  }

  return (
    <group>
      {propsOnly.map((prop, idx) => {
        const propIndex = idx + 1;
        const currentPos: [number, number, number] = [
          prop.position[0] + prop.explodedOffset[0] * explodedProgress,
          prop.position[1] + prop.explodedOffset[1] * explodedProgress + 0.3,
          prop.position[2] + prop.explodedOffset[2] * explodedProgress,
        ];

        let arrowLength = 0.7 * (motorRpm / 25000);
        let arrowDir = new THREE.Vector3(0, 1, 0); // Upward lift
        let arrowColor = '#06B6D4'; // Bright Cyan

        if (propIndex === 4 && experimentOverride?.motorDisabled) {
          arrowLength = 0; // Motor 4 failure
        }

        if (propIndex === 1 && experimentOverride?.motorReversed) {
          arrowDir = new THREE.Vector3(0, -1, 0); // Downward downforce!
          arrowColor = '#EF4444'; // Red alarm
          arrowLength = 0.65;
        }

        if (arrowLength <= 0.05) return null;

        const arrowHelper = new THREE.ArrowHelper(
          arrowDir,
          new THREE.Vector3(...currentPos),
          arrowLength,
          new THREE.Color(arrowColor),
          0.18,
          0.1
        );

        return (
          <group key={prop.id}>
            <primitive object={arrowHelper} />
            {/* Aerodynamic thrust disc ring */}
            <mesh position={currentPos} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.45, 24]} />
              <meshBasicMaterial
                color={arrowColor}
                transparent
                opacity={0.35}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
