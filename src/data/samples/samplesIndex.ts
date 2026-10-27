import { SceneSpec } from '../../types/sceneSpec';
import { validateAndRepairSceneSpec } from '../../utils/specValidator';

export interface SampleMeta {
  id: string;
  topic: string;
  title: string;
  subtitle: string;
  tag: string;
  componentCount: number;
  layoutStyle: string;
  spec: SceneSpec;
  isCustom?: boolean;
}

// Automatically load all JSON files in the current directory using import.meta.glob
const sampleModules = import.meta.glob<Record<string, any>>('./*.json', { eager: true });

function deriveTag(spec: SceneSpec): string {
  const topic = spec.topic.toLowerCase();
  if (topic.includes('drone') || topic.includes('quad') || topic.includes('uav')) return 'Aerial Robotics';
  if (topic.includes('motor') || topic.includes('engine') || topic.includes('rotor')) return 'Electromechanics';
  if (topic.includes('phone') || topic.includes('mobile') || topic.includes('tablet')) return 'Consumer Tech';
  if (topic.includes('ram') || topic.includes('chip') || topic.includes('memory') || topic.includes('cpu')) return 'Semiconductor';
  return 'Engineering';
}

function deriveSubtitle(spec: SceneSpec): string {
  if (spec.learningObjectives && spec.learningObjectives.length > 0) {
    return spec.learningObjectives[0];
  }
  return spec.overview?.slice(0, 90) || `${spec.components.length} interconnected components`;
}

// Map the eagerly imported files into validated SampleMeta list
const autoLoadedSamples: SampleMeta[] = [];

for (const path in sampleModules) {
  const mod = sampleModules[path];
  const rawData = mod.default || mod;
  if (rawData && typeof rawData === 'object' && rawData.topic) {
    const validated = validateAndRepairSceneSpec(rawData).spec;
    const filename = path.replace(/^.*[\\/]/, '').replace(/\.json$/, '');
    autoLoadedSamples.push({
      id: filename,
      topic: validated.topic,
      title: validated.title,
      subtitle: deriveSubtitle(validated),
      tag: deriveTag(validated),
      componentCount: validated.components.length,
      layoutStyle: validated.layoutStyle,
      spec: validated,
    });
  }
}

// Sort autoLoadedSamples so freestyle_drone is first
autoLoadedSamples.sort((a, b) => {
  if (a.id === 'freestyle_drone') return -1;
  if (b.id === 'freestyle_drone') return 1;
  return 0;
});

// Dynamic custom samples registered by user (e.g. JSON file drop)
const customSamples: SampleMeta[] = [];

// Session cache of recent models (all specs generated or opened this session, cached by lowercase topic)
const recentSpecs = new Map<string, SceneSpec>();

export const BUNDLED_SAMPLES: SampleMeta[] = autoLoadedSamples;

export const DEFAULT_SAMPLE: SceneSpec =
  autoLoadedSamples.find((s) => s.id === 'freestyle_drone')?.spec ||
  autoLoadedSamples.find((s) => s.id === 'racing_drone')?.spec ||
  autoLoadedSamples[0]?.spec;

// Initialize recent cache with default sample
if (DEFAULT_SAMPLE) {
  recentSpecs.set(DEFAULT_SAMPLE.topic.toLowerCase(), DEFAULT_SAMPLE);
}

export function getAllSamples(): SampleMeta[] {
  return [...customSamples, ...autoLoadedSamples];
}

export function registerCustomSample(spec: SceneSpec): SampleMeta {
  const validated = validateAndRepairSceneSpec(spec).spec;
  const id = `custom_${Date.now()}_${validated.topic.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  const meta: SampleMeta = {
    id,
    topic: validated.topic,
    title: validated.title,
    subtitle: deriveSubtitle(validated),
    tag: 'Imported',
    componentCount: validated.components.length,
    layoutStyle: validated.layoutStyle,
    spec: validated,
    isCustom: true,
  };
  customSamples.unshift(meta);
  addRecentModel(validated);
  return meta;
}

export function addRecentModel(spec: SceneSpec): void {
  const key = spec.topic.toLowerCase().trim();
  recentSpecs.set(key, spec);
}

export function getRecentModels(): SceneSpec[] {
  return Array.from(recentSpecs.values());
}

export function getSampleByTopic(query: string): SceneSpec | undefined {
  const q = query.toLowerCase().trim();
  if (!q) return undefined;

  // 1. Check recent session cache
  for (const [key, spec] of recentSpecs.entries()) {
    if (key === q || key.includes(q) || q.includes(key)) {
      return spec;
    }
  }

  // 2. Check bundled & custom samples
  const all = getAllSamples();
  const directMatch = all.find(
    (s) =>
      s.topic.toLowerCase() === q ||
      s.title.toLowerCase().includes(q) ||
      q.includes(s.topic.toLowerCase())
  );
  if (directMatch) return directMatch.spec;

  // 3. Keyword matches
  if (q.includes('drone') || q.includes('quad') || q.includes('uav')) {
    return all.find((s) => s.id === 'racing_drone')?.spec;
  }
  if (q.includes('motor') || q.includes('dc motor') || q.includes('rotor')) {
    return all.find((s) => s.id === 'dc_motor')?.spec;
  }
  if (q.includes('phone') || q.includes('smartphone') || q.includes('mobile')) {
    return all.find((s) => s.id === 'smartphone')?.spec;
  }
  if (q.includes('ram') || q.includes('memory') || q.includes('ddr5') || q.includes('dimm')) {
    return all.find((s) => s.id === 'ddr5_ram')?.spec;
  }

  return undefined;
}

export function getSampleById(id: string): SceneSpec | undefined {
  const match = getAllSamples().find((s) => s.id === id);
  return match ? match.spec : undefined;
}

// Demo mode state (forces library only)
let demoModeActive = typeof window !== 'undefined' && localStorage.getItem('sl-demo-mode') === 'true';

export function isDemoMode(): boolean {
  return demoModeActive;
}

export function setDemoMode(active: boolean): void {
  demoModeActive = active;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sl-demo-mode', active ? 'true' : 'false');
  }
}
