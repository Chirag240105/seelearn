import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { SceneSpec, SceneComponent, ConnectionType, SceneExperiment } from '../../types/sceneSpec';
import { GestureState } from '../../types/vision';
import { ProceduralPartMesh } from './ProceduralPartMesh';
import { SceneConnectionPipes } from './SceneConnectionPipes';

interface GenericSceneCanvasProps {
  spec: SceneSpec;
  viewMode: 'solid' | 'xray' | 'exploded';
  mode: 'explore' | 'trace' | 'operate' | 'experiment' | 'assembly';
  explodedProgress: number; // 0..1
  selectedComponentId?: string;
  onSelectComponent: (id: string) => void;
  connectionFilter: 'all' | ConnectionType;
  activeExperiment?: SceneExperiment | null;
  activeAssemblyStepIndex?: number;
  // Vision integration props
  gestureCursor?: { x: number; y: number } | null;
  gestureState?: GestureState;
  rotateMode?: boolean;
}

/**
 * Camera Controller that auto-centers and bounds any generic SceneSpec
 */
const AutoFitCameraController: React.FC<{
  spec: SceneSpec;
  rotateMode?: boolean;
}> = ({ spec, rotateMode }) => {
  const { camera, controls } = useThree();

  useEffect(() => {
    // Calculate composite bounding box of all parts in the spec
    const box = new THREE.Box3();
    let hasParts = false;

    for (const comp of spec.components) {
      for (const part of comp.parts) {
        hasParts = true;
        const pos = new THREE.Vector3(...part.position);
        // Expand by bounding sphere based on size
        const radius = Math.max(...(part.size || [1])) * 0.75;
        box.expandByPoint(new THREE.Vector3(pos.x - radius, pos.y - radius, pos.z - radius));
        box.expandByPoint(new THREE.Vector3(pos.x + radius, pos.y + radius, pos.z + radius));
      }
    }

    if (!hasParts) {
      box.set(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2));
    }

    const center = new THREE.Vector3();
    box.getCenter(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 2.5);

    // Position camera at 3/4 isometric perspective
    const fov = 38;
    const distance = (maxDim / 2) / Math.tan((fov * Math.PI) / 360) * 1.5;

    camera.position.set(center.x + distance * 0.75, center.y + distance * 0.65, center.z + distance * 0.85);
    camera.lookAt(center);

    if (controls) {
      (controls as any).target.copy(center);
      (controls as any).update();
    }
  }, [spec, camera, controls]);

  return null;
};

const GestureOrbitController: React.FC<{
  gestureCursor?: { x: number; y: number } | null;
  rotateMode?: boolean;
}> = ({ gestureCursor, rotateMode }) => {
  const { controls } = useThree();
  const previousCursor = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!rotateMode || !gestureCursor) {
      previousCursor.current = gestureCursor || null;
      return;
    }

    const previous = previousCursor.current;
    previousCursor.current = gestureCursor;
    if (!previous || !controls) return;

    const orbit = controls as {
      rotateLeft?: (angle: number) => void;
      rotateUp?: (angle: number) => void;
      update?: () => void;
    };
    if (!orbit.rotateLeft || !orbit.rotateUp || !orbit.update) return;

    orbit.rotateLeft((gestureCursor.x - previous.x) * Math.PI);
    orbit.rotateUp((gestureCursor.y - previous.y) * Math.PI);
    orbit.update();
  }, [controls, gestureCursor, rotateMode]);

  return null;
};

/**
 * Animated Component Group that applies Exploded displacement, Mechanisms, and Experiments
 */
