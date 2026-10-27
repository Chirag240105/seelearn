import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Lightformer,
  MeshReflectorMaterial,
  OrbitControls,
  SoftShadows,
} from '@react-three/drei';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SceneComponent, SceneExperiment, ScenePart, SceneSpec, ConnectionType } from '../../types/sceneSpec';
import { GestureState } from '../../types/vision';
import { ProceduralPartMesh } from './ProceduralPartMesh';
import { SceneConnectionPipes } from './SceneConnectionPipes';
import { perfStore } from '../../services/perfStore';

const PerfMonitorBridge: React.FC = () => {
  const { gl } = useThree();
  useFrame((_, delta) => {
    perfStore.updateThreeMetrics(gl, delta);
  });
  return null;
};

interface GenericSceneCanvasProps {
  spec: SceneSpec;
  viewMode: 'solid' | 'xray' | 'exploded';
  mode: 'explore' | 'trace' | 'operate' | 'experiment' | 'assembly';
  explodedProgress: number;
  selectedComponentId?: string;
  onSelectComponent: (id: string) => void;
  connectionFilter: 'all' | ConnectionType;
  activeExperiment?: SceneExperiment | null;
  activeAssemblyStepIndex?: number;
  gestureCursor?: { x: number; y: number } | null;
  gestureState?: GestureState;
  rotateMode?: boolean;
  detected?: boolean;
  resetToken?: number;
}

function partHalfExtents(part: ScenePart): THREE.Vector3 {
  const size = part.size || [0.5];
  if (part.shape === 'box' || part.shape === 'roundedBox') {
    return new THREE.Vector3((size[0] || 1) / 2, (size[1] || 1) / 2, (size[2] || 1) / 2);
  }
  if (part.shape === 'sphere') {
    return new THREE.Vector3(size[0] || 0.5, size[0] || 0.5, size[0] || 0.5);
  }
  if (part.shape === 'torus') {
    return new THREE.Vector3((size[0] || 0.5) + (size[1] || 0.1), size[1] || 0.1, (size[0] || 0.5) + (size[1] || 0.1));
  }
  return new THREE.Vector3(size[0] || 0.5, (size[1] || 1) / 2, size[0] || 0.5);
}

function getSceneBounds(spec: SceneSpec): THREE.Box3 {
  const bounds = new THREE.Box3();
  spec.components.forEach((component) =>
    component.parts.forEach((part) => {
      const position = new THREE.Vector3(...part.position);
      const half = partHalfExtents(part);
      bounds.expandByPoint(position.clone().sub(half));
      bounds.expandByPoint(position.clone().add(half));
    })
  );
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2));
  return bounds;
}

function getComponentCenter(component: SceneComponent): THREE.Vector3 {
  const bounds = new THREE.Box3();
  component.parts.forEach((part) => {
    const position = new THREE.Vector3(...part.position);
    const half = partHalfExtents(part);
    bounds.expandByPoint(position.clone().sub(half));
    bounds.expandByPoint(position.clone().add(half));
  });
  return bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
}

function parseAxisVector(axis: any): THREE.Vector3 {
  if (Array.isArray(axis) && axis.length >= 3) {
    return new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  }
  if (typeof axis === 'string') {
    const lower = axis.toLowerCase();
    if (lower === 'x') return new THREE.Vector3(1, 0, 0);
    if (lower === 'y') return new THREE.Vector3(0, 1, 0);
    if (lower === 'z') return new THREE.Vector3(0, 0, 1);
  }
  return new THREE.Vector3(0, 1, 0);
}

