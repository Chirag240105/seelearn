import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { AssemblyComponent, AssemblyConnection, ConnectionType } from '../../types/assembly';
import { GestureState } from '../../types/vision';
import { ProceduralMesh } from './ProceduralMesh';
import { ConnectionLines } from './ConnectionLines';
import { ThrustVectors } from './ThrustVectors';

interface ThreeDroneCanvasProps {
  components: AssemblyComponent[];
  connections: AssemblyConnection[];
  selectedComponentId?: string;
  viewMode: 'solid' | 'xray' | 'exploded';
  mode: 'explore' | 'trace' | 'operate' | 'experiment';
  explodedProgress: number; // 0 to 1
  autoRotate: boolean;
  motorRpm: number;
  connectionFilter: 'all' | ConnectionType;
  experimentOverride?: {
    motorDisabled?: boolean;
    motorReversed?: boolean;
    batteryDisconnected?: boolean;
  };
  gestureCursor?: { x: number; y: number } | null;
  gestureState?: GestureState;
  rotateMode?: boolean;
  onSelectComponent: (id: string) => void;
  onSelectConnection?: (conn: AssemblyConnection) => void;
}

// Subcomponent to handle 3D Raycasting driven by Gesture Cursor coordinates
const GestureRaycastBridge: React.FC<{
  gestureCursor?: { x: number; y: number } | null;
  gestureState?: GestureState;
  rotateMode?: boolean;
  components: AssemblyComponent[];
  explodedProgress: number;
  onHoverComponent: (id?: string) => void;
  onSelectComponent: (id: string) => void;
  onRotateModel: (deltaYaw: number, deltaPitch: number) => void;
}> = ({
  gestureCursor,
  gestureState,
  rotateMode,
  components,
  explodedProgress,
  onHoverComponent,
  onSelectComponent,
  onRotateModel,
}) => {
  const { camera, scene, raycaster } = useThree();
  const prevCursorRef = useRef<{ x: number; y: number } | null>(null);
  const prevPinchStateRef = useRef<boolean>(false);

  useFrame(() => {
    if (!gestureCursor) {
      prevCursorRef.current = null;
      return;
    }

    const isPinching = gestureState === 'PINCH_START' || gestureState === 'PINCH_HOLD';

    // 1. In Rotate Mode: Pinch-drag rotates the model
    if (rotateMode && isPinching) {
      if (prevCursorRef.current) {
        const deltaX = (gestureCursor.x - prevCursorRef.current.x) * Math.PI * 2;
        const deltaY = (gestureCursor.y - prevCursorRef.current.y) * Math.PI;
        onRotateModel(deltaX, deltaY);
      }
      prevCursorRef.current = { x: gestureCursor.x, y: gestureCursor.y };
      return;
    }

    prevCursorRef.current = { x: gestureCursor.x, y: gestureCursor.y };

    // 2. Normal Mode: Raycasting to hover and select
    // Convert normalized [0, 1] screen coordinates to NDC [-1, 1]
    const ndcX = (gestureCursor.x * 2) - 1;
    const ndcY = -(gestureCursor.y * 2) + 1;

    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    let foundComponentId: string | null = null;

    if (intersects.length > 0) {
      for (const hit of intersects) {
        let hitObj: THREE.Object3D | null = hit.object;
        while (hitObj && hitObj.parent && hitObj.parent !== scene) {
          const match = components.find(
            (c) =>
              Math.abs(hitObj!.position.x - (c.position[0] + c.explodedOffset[0] * explodedProgress)) < 0.05
          );
          if (match) {
            foundComponentId = match.id;
            break;
          }
          hitObj = hitObj.parent;
        }
        if (foundComponentId) break;
      }
    }

    onHoverComponent(foundComponentId || undefined);

    // Trigger selection on PINCH_START
    const justPinched = gestureState === 'PINCH_START' && !prevPinchStateRef.current;
    if (justPinched && foundComponentId) {
      onSelectComponent(foundComponentId);
    }

    prevPinchStateRef.current = isPinching;
  });

  return null;
};