const SceneComponentNode: React.FC<{
  component: SceneComponent;
  spec: SceneSpec;
  mode: 'explore' | 'trace' | 'operate' | 'experiment' | 'assembly';
  viewMode: 'solid' | 'xray' | 'exploded';
  explodedProgress: number;
  isSelected: boolean;
  isHovered: boolean;
  hasSelectedOther: boolean;
  activeExperiment?: SceneExperiment | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}> = ({
  component,
  spec,
  mode,
  viewMode,
  explodedProgress,
  isSelected,
  isHovered,
  hasSelectedOther,
  activeExperiment,
  onHover,
  onSelect,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [emissiveBlink, setEmissiveBlink] = useState(false);

  // Check if component is targeted by an active mechanism
  const activeMechanism = useMemo(() => {
    if (mode !== 'operate' && mode !== 'experiment') return null;
    return (spec.mechanisms || []).find((m) => m.targets.includes(component.id));
  }, [spec.mechanisms, component.id, mode]);

  // Check experiment actions
  const isExperimentDisabled = useMemo(() => {
    if (!activeExperiment) return false;
    return activeExperiment.targets.includes(component.id) &&
      (activeExperiment.action === 'remove' || activeExperiment.action === 'disable');
  }, [activeExperiment, component.id]);

  const isExperimentOverloaded = useMemo(() => {
    if (!activeExperiment) return false;
    return activeExperiment.targets.includes(component.id) && activeExperiment.action === 'overload';
  }, [activeExperiment, component.id]);

  const isExperimentReversed = useMemo(() => {
    if (!activeExperiment) return false;
    return activeExperiment.targets.includes(component.id) && activeExperiment.action === 'reverse';
  }, [activeExperiment, component.id]);

  // Animation frame handler for mechanisms
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Apply exploded offset
    const explodeX = (component.explode?.[0] || 0) * explodedProgress;
    const explodeY = (component.explode?.[1] || 0) * explodedProgress;
    const explodeZ = (component.explode?.[2] || 0) * explodedProgress;

    // Mechanism animation in operate/experiment modes
    if (activeMechanism && !isExperimentDisabled) {
      const speed = (activeMechanism.speed || 1.0) * (isExperimentReversed ? -1 : 1);
      const dir = (activeMechanism.direction || 1);

      if (activeMechanism.type === 'spin') {
        const axis = activeMechanism.axis || [0, 1, 0];
        groupRef.current.rotateOnAxis(
          new THREE.Vector3(...axis).normalize(),
          speed * dir * delta * 2.5
        );
      } else if (activeMechanism.type === 'oscillate') {
        const axis = activeMechanism.axis || [1, 0, 0];
        const time = performance.now() * 0.005 * speed;
        const offset = Math.sin(time) * 0.08;
        groupRef.current.position.set(
          explodeX + axis[0] * offset,
          explodeY + axis[1] * offset,
          explodeZ + axis[2] * offset
        );
      } else if (activeMechanism.type === 'blink') {
        const time = performance.now() * 0.003 * speed;
        setEmissiveBlink(Math.sin(time) > 0.3);
      }
    } else {
      // Standard static / exploded positioning
      groupRef.current.position.set(explodeX, explodeY, explodeZ);
    }
  });

  if (isExperimentDisabled && activeExperiment?.action === 'remove') {
    return null; // hide completely when removed
  }

  return (
    <group
      ref={groupRef}
      userData={{ componentId: component.id }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(component.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(component.id);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
      }}
    >
      {component.parts.map((part, pIdx) => (
        <ProceduralPartMesh
          key={`${component.id}-part-${pIdx}`}
          part={part}
          options={{
            viewMode,
            isSelected,
            isHovered,
            isDimmed: hasSelectedOther && !isSelected,
            isEmissiveBlink: emissiveBlink || isExperimentOverloaded,
          }}
        />
      ))}
    </group>
  );
};

/**
 * Vision Cursor Raycaster: tracks normalized vision cursor {x, y} and triggers hover / selection
 */
const VisionRaycastTracker: React.FC<{
  gestureCursor?: { x: number; y: number } | null;
  gestureState?: GestureState;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}> = ({ gestureCursor, gestureState, onHover, onSelect }) => {
  const { camera, scene, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const lastStateRef = useRef<GestureState>('IDLE');

  useEffect(() => {
    if (!gestureCursor) {
      onHover(null);
      return;
    }

    // Convert cursor (0 to 1) into NDC (-1 to 1)
    const ndcX = gestureCursor.x * 2 - 1;
    const ndcY = -(gestureCursor.y * 2 - 1);

    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    let foundComponentId: string | null = null;
    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== scene) {
        if (obj.userData?.componentId) {
          foundComponentId = obj.userData.componentId;
          break;
        }
        obj = obj.parent;
      }
      if (foundComponentId) break;
    }

    onHover(foundComponentId);

    // On PINCH_START transition: trigger selection
    if (gestureState === 'PINCH_START' && lastStateRef.current !== 'PINCH_START') {
      if (foundComponentId) {
        onSelect(foundComponentId);
      }
    }

    lastStateRef.current = gestureState || 'IDLE';
  }, [gestureCursor, gestureState, camera, scene, gl, raycaster, onHover, onSelect]);

  return null;
};

