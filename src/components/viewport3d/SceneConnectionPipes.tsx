import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SceneConnection, ConnectionType, SceneComponent } from '../../types/sceneSpec';

interface SceneConnectionPipesProps {
  connections: SceneConnection[];
  components: SceneComponent[];
  activeFilter: 'all' | ConnectionType;
  selectedComponentId?: string;
  explodedProgress?: number;
}

export const CONNECTION_COLORS: Record<ConnectionType, string> = {
  power: '#F59E0B',      // Amber
  signal: '#06B6D4',     // Cyan
  data: '#8B5CF6',       // Violet
  mechanical: '#93C5FD', // Light sky/white-blue
  thermal: '#EF4444',    // Orange-red
};

export const SceneConnectionPipes: React.FC<SceneConnectionPipesProps> = ({
  connections,
  components,
  activeFilter,
  selectedComponentId,
  explodedProgress = 0,
}) => {
  // Map component IDs to their effective world centers (taking exploded offsets into account)
  const componentCenters = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();

    for (const comp of components) {
      if (!comp.parts || comp.parts.length === 0) {
        map.set(comp.id, new THREE.Vector3(0, 0, 0));
        continue;
      }

      // Compute average position of parts
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (const part of comp.parts) {
        sumX += part.position[0] || 0;
        sumY += part.position[1] || 0;
        sumZ += part.position[2] || 0;
      }
      const count = comp.parts.length;
      const baseCenter = new THREE.Vector3(sumX / count, sumY / count, sumZ / count);

      if (comp.explode && explodedProgress > 0) {
        baseCenter.add(
          new THREE.Vector3(
            comp.explode[0] * explodedProgress,
            comp.explode[1] * explodedProgress,
            comp.explode[2] * explodedProgress
          )
        );
      }
      map.set(comp.id, baseCenter);
    }
    return map;
  }, [components, explodedProgress]);

  // Filter connections
  const visibleConnections = useMemo(() => {
    return connections.filter((conn) => {
      if (activeFilter !== 'all' && conn.type !== activeFilter) {
        return false;
      }
      return true;
    });
  }, [connections, activeFilter]);

  return (
    <group name="scene-connections">
      {visibleConnections.map((conn, idx) => {
        const fromPos = componentCenters.get(conn.from);
        const toPos = componentCenters.get(conn.to);

        if (!fromPos || !toPos) return null;

        const isRelated =
          selectedComponentId &&
          (conn.from === selectedComponentId || conn.to === selectedComponentId);

        return (
          <SingleConnectionPipe
            key={`${conn.from}-${conn.to}-${idx}`}
            connection={conn}
            from={fromPos}
            to={toPos}
            isHighlighted={Boolean(isRelated)}
            color={CONNECTION_COLORS[conn.type] || '#38BDF8'}
          />
        );
      })}
    </group>
  );
};

interface SingleConnectionPipeProps {
  connection: SceneConnection;
  from: THREE.Vector3;
  to: THREE.Vector3;
  isHighlighted: boolean;
  color: string;
}

const SingleConnectionPipe: React.FC<SingleConnectionPipeProps> = ({
  from,
  to,
  isHighlighted,
  color,
}) => {
  const pulseRef = useRef<THREE.Mesh>(null);

  // Generate an elevated curved trajectory
  const { curve, geometry } = useMemo(() => {
    const dist = from.distanceTo(to);
    const midPoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    // Arc up along Y proportional to distance
    midPoint.y += Math.min(dist * 0.25, 0.8);

    const spline = new THREE.CatmullRomCurve3([from, midPoint, to]);
    const geo = new THREE.TubeGeometry(spline, 20, isHighlighted ? 0.04 : 0.02, 8, false);
    return { curve: spline, geometry: geo };
  }, [from, to, isHighlighted]);

  // Animate pulse traveling down the pipe
  useFrame((state) => {
    if (pulseRef.current) {
      const t = (state.clock.elapsedTime * 0.7) % 1;
      const point = curve.getPoint(t);
      pulseRef.current.position.copy(point);
    }
  });

  return (
    <group>
      {/* Main tube */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isHighlighted ? 0.8 : 0.3}
          transparent
          opacity={isHighlighted ? 0.9 : 0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Pulsing energy packet indicator */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[isHighlighted ? 0.07 : 0.045, 12, 12]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
};