export const ThreeDroneCanvas: React.FC<ThreeDroneCanvasProps> = ({
  components,
  connections,
  selectedComponentId,
  viewMode,
  mode,
  explodedProgress,
  autoRotate,
  motorRpm,
  connectionFilter,
  experimentOverride,
  gestureCursor,
  gestureState,
  rotateMode,
  onSelectComponent,
  onSelectConnection,
}) => {
  const [hoveredComponentId, setHoveredComponentId] = useState<string | undefined>();
  const [modelRotation, setModelRotation] = useState<[number, number, number]>([0, 0, 0]);

  // Determine which components should be faded when one is selected
  const isComponentFaded = (compId: string) => {
    if (!selectedComponentId) return false;
    if (selectedComponentId === compId) return false;

    // In Trace mode, also keep directly connected components highlighted
    if (mode === 'trace') {
      const isConnected = connections.some(
        (c) =>
          (c.from === selectedComponentId && c.to === compId) ||
          (c.to === selectedComponentId && c.from === compId)
      );
      return !isConnected;
    }

    return true;
  };

  const handleRotateModel = (deltaYaw: number, deltaPitch: number) => {
    setModelRotation(([x, y, z]) => [
      Math.max(-Math.PI / 3, Math.min(Math.PI / 3, x + deltaPitch)),
      y + deltaYaw,
      z,
    ]);
  };

  return (
    <div className="w-full h-full relative select-none bg-[#070B14]">
      <Canvas
        camera={{ position: [3.8, 3.2, 4.2], fov: 45 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onPointerMissed={() => onSelectComponent('')}
      >
        <color attach="background" args={['#070B14']} />
        <fog attach="fog" args={['#070B14', 8, 22]} />

        {/* Studio Three-Point Lighting */}
        <ambientLight intensity={0.4} color="#93C5FD" />
        {/* Key Light (warm high directional) */}
        <directionalLight position={[6, 8, 5]} intensity={1.2} color="#F8FAFC" />
        {/* Fill Light (cool electric blue ambient) */}
        <directionalLight position={[-6, 4, -5]} intensity={0.6} color="#38BDF8" />
        {/* Rim Light (sharp highlight from behind) */}
        <pointLight position={[0, -4, -6]} intensity={0.8} color="#0EA5E9" />

        {/* Elegant Ground Grid */}
        <Grid
          position={[0, -0.8, 0]}
          args={[14, 14]}
          cellSize={0.4}
          cellThickness={0.7}
          cellColor="#1E293B"
          sectionSize={2.0}
          sectionThickness={1.2}
          sectionColor="#0284C7"
          fadeDistance={10}
          fadeStrength={1.5}
        />

        {/* Orbit Controls (disabled while rotateMode gesture pinch is active) */}
        <OrbitControls
          makeDefault
          enabled={!(rotateMode && (gestureState === 'PINCH_START' || gestureState === 'PINCH_HOLD'))}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          enableDamping
          dampingFactor={0.06}
          minDistance={1.8}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2 + 0.1}
        />

        {/* Gesture Raycast Bridge */}
        <GestureRaycastBridge
          gestureCursor={gestureCursor}
          gestureState={gestureState}
          rotateMode={rotateMode}
          components={components}
          explodedProgress={explodedProgress}
          onHoverComponent={setHoveredComponentId}
          onSelectComponent={onSelectComponent}
          onRotateModel={handleRotateModel}
        />

        {/* Assembly Parent Group with Gesture Model Rotation */}
        <group rotation={modelRotation}>
          {/* Procedural Components Group */}
          <group>
            {components.map((comp) => {
              const isSelected = comp.id === selectedComponentId;
              const isHovered = comp.id === hoveredComponentId;
              const isFaded = isComponentFaded(comp.id);

              return (
                <ProceduralMesh
                  key={comp.id}
                  component={comp}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  isFaded={isFaded}
                  explodedProgress={explodedProgress}
                  viewMode={viewMode}
                  operateActive={mode === 'operate'}
                  motorRpm={motorRpm}
                  experimentOverride={experimentOverride}
                  onClick={(id) => onSelectComponent(id)}
                  onPointerOver={(id) => setHoveredComponentId(id)}
                  onPointerOut={() => setHoveredComponentId(undefined)}
                />
              );
            })}
          </group>

          {/* 3D Wiring & Signal Spline Traces */}
          {(mode === 'trace' || selectedComponentId) && (
            <ConnectionLines
              connections={connections}
              components={components}
              activeTypeFilter={mode === 'trace' ? connectionFilter : 'all'}
              selectedComponentId={selectedComponentId}
              explodedProgress={explodedProgress}
              onSelectConnection={onSelectConnection}
            />
          )}

          {/* Dynamic Aerodynamic Thrust Vectors (Operate & Experiment Mode) */}
          {(mode === 'operate' || mode === 'experiment') && (
            <ThrustVectors
              components={components}
              explodedProgress={explodedProgress}
              motorRpm={motorRpm}
              experimentOverride={experimentOverride}
            />
          )}
        </group>
      </Canvas>
    </div>
  );
};
