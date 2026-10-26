import { SceneSpec, SceneComponent, ScenePart, MaterialPreset, PartShape, ConnectionType } from '../types/sceneSpec';

export const ALLOWED_MATERIALS: MaterialPreset[] = [
  'carbon_fiber',
  'brushed_metal',
  'polished_metal',
  'gold',
  'copper',
  'aluminum_heatsink',
  'pcb_green',
  'pcb_black',
  'silicon_die',
  'ceramic',
  'black_plastic',
  'white_plastic',
  'rubber',
  'glass',
  'smoked_glass',
  'translucent_blue',
  'led_emissive',
];

export const ALLOWED_SHAPES: PartShape[] = [
  'box',
  'roundedBox',
  'cylinder',
  'sphere',
  'cone',
  'torus',
  'ring',
  'tube',
];

export const ALLOWED_CONNECTION_TYPES: ConnectionType[] = [
  'power',
  'signal',
  'data',
  'mechanical',
  'thermal',
];

export interface ValidationResult {
  valid: boolean;
  spec: SceneSpec;
  warnings: string[];
  errors: string[];
}

function normalizeMaterial(rawMaterial: any): MaterialPreset {
  if (typeof rawMaterial !== 'string') return 'aluminum_heatsink';
  const mat = rawMaterial.toLowerCase().trim().replace(/[\s-]+/g, '_');

  if (ALLOWED_MATERIALS.includes(mat as MaterialPreset)) {
    return mat as MaterialPreset;
  }

  // Fuzzy mappings
  if (mat.includes('carbon')) return 'carbon_fiber';
  if (mat.includes('gold')) return 'gold';
  if (mat.includes('copper')) return 'copper';
  if (mat.includes('brush') || mat.includes('steel') || mat.includes('metal')) return 'brushed_metal';
  if (mat.includes('polish') || mat.includes('chrome')) return 'polished_metal';
  if (mat.includes('heatsink') || mat.includes('aluminum')) return 'aluminum_heatsink';
  if (mat.includes('pcb') && mat.includes('black')) return 'pcb_black';
  if (mat.includes('pcb')) return 'pcb_green';
  if (mat.includes('silicon') || mat.includes('chip') || mat.includes('die')) return 'silicon_die';
  if (mat.includes('ceramic')) return 'ceramic';
  if (mat.includes('rubber') || mat.includes('tire')) return 'rubber';
  if (mat.includes('glass') && mat.includes('smoke')) return 'smoked_glass';
  if (mat.includes('glass')) return 'glass';
  if (mat.includes('white')) return 'white_plastic';
  if (mat.includes('led') || mat.includes('light') || mat.includes('emit')) return 'led_emissive';
  if (mat.includes('translucent') || mat.includes('blue')) return 'translucent_blue';

  return 'black_plastic';
}

function normalizeShape(rawShape: any): PartShape {
  if (typeof rawShape !== 'string') return 'box';
  const shape = rawShape.toLowerCase().trim();
  if (ALLOWED_SHAPES.includes(shape as PartShape)) {
    return shape as PartShape;
  }
  if (shape.includes('round') || shape.includes('cube')) return 'roundedBox';
  if (shape.includes('cyl') || shape.includes('rod') || shape.includes('pin')) return 'cylinder';
  if (shape.includes('sph') || shape.includes('ball')) return 'sphere';
  if (shape.includes('cone')) return 'cone';
  if (shape.includes('torus') || shape.includes('donut')) return 'torus';
  if (shape.includes('ring')) return 'ring';
  if (shape.includes('tube') || shape.includes('pipe') || shape.includes('wire')) return 'tube';
  return 'box';
}