// Smooth camera controller: flies to frame selected component, eases back on deselect, auto-fits to ~60% viewport
const SmoothCameraController: React.FC<{
  spec: SceneSpec;
  selectedComponentId?: string;
  resetToken: number;
}> = ({ spec, selectedComponentId, resetToken }) => {
  const { camera, controls } = useThree();
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const targetCamPos = useRef(new THREE.Vector3(4, 3, 5));
  const isTransitioning = useRef(false);

  // Compute default overview camera distance to fill ~60% of viewport
  const defaultPose = useMemo(() => {
    const size = getSceneBounds(spec).getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1.5);
    const distance = maxDimension / 2 / Math.tan((38 * Math.PI) / 360) / 0.6;
    return {
      pos: new THREE.Vector3(distance * 0.72, distance * 0.56, distance * 0.82),
      target: new THREE.Vector3(0, 0, 0),
    };
  }, [spec]);

  // Reset or initial fit
  useEffect(() => {
    targetCamPos.current.copy(defaultPose.pos);
    targetLookAt.current.copy(defaultPose.target);
    isTransitioning.current = true;
  }, [defaultPose, resetToken]);

  // Smooth framing when selected component changes, ease back when deselected
  useEffect(() => {
    if (!selectedComponentId) {
      // Ease back to overview
      targetCamPos.current.copy(defaultPose.pos);
      targetLookAt.current.copy(defaultPose.target);
      isTransitioning.current = true;
      return;
    }

    const comp = spec.components.find((c) => c.id === selectedComponentId);
    if (!comp) return;

    const center = getComponentCenter(comp);
    const bounds = new THREE.Box3();
    comp.parts.forEach((p) => {
      const pos = new THREE.Vector3(...p.position);
      const half = partHalfExtents(p);
      bounds.expandByPoint(pos.clone().sub(half));
      bounds.expandByPoint(pos.clone().add(half));
    });
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const dist = Math.max(1.8, maxDim / 2 / Math.tan((38 * Math.PI) / 360) / 0.55);

    const dir = camera.position.clone().sub(center).normalize();
    if (dir.lengthSq() < 0.01) dir.set(1, 0.7, 1).normalize();

    targetCamPos.current.copy(center).addScaledVector(dir, dist);
    targetLookAt.current.copy(center);
    isTransitioning.current = true;
  }, [selectedComponentId, spec, camera, defaultPose]);

  useFrame((_, delta) => {
    if (!isTransitioning.current) return;
    const t = Math.min(1, delta * 4.5);
    camera.position.lerp(targetCamPos.current, t);
    if (controls) {
      const orbit = controls as any;
      orbit.target.lerp(targetLookAt.current, t);
      orbit.update();
    }
    if (
      camera.position.distanceTo(targetCamPos.current) < 0.02 &&
      (controls ? (controls as any).target.distanceTo(targetLookAt.current) < 0.02 : true)
    ) {
      isTransitioning.current = false;
    }
  });

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
    const orbit = controls as any;
    if (!orbit.rotateLeft || !orbit.rotateUp || !orbit.update) return;

    window.dispatchEvent(new Event('viewer-interaction'));
    orbit.rotateLeft((gestureCursor.x - previous.x) * Math.PI);
    orbit.rotateUp((gestureCursor.y - previous.y) * Math.PI);
    orbit.update();
  }, [controls, gestureCursor, rotateMode]);

  return null;
};

// Auto-rotate stops on interaction and resumes after 5 seconds
const IdleAutoRotate: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const { controls } = useThree();
  const lastInteraction = useRef(Date.now());

  useEffect(() => {
    const reset = () => {
      lastInteraction.current = Date.now();
    };
    window.addEventListener('viewer-interaction', reset);
    return () => window.removeEventListener('viewer-interaction', reset);
  }, []);

  useFrame(() => {
    if (controls) {
      (controls as any).autoRotate = enabled && Date.now() - lastInteraction.current >= 5000;
    }
  });

  return null;
};