export const GenericSceneCanvas: React.FC<GenericSceneCanvasProps> = ({
  spec,
  viewMode,
  mode,
  explodedProgress,
  selectedComponentId,
  onSelectComponent,
  connectionFilter,
  activeExperiment,
  activeAssemblyStepIndex = 0,
  gestureCursor,
  gestureState,
  rotateMode,
}) => {
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);

  // Components visible in current assembly step
  const visibleComponents = useMemo(() => {
    if (mode !== 'assembly' || !spec.assemblySteps || spec.assemblySteps.length === 0) {
      return spec.components;
    }
    const currentStep = spec.assemblySteps[activeAssemblyStepIndex];
    if (!currentStep) return spec.components;

    // Accumulate components up to current step
    const allowedIds = new Set<string>();
    for (let i = 0; i <= activeAssemblyStepIndex; i++) {
      const step = spec.assemblySteps[i];
      if (step) {
        step.componentIds.forEach((id) => allowedIds.add(id));
      }
    }
    return spec.components.filter((c) => allowedIds.has(c.id));
  }, [spec, mode, activeAssemblyStepIndex]);

  return (
    <div className="relative w-full h-full select-none">
      <Canvas
        camera={{ position: [4, 3, 5], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        shadows
        className="w-full h-full"
      >
        <color attach="background" args={['#070B14']} />

        {/* Ambient & Directional Lighting */}
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 15, 10]} intensity={1.4} castShadow />
        <directionalLight position={[-10, 8, -10]} intensity={0.6} color="#38BDF8" />
        <pointLight position={[0, -5, 0]} intensity={0.4} color="#0EA5E9" />

        {/* Bounding auto-fit camera */}
        <AutoFitCameraController spec={spec} rotateMode={rotateMode} />

        {/* Subtle ground orientation grid */}
        <Grid
          infiniteGrid
          cellSize={0.5}
          sectionSize={2.0}
          cellColor="#0F172A"
          sectionColor="#1E293B"
          fadeDistance={25}
          position={[0, -1.8, 0]}
        />

        {/* Procedural Components Assembly */}
        <group name="spec-assembly">
          {visibleComponents.map((component) => (
            <SceneComponentNode
              key={component.id}
              component={component}
              spec={spec}
              mode={mode}
              viewMode={viewMode}
              explodedProgress={explodedProgress}
              isSelected={selectedComponentId === component.id}
              isHovered={hoveredComponentId === component.id}
              hasSelectedOther={Boolean(selectedComponentId && selectedComponentId !== component.id)}
              activeExperiment={activeExperiment}
              onHover={setHoveredComponentId}
              onSelect={onSelectComponent}
            />
          ))}
        </group>

        {/* Trace Mode Connections */}
        {(mode === 'trace' || mode === 'explore') && (
          <SceneConnectionPipes
            connections={spec.connections || []}
            components={spec.components}
            activeFilter={connectionFilter}
            selectedComponentId={selectedComponentId}
            explodedProgress={explodedProgress}
          />
        )}

        {/* Orbit Controls (mouse / touch) */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.06}
          rotateSpeed={0.8}
          minDistance={1.2}
          maxDistance={35}
        />
        <GestureOrbitController gestureCursor={gestureCursor} rotateMode={rotateMode} />

        {/* Vision WebSocket Raycaster */}
        <VisionRaycastTracker
          gestureCursor={gestureCursor}
          gestureState={gestureState}
          onHover={setHoveredComponentId}
          onSelect={onSelectComponent}
        />
      </Canvas>

      {/* Watermark & Honesty Badges */}
      <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1.5 z-10">
        <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700/60 text-slate-300 backdrop-blur-md shadow-md">
          📐 {spec.scaleNote || 'Approx. 1:1 scale model'}
        </span>
        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-slate-900/60 border border-slate-800 text-slate-400 backdrop-blur-md">
          Simplified procedural geometry
        </span>
      </div>

      {/* Mechanism Honesty Notice during Operate Mode */}
      {mode === 'operate' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none z-10 px-3.5 py-1.5 rounded-full bg-sky-950/90 border border-sky-400/40 text-sky-200 text-xs font-medium backdrop-blur-md shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
          <span>Conceptual demonstration · Operating physical mechanisms</span>
        </div>
      )}
    </div>
  );
};
