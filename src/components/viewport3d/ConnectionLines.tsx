import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { AssemblyComponent, AssemblyConnection, ConnectionType } from '../../types/assembly';

interface ConnectionLinesProps {
  connections: AssemblyConnection[];
  components: AssemblyComponent[];
  activeTypeFilter: 'all' | ConnectionType;
  selectedComponentId?: string;
  explodedProgress: number;
  highlightedConnectionId?: string;
  onSelectConnection?: (conn: AssemblyConnection) => void;
}

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({
  connections,
  components,
  activeTypeFilter,
  selectedComponentId,
  explodedProgress,
  highlightedConnectionId,
  onSelectConnection,
}) => {
  const compPositionMap = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    components.forEach((c) => {
      const pos = new THREE.Vector3(
        c.position[0] + c.explodedOffset[0] * explodedProgress,
        c.position[1] + c.explodedOffset[1] * explodedProgress,
        c.position[2] + c.explodedOffset[2] * explodedProgress
      );
      map.set(c.id, pos);
    });
    return map;
  }, [components, explodedProgress]);

  const filteredConnections = useMemo(() => {
    return connections.filter((conn) => {
      if (activeTypeFilter !== 'all' && conn.type !== activeTypeFilter) {
        return false;
      }
      return true;
    });
  }, [connections, activeTypeFilter]);

  const getColorForType = (type: ConnectionType, isHighlighted: boolean) => {
    if (isHighlighted) return '#FFFFFF';
    switch (type) {
      case 'power':
        return '#F59E0B'; // Golden Amber
      case 'signal':
        return '#06B6D4'; // Electric Cyan
      case 'mechanical':
        return '#94A3B8'; // Silver Slate
      default:
        return '#38BDF8';
    }
  };

  return (
    <group>
      {filteredConnections.map((conn) => {
        const fromPos = compPositionMap.get(conn.from);
        const toPos = compPositionMap.get(conn.to);

        if (!fromPos || !toPos) return null;

        const isRelatedToSelected =
          selectedComponentId === conn.from || selectedComponentId === conn.to;
        const isHighlighted = highlightedConnectionId === conn.id;

        // Build a curved cubic spline between the two points
        const midPoint = new THREE.Vector3()
          .addVectors(fromPos, toPos)
          .multiplyScalar(0.5);
        
        // Lift the curve up slightly in Y to make it arch gracefully
        midPoint.y += 0.15 + (conn.type === 'power' ? 0.05 : conn.type === 'signal' ? 0.1 : 0);

        const curve = new THREE.QuadraticBezierCurve3(fromPos, midPoint, toPos);
        const points = curve.getPoints(24);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const color = getColorForType(conn.type, isHighlighted);
        const opacity = selectedComponentId
          ? isRelatedToSelected || isHighlighted
            ? 0.95
            : 0.15
          : isHighlighted
          ? 1.0
          : 0.65;
        const lineWidth = isHighlighted || isRelatedToSelected ? 3 : 1.5;

        return (
          <group key={conn.id} onClick={() => onSelectConnection?.(conn)}>
            {/* Visual line */}
            <primitive object={new THREE.Line(
              geometry,
              new THREE.LineBasicMaterial({
                color: new THREE.Color(color),
                transparent: true,
                opacity,
                linewidth: lineWidth,
              })
            )} />

            {/* Pulsing midpoint marker */}
            <mesh position={midPoint}>
              <sphereGeometry args={[0.035, 12, 12]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