// Subtle studio post-processing: SMAA, Vignette, Selective Bloom, with automatic FPS fallback
const AdaptivePostProcessing: React.FC<{ hasSelection: boolean }> = ({ hasSelection }) => {
  const { gl, scene, camera, size } = useThree();
  const [enabled, setEnabled] = useState(true);

  const composer = useMemo(() => {
    const instance = new EffectComposer(gl, new THREE.WebGLRenderTarget(size.width, size.height, {
      samples: 0,
    }));
    instance.addPass(new RenderPass(scene, camera));

    // Selective soft bloom: high threshold so only selected components & traces bloom softly
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      hasSelection ? 0.22 : 0.08,
      0.35,
      0.95
    );
    instance.addPass(bloom);

    // Subtle lens vignette to draw eye to center
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['offset'].value = 0.95;
    vignettePass.uniforms['darkness'].value = 1.05;
    instance.addPass(vignettePass);

    instance.addPass(new SMAAPass());
    instance.addPass(new OutputPass());
    return instance;
  }, [gl, scene, camera, hasSelection, size.width, size.height]);

  const sample = useRef({ frames: 0, seconds: 0 });

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size.width, size.height]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, delta) => {
    sample.current.frames += 1;
    sample.current.seconds += delta;
    if (sample.current.seconds >= 1) {
      const fps = sample.current.frames / sample.current.seconds;
      setEnabled(fps >= 45); // Safe fallback if FPS drops below 45
      sample.current = { frames: 0, seconds: 0 };
    }
    if (enabled) {
      composer.render(delta);
    } else {
      gl.render(scene, camera);
    }
  }, 1);

  return null;
};

// Dashed line indicator for exploded view connecting back to initial position
const ExplodeDashedGuide: React.FC<{
  currentOffset: THREE.Vector3;
}> = ({ currentOffset }) => {
  const lineRef = useRef<THREE.Line>(null);
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-currentOffset.x, -currentOffset.y, -currentOffset.z),
    ]);
    return geom;
  }, [currentOffset.x, currentOffset.y, currentOffset.z]);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [geometry]);

  return (
    <line ref={lineRef as any} geometry={geometry}>
      <lineDashedMaterial
        color="#64748b"
        dashSize={0.15}
        gapSize={0.1}
        transparent
        opacity={0.45}
        depthWrite={false}
      />
    </line>
  );
};