function clamp(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function sanitizeId(rawId: string): string {
  return rawId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export function validateAndRepairSceneSpec(raw: any): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      spec: null as any,
      warnings: [],
      errors: ['Scene spec must be a non-null JSON object.'],
    };
  }

  const topic = typeof raw.topic === 'string' && raw.topic.trim() ? raw.topic.trim() : 'Engineering Machine';
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : topic;
  const overview = typeof raw.overview === 'string' && raw.overview.trim() ? raw.overview.trim() : `Explorable 3D assembly model of ${title}.`;
  const scaleNote = typeof raw.scaleNote === 'string' && raw.scaleNote.trim() ? raw.scaleNote.trim() : 'Approx. 1:1 scale conceptual engineering model.';

  const validLayouts = ['assembly', 'board', 'stack', 'radial', 'cross_section'];
  const layoutStyle = validLayouts.includes(raw.layoutStyle) ? raw.layoutStyle : 'assembly';

  const learningObjectives: string[] = Array.isArray(raw.learningObjectives) && raw.learningObjectives.length > 0
    ? raw.learningObjectives.map((o: any) => String(o).trim()).filter(Boolean)
    : [
        `Understand key structural and functional components of ${title}`,
        'Trace electrical, signal, and mechanical dependencies between subsystems',
        'Explore physical mechanisms and operational dynamics',
      ];

  // Validate and repair components
  const rawComponents = Array.isArray(raw.components) ? raw.components : [];
  if (rawComponents.length === 0) {
    errors.push('Scene spec must contain at least one component in "components" array.');
  }
  const MAX_COMPONENTS = 30;
  if (rawComponents.length > MAX_COMPONENTS) {
    warnings.push(`Exceeded cap of ${MAX_COMPONENTS} components; remaining components skipped.`);
  }

  const repairedComponents: SceneComponent[] = [];
  const seenIds = new Set<string>();
  const idMap = new Map<string, string>();
  let totalPrimitives = 0;
  const MAX_PRIMITIVES = 250;

  for (let i = 0; i < Math.min(rawComponents.length, MAX_COMPONENTS); i++) {
    if (totalPrimitives >= MAX_PRIMITIVES) {
      warnings.push(`Exceeded cap of ${MAX_PRIMITIVES} 3D primitives; remaining components skipped.`);
      break;
    }

    const rawComp = rawComponents[i];
    if (!rawComp || typeof rawComp !== 'object') continue;

    // Component ID sanitization
    const normalizedId = typeof rawComp.id === 'string' ? sanitizeId(rawComp.id) : '';
    let id = normalizedId || `component_${i + 1}`;

    if (seenIds.has(id)) {
      warnings.push(`Duplicate component ID "${id}" detected. Appending unique suffix.`);
      let suffix = 2;
      while (seenIds.has(`${id}_${suffix}`)) {
        suffix++;
      }
      id = `${id}_${suffix}`;
    }
    seenIds.add(id);
    if (normalizedId && !idMap.has(normalizedId)) {
      idMap.set(normalizedId, id);
    }

    const name = typeof rawComp.name === 'string' && rawComp.name.trim() ? rawComp.name.trim() : `Component ${i + 1}`;
    const group = typeof rawComp.group === 'string' && rawComp.group.trim() ? rawComp.group.trim() : 'Structure';

    // Parts validation
    const rawParts = Array.isArray(rawComp.parts) && rawComp.parts.length > 0 ? rawComp.parts : [{}];
    const repairedParts: ScenePart[] = [];

    for (let pIdx = 0; pIdx < rawParts.length; pIdx++) {
      if (totalPrimitives >= MAX_PRIMITIVES) {
        warnings.push(`Exceeded cap of ${MAX_PRIMITIVES} 3D primitives; remaining sub-parts skipped.`);
        break;
      }

      const p = rawParts[pIdx] || {};
      const shape = normalizeShape(p.shape);
      const material = normalizeMaterial(p.material);

      // Sizes: clamp to reasonable dimensions [0.01, 15]
      let size: number[] = [1, 1, 1];
      if (Array.isArray(p.size) && p.size.length > 0) {
        size = p.size.map((val: any) => clamp(Number(val) || 0.2, 0.01, 15));
      } else {
        if (shape === 'cylinder' || shape === 'cone') size = [0.4, 1.2];
        else if (shape === 'sphere') size = [0.5];
        else if (shape === 'torus') size = [0.6, 0.15];
        else if (shape === 'ring') size = [0.4, 0.6];
        else if (shape === 'tube') size = [0.1];
        else size = [1, 0.5, 1];
      }

      // Positions: clamp to [-15, 15]
      const rawPos = Array.isArray(p.position) ? p.position : [0, 0, 0];
      const position: [number, number, number] = [
        clamp(Number(rawPos[0]) || 0, -15, 15),
        clamp(Number(rawPos[1]) || 0, -15, 15),
        clamp(Number(rawPos[2]) || 0, -15, 15),
      ];

      // Rotations: default [0, 0, 0]
      const rawRot = Array.isArray(p.rotation) ? p.rotation : [0, 0, 0];
      const rotation: [number, number, number] = [
        Number(rawRot[0]) || 0,
        Number(rawRot[1]) || 0,
        Number(rawRot[2]) || 0,
      ];

      const part: ScenePart = {
        shape,
        size,
        position,
        rotation,
        material,
      };

      if (shape === 'tube' && Array.isArray(p.path)) {
        part.path = p.path.map((pt: any) => [
          clamp(Number(pt[0]) || 0, -15, 15),
          clamp(Number(pt[1]) || 0, -15, 15),
          clamp(Number(pt[2]) || 0, -15, 15),
        ]);
      }

      repairedParts.push(part);
      totalPrimitives++;
    }

    // Explode offset
    let explode: [number, number, number] | undefined = undefined;
    if (Array.isArray(rawComp.explode) && rawComp.explode.length === 3) {
      explode = [
        clamp(Number(rawComp.explode[0]) || 0, -10, 10),
        clamp(Number(rawComp.explode[1]) || 0, -10, 10),
        clamp(Number(rawComp.explode[2]) || 0, -10, 10),
      ];
    }

    const confidence = ['high', 'medium', 'low'].includes(rawComp.confidence) ? rawComp.confidence : 'high';
    if (repairedParts.length === 0) {
      if (totalPrimitives >= MAX_PRIMITIVES) {
        warnings.push(`Exceeded cap of ${MAX_PRIMITIVES} 3D primitives; remaining components skipped.`);
        break;
      }
      repairedParts.push({
        shape: 'box',
        size: [1, 1, 1],
        position: [0, 0, 0],
        material: 'aluminum_heatsink',
      });
      totalPrimitives++;
    }

    repairedComponents.push({
      id,
      name,
      group,
      parts: repairedParts,
      summary: typeof rawComp.summary === 'string' && rawComp.summary.trim() ? rawComp.summary.trim() : `${name} operational subsystem.`,
      howItWorks: typeof rawComp.howItWorks === 'string' && rawComp.howItWorks.trim() ? rawComp.howItWorks.trim() : `Functions as part of the ${group} group to deliver core capability.`,
      whyNeeded: typeof rawComp.whyNeeded === 'string' && rawComp.whyNeeded.trim() ? rawComp.whyNeeded.trim() : `Critical for structural, electrical, or mechanical operation of the machine.`,
      keyFacts: Array.isArray(rawComp.keyFacts) ? rawComp.keyFacts.map(String).filter(Boolean).slice(0, 3) : [],
      confidence,
      explode,
    });
  }

  const resolveComponentId = (rawId: unknown): string | undefined => {
    if (typeof rawId !== 'string') return undefined;
    const normalizedId = sanitizeId(rawId);
    return idMap.get(normalizedId) || (seenIds.has(normalizedId) ? normalizedId : undefined);
  };

  // Validate and drop invalid references in connections
  const rawConnections = Array.isArray(raw.connections) ? raw.connections : [];
  const repairedConnections = [];

  for (const c of rawConnections) {
    if (!c || typeof c !== 'object') continue;
    const from = resolveComponentId(c.from);
    const to = resolveComponentId(c.to);

    if (!from || !to) {
      warnings.push(`Dropped connection between unknown component IDs: "${String(c.from || '')}" -> "${String(c.to || '')}".`);
      continue;
    }
    if (from === to) continue;

    const type = ALLOWED_CONNECTION_TYPES.includes(c.type) ? c.type : 'signal';
    repairedConnections.push({
      from,
      to,
      type,
      label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : `${type.toUpperCase()} Link`,
      description: typeof c.description === 'string' ? c.description.trim() : `Interfaces ${from} with ${to}.`,
    });
  }

  // Validate mechanisms
  const rawMechanisms = Array.isArray(raw.mechanisms) ? raw.mechanisms : [];
  const repairedMechanisms: import('../types/sceneSpec').SceneMechanism[] = [];

  for (const m of rawMechanisms) {
    if (!m || typeof m !== 'object') continue;
    const validTargets = Array.isArray(m.targets)
      ? m.targets.map(resolveComponentId).filter((t): t is string => Boolean(t))
      : [];
    if (validTargets.length === 0) continue;

    const type = ['spin', 'pulse_flow', 'oscillate', 'slide', 'blink'].includes(m.type) ? m.type : 'spin';
    const axisTuple: [number, number, number] =
      Array.isArray(m.axis) && m.axis.length === 3
        ? [Number(m.axis[0]) || 0, Number(m.axis[1]) || 1, Number(m.axis[2]) || 0]
        : [0, 1, 0];

    repairedMechanisms.push({
      id: typeof m.id === 'string' ? m.id : `mech_${repairedMechanisms.length + 1}`,
      name: typeof m.name === 'string' ? m.name : 'Operational Mechanism',
      type,
      targets: validTargets,
      axis: axisTuple,
      speed: clamp(Number(m.speed) || 1.0, 0.1, 10),
      direction: m.direction === -1 ? -1 : 1,
      explanation: typeof m.explanation === 'string' ? m.explanation : 'Conceptual operational dynamics.',
    });
  }

  // Validate assemblySteps
  const rawSteps = Array.isArray(raw.assemblySteps) ? raw.assemblySteps : [];
  const repairedSteps: import('../types/sceneSpec').SceneAssemblyStep[] = [];

  for (let sIdx = 0; sIdx < rawSteps.length; sIdx++) {
    const s = rawSteps[sIdx];
    if (!s || typeof s !== 'object') continue;
    const validCompIds = Array.isArray(s.componentIds)
      ? s.componentIds.map(resolveComponentId).filter((id): id is string => Boolean(id))
      : [];

    repairedSteps.push({
      order: sIdx + 1,
      componentIds: validCompIds,
      instruction: typeof s.instruction === 'string' && s.instruction.trim() ? s.instruction.trim() : `Assemble hardware components.`,
    });
  }

  // Validate experiments
  const rawExperiments = Array.isArray(raw.experiments) ? raw.experiments : [];
  const repairedExperiments: import('../types/sceneSpec').SceneExperiment[] = [];

  for (let eIdx = 0; eIdx < rawExperiments.length; eIdx++) {
    const exp = rawExperiments[eIdx];
    if (!exp || typeof exp !== 'object') continue;
    const validTargets = Array.isArray(exp.targets)
      ? exp.targets.map(resolveComponentId).filter((t): t is string => Boolean(t))
      : [];
    if (validTargets.length === 0) continue;

    const action = ['disable', 'reverse', 'remove', 'overload'].includes(exp.action) ? exp.action : 'disable';

    repairedExperiments.push({
      id: typeof exp.id === 'string' ? exp.id : `exp_${eIdx + 1}`,
      title: typeof exp.title === 'string' ? exp.title : `What happens if ${validTargets[0]} fails?`,
      action,
      targets: validTargets,
      consequence: typeof exp.consequence === 'string' ? exp.consequence : 'Subsystem degradation occurs.',
      explanation: typeof exp.explanation === 'string' ? exp.explanation : 'Hardware failure mode analysis.',
    });
  }

  const repairedSpec: SceneSpec = {
    schemaVersion: 1,
    topic,
    title,
    overview,
    scaleNote,
    layoutStyle,
    learningObjectives,
    components: repairedComponents,
    connections: repairedConnections,
    mechanisms: repairedMechanisms,
    assemblySteps: repairedSteps.length > 0 ? repairedSteps : undefined,
    experiments: repairedExperiments.length > 0 ? repairedExperiments : undefined,
  };

  return {
    valid: errors.length === 0,
    spec: repairedSpec,
    warnings,
    errors,
  };
}