const SceneComponentNode: React.FC<{
  component: SceneComponent;
  spec: SceneSpec;
  mode: GenericSceneCanvasProps['mode'];
  viewMode: GenericSceneCanvasProps['viewMode'];
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
  const rootRef = useRef<THREE.Group>(null);
  const pivotRefs = useRef<Map<string, THREE.Group>>(new Map());
  const blinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [emissiveBlink, setEmissiveBlink] = useState(false);
  const center = useMemo(() => getComponentCenter(component), [component]);

  // Motion blur disc fade-in state for spinning propellers
  const [spinSpeedFactor, setSpinSpeedFactor] = useState(0);

  const groups = useMemo(() => {
    const map = new Map<string, ScenePart[]>();
    component.parts.forEach((part) => {
      const key = part.motionGroup || '__component__';
      map.set(key, [...(map.get(key) || []), part]);
    });
    return Array.from(map.entries()).map(([key, parts]) => {
      const marker = parts.find((part) => part.motionCenter);
      const pivot = marker
        ? new THREE.Vector3(...marker.position)
        : key === '__component__'
        ? center
        : parts
            .reduce((sum, part) => sum.add(new THREE.Vector3(...part.position)), new THREE.Vector3())
            .multiplyScalar(1 / parts.length);
      return { key, parts, pivot };
    });
  }, [component, center]);

  const mechanism = useMemo(
    () =>
      mode === 'operate'
        ? (spec.mechanisms || []).find(
            (candidate) =>
              ['spin', 'oscillate', 'blink'].includes(candidate.type) && candidate.targets.includes(component.id)
          ) || null
        : null,
    [spec.mechanisms, component.id, mode]
  );

  const disabled = Boolean(
    activeExperiment?.targets.includes(component.id) && ['remove', 'disable'].includes(activeExperiment.action)
  );
  const reversed = Boolean(
    activeExperiment?.targets.includes(component.id) && activeExperiment.action === 'reverse'
  );
  const overloaded = Boolean(
    activeExperiment?.targets.includes(component.id) && activeExperiment.action === 'overload'
  );

  useEffect(() => {
    if (blinkTimer.current) clearInterval(blinkTimer.current);
    blinkTimer.current = null;
    if (mode === 'operate' && mechanism?.type === 'blink' && !disabled) {
      blinkTimer.current = setInterval(
        () => setEmissiveBlink((value) => !value),
        Math.max(120, 500 / (mechanism.speed || 1))
      );
    } else {
      setEmissiveBlink(false);
    }
    return () => {
      if (blinkTimer.current) clearInterval(blinkTimer.current);
    };
  }, [mode, mechanism, disabled]);

  useEffect(() => {
    groups.forEach(({ key, pivot }) => {
      const group = pivotRefs.current.get(key);
      if (group) {
        group.rotation.set(0, 0, 0);
        group.position.copy(pivot);
      }
    });
    if (rootRef.current) rootRef.current.position.set(0, 0, 0);
  }, [mode, component.id, mechanism, groups]);

  useFrame((state, delta) => {
    if (!rootRef.current) return;
    const explode = component.explode || [0, 0, 0];
    rootRef.current.position.x = THREE.MathUtils.damp(
      rootRef.current.position.x,
      explode[0] * explodedProgress,
      6,
      delta
    );
    rootRef.current.position.y = THREE.MathUtils.damp(
      rootRef.current.position.y,
      explode[1] * explodedProgress,
      6,
      delta
    );
    rootRef.current.position.z = THREE.MathUtils.damp(
      rootRef.current.position.z,
      explode[2] * explodedProgress,
      6,
      delta
    );

    // Ramp motion blur factor in operate mode
    if (mode === 'operate' && mechanism && !disabled) {
      setSpinSpeedFactor((prev) => Math.min(1, prev + delta * 2.0));
    } else {
      setSpinSpeedFactor((prev) => Math.max(0, prev - delta * 3.0));
    }

    if (!mechanism || mode !== 'operate' || disabled) {
      groups.forEach(({ key, pivot }) => {
        const group = pivotRefs.current.get(key);
        if (group) {
          group.rotation.set(0, 0, 0);
          group.position.lerp(pivot, Math.min(1, delta * 6));
        }
      });
      return;
    }

    // Correctly parse axis vector from string or array
    const axis = parseAxisVector(mechanism.axis);
    const speed = (mechanism.speed || 1) * (reversed ? -1 : 1) * (mechanism.direction || 1);

    groups.forEach(({ key, parts, pivot }) => {
      const group = pivotRefs.current.get(key);
      if (!group) return;
      if (mechanism.type === 'spin') {
        const partDirection = key === '__component__' ? 1 : parts[0]?.motionDirection || 1;
        // Counter-rotation per mechanism direction and pivot around component bounding box center
        group.rotateOnAxis(axis, delta * speed * partDirection * 2.5);
      } else if (mechanism.type === 'oscillate') {
        const offset = Math.sin(state.clock.elapsedTime * speed) * 0.08;
        group.position.set(pivot.x + axis.x * offset, pivot.y + axis.y * offset, pivot.z + axis.z * offset);
      }
    });
  });

  if (activeExperiment?.action === 'remove' && activeExperiment.targets.includes(component.id)) return null;

  const isPropeller = component.id.startsWith('prop_');
  const explodeVector = new THREE.Vector3(...(component.explode || [0, 0, 0])).multiplyScalar(explodedProgress);

  return (
    <group
      ref={rootRef}
      userData={{ componentId: component.id }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(component.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(component.id);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onHover(null);
      }}
    >
      {/* Dashed guide line back to unexploded origin */}
      {explodedProgress > 0.05 && explodeVector.lengthSq() > 0.01 && (
        <ExplodeDashedGuide currentOffset={explodeVector} />
      )}

      {groups.map(({ key, parts, pivot }) => (
        <group
          key={key}
          position={pivot}
          ref={(node) => {
            if (node) pivotRefs.current.set(key, node);
            else pivotRefs.current.delete(key);
          }}
        >
          {parts.map((part, index) => (
            <ProceduralPartMesh
              key={`${component.id}-${key}-${index}`}
              part={{
                ...part,
                position: [part.position[0] - pivot.x, part.position[1] - pivot.y, part.position[2] - pivot.z],
              }}
              options={{
                viewMode,
                isSelected,
                isHovered,
                isDimmed: hasSelectedOther && !isSelected,
                isEmissiveBlink: emissiveBlink || overloaded,
              }}
            />
          ))}

          {/* Translucent motion blur disc for spinning propellers (opacity 0.12 fading in with speed) */}
          {isPropeller && spinSpeedFactor > 0.02 && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <circleGeometry args={[2.08, 48]} />
              <meshBasicMaterial
                color="#60a5fa"
                transparent
                opacity={0.12 * spinSpeedFactor}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
};

const VisionRaycastTracker: React.FC<{
  gestureCursor?: { x: number; y: number } | null;
  gestureState?: GestureState;
  detected?: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}> = ({ gestureCursor, gestureState, detected, onHover, onSelect }) => {
  const { camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const previousState = useRef<GestureState>('IDLE');
  const pinchTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!detected || !gestureCursor) {
      onHover(null);
      pinchTarget.current = null;
      previousState.current = 'IDLE';
      return;
    }
    raycaster.setFromCamera(new THREE.Vector2(gestureCursor.x * 2 - 1, -(gestureCursor.y * 2 - 1)), camera);
    const intersections = raycaster.intersectObjects(scene.children, true);
    let componentId: string | null = null;
    for (const hit of intersections) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object !== scene) {
        if (object.userData?.componentId) {
          componentId = object.userData.componentId;
          break;
        }
        object = object.parent;
      }
      if (componentId) break;
    }
    onHover(componentId);
    if (gestureState === 'PINCH_START' && previousState.current !== 'PINCH_START') {
      pinchTarget.current = componentId;
    }
    if (gestureState === 'PINCH_RELEASE' && previousState.current !== 'PINCH_RELEASE') {
      if (pinchTarget.current && pinchTarget.current === componentId) {
        onSelect(pinchTarget.current);
      }
      pinchTarget.current = null;
    }
    previousState.current = gestureState || 'IDLE';
  }, [gestureCursor, gestureState, detected, camera, scene, raycaster, onHover, onSelect]);

  return null;
};

// Gentle hover bob in operate mode (~0.05 units)
const HoverBobGroup: React.FC<{
  isOperate: boolean;
  children: React.ReactNode;
}> = ({ isOperate, children }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const targetY = isOperate ? Math.sin(state.clock.elapsedTime * 2.8) * 0.05 : 0;
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, targetY, 4, delta);
  });

  return <group ref={groupRef}>{children}</group>;
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
  detected,
  resetToken = 0,
}) => {
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const sceneBounds = useMemo(() => getSceneBounds(spec), [spec]);
  const sceneCenter = useMemo(() => sceneBounds.getCenter(new THREE.Vector3()), [sceneBounds]);
  const hoveredComponent = spec.components.find((component) => component.id === hoveredComponentId);

  const visibleComponents = useMemo(() => {
    if (mode !== 'assembly' || !spec.assemblySteps?.length) return spec.components;
    const visibleIds = new Set(
      spec.assemblySteps.slice(0, activeAssemblyStepIndex + 1).flatMap((step) => step.componentIds)
    );
    return spec.components.filter((component) => visibleIds.has(component.id));
  }, [spec, mode, activeAssemblyStepIndex]);

  const groundY = sceneBounds.min.y - sceneCenter.y - 0.08;
  const modelScale = sceneBounds.getSize(new THREE.Vector3()).length();

  return (
    <div
      className="relative w-full h-full select-none"
      style={{
        background: 'radial-gradient(ellipse at 50% 35%, var(--sl-bg-raised) 0%, var(--sl-bg-base) 80%)',
      }}
    >
      <Canvas
        camera={{ position: [4, 3, 5], fov: 38 }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0, // Calibrated ACESFilmic exposure 1.0
        }}
        shadows
        className="w-full h-full"
      >
        {/* SoftShadows PCSS simulation for realistic CAD contact shadows */}
        <SoftShadows size={15} samples={16} focus={0.5} />

        {/* Ambient & Key Lights */}
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[6, 10, 6]}
          intensity={1.9}
          color="#f8fafc"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-6, 4, 3]} intensity={0.5} color="#93c5fd" />
        <directionalLight position={[0, -4, -4]} intensity={0.25} color="#64748b" />

        {/* Studio Lighting Environment with Lightformers */}
        <Environment resolution={512}>
          {/* Large soft top light */}
          <Lightformer
            form="rect"
            intensity={1.6}
            position={[0, 8, 0]}
            scale={[12, 12, 1]}
            rotation-x={Math.PI / 2}
          />
          {/* Two thin strip lights for crisp edge reflections */}
          <Lightformer
            form="rect"
            intensity={2.2}
            position={[-6, 2, -3]}
            scale={[1, 12, 1]}
            rotation-y={Math.PI / 3}
            color="#93c5fd"
          />
          <Lightformer
            form="rect"
            intensity={2.0}
            position={[6, 2, 3]}
            scale={[1, 12, 1]}
            rotation-y={-Math.PI / 3}
            color="#f8fafc"
          />
        </Environment>

        <SmoothCameraController
          spec={spec}
          selectedComponentId={selectedComponentId}
          resetToken={resetToken}
        />

        {/* Soft Contact Shadow below model */}
        <ContactShadows
          position={[0, groundY, 0]}
          opacity={0.32}
          scale={Math.max(5, modelScale * 1.5)}
          blur={2.4}
          far={6}
          resolution={512}
        />

        {/* Subtle reflective floor with faint ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.005, 0]}>
          <planeGeometry args={[30, 30]} />
          <MeshReflectorMaterial
            blur={[300, 100]}
            resolution={512}
            mirror={0.12}
            mixBlur={0.8}
            mixStrength={1.2}
            roughness={0.7}
            depthScale={1.2}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#090d16"
            metalness={0.15}
          />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY + 0.005, 0]}>
          <ringGeometry args={[Math.max(2.0, modelScale * 0.35), Math.max(2.015, modelScale * 0.355), 96]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.2} />
        </mesh>

        {/* Centered Assembly Group with Gentle Hover Bob in Operate mode */}
        <HoverBobGroup isOperate={mode === 'operate'}>
          <group position={[-sceneCenter.x, -sceneCenter.y, -sceneCenter.z]}>
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
            {(mode === 'trace' || mode === 'explore') && (
              <SceneConnectionPipes
                connections={spec.connections || []}
                components={spec.components}
                activeFilter={connectionFilter}
                selectedComponentId={selectedComponentId}
                explodedProgress={explodedProgress}
              />
            )}
          </group>
        </HoverBobGroup>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.8}
          minDistance={1.0}
          maxDistance={35}
          autoRotate={false}
          autoRotateSpeed={0.4}
          onStart={() => window.dispatchEvent(new Event('viewer-interaction'))}
        />

        <IdleAutoRotate enabled={!rotateMode && !selectedComponentId} />
        <GestureOrbitController gestureCursor={gestureCursor} rotateMode={rotateMode} />
        <VisionRaycastTracker
          gestureCursor={gestureCursor}
          gestureState={gestureState}
          detected={detected}
          onHover={setHoveredComponentId}
          onSelect={onSelectComponent}
        />

        <AdaptivePostProcessing hasSelection={Boolean(selectedComponentId)} />
        <PerfMonitorBridge />
      </Canvas>

      {/* Top-left scale note badge */}
      <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1.5 z-10 max-w-[min(28rem,55vw)]">
        <span
          className="text-xs px-2.5 py-1.5 rounded-lg border backdrop-blur-md font-medium"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border)',
            color: 'var(--sl-text-primary)',
          }}
        >
          {spec.scaleNote || 'Approximate conceptual scale'}
        </span>
      </div>

      {/* Hover tooltip: soft glow and name */}
      {hoveredComponent && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded-full px-4 py-1.5 text-xs font-semibold border backdrop-blur-md shadow-lg transition-all"
          style={{
            backgroundColor: 'var(--sl-bg-overlay)',
            borderColor: 'var(--sl-accent)',
            color: 'var(--sl-text-primary)',
          }}
        >
          {hoveredComponent.name}
        </div>
      )}
    </div>
  );
};
