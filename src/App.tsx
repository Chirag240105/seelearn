import React, { useRef, useState, lazy, Suspense } from 'react';
import { SceneSpec } from './types/sceneSpec';
import { DEFAULT_SAMPLE, getSampleByTopic, addRecentModel } from './data/samples/samplesIndex';
import { seeLearnApiClient } from './services/awsClient';
import { PromptScreen } from './components/screens/PromptScreen';
import { PerfPanel } from './components/overlays/PerfPanel';
import { GlobalGestureCursor } from './components/overlays/GlobalGestureCursor';

const LoadingScreen = lazy(() =>
  import('./components/screens/LoadingScreen').then((m) => ({ default: m.LoadingScreen }))
);
const WorkspaceScreen = lazy(() =>
  import('./components/screens/WorkspaceScreen').then((m) => ({ default: m.WorkspaceScreen }))
);

export default function App() {
  const [screen, setScreen] = useState<'prompt' | 'loading' | 'workspace'>('prompt');
  const [activePrompt, setActivePrompt] = useState<string>(
    "I'm building a racing drone, show me components, wiring and how it works"
  );
  const [activeSpec, setActiveSpec] = useState<SceneSpec>(DEFAULT_SAMPLE);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const generationRunId = useRef(0);

  // Triggered when user enters a prompt or clicks Run
  const handleRunPrompt = async (promptText: string) => {
    seeLearnApiClient.cancelGeneration();
    const runId = ++generationRunId.current;
    setActivePrompt(promptText);
    setLoadingError(null);
    setNotice(null);
    setIsGenerating(false);
    setScreen('loading');

    if (!seeLearnApiClient.getEndpoint()) {
      setLoadingError(
        'Generation needs the AWS backend. Choose a model from the library instead.'
      );
      return;
    }

    setIsGenerating(true);

    try {
      const result = await seeLearnApiClient.generateSceneSpec(promptText);
      if (runId !== generationRunId.current) return;

      if (result.success && result.spec) {
        const specWithProvider: SceneSpec = {
          ...result.spec,
          ...(result.provider ? { provider: result.provider } : {}),
        };
        addRecentModel(specWithProvider);
        setActiveSpec(specWithProvider);
        if (result.isOffline && result.error) {
          setNotice(result.error);
        } else {
          setNotice(null);
        }
        setScreen('workspace');
      } else if (result.refusal) {
        setLoadingError(result.refusal);
      } else {
        setLoadingError('The generation backend is not ready. Open a sample instead.');
      }
    } catch (err: any) {
      if (runId !== generationRunId.current) return;
      console.warn('Generation error:', err);
      setLoadingError('The generation backend is not ready. Open a sample instead.');
    } finally {
      if (runId === generationRunId.current) setIsGenerating(false);
    }
  };

  const handleSelectSpec = (spec: SceneSpec) => {
    addRecentModel(spec);
    setActiveSpec(spec);
    setNotice(null);
    setScreen('workspace');
  };

  const handleBackToPrompt = () => {
    seeLearnApiClient.cancelGeneration();
    generationRunId.current++;
    setScreen('prompt');
  };

  const handleOpenSampleFromLoading = (chosenSpec?: SceneSpec) => {
    seeLearnApiClient.cancelGeneration();
    generationRunId.current++;
    const target = chosenSpec || getSampleByTopic(activePrompt) || DEFAULT_SAMPLE;
    addRecentModel(target);
    setActiveSpec(target);
    setLoadingError(null);
    setIsGenerating(false);
    setNotice(null);
    setScreen('workspace');
  };

  return (
    <div className="w-full h-full min-h-screen" style={{ backgroundColor: 'var(--sl-bg-base)' }}>
      {screen === 'prompt' && (
        <PromptScreen
          initialPrompt={activePrompt}
          onRunPrompt={handleRunPrompt}
          onSelectSpec={handleSelectSpec}
        />
      )}

      <Suspense
        fallback={
          <div
            className="w-full h-full min-h-screen flex items-center justify-center font-mono text-xs"
            style={{ backgroundColor: 'var(--sl-bg-base)', color: 'var(--sl-text-secondary)' }}
          >
            Loading...
          </div>
        }
      >
        {screen === 'loading' && (
          <LoadingScreen
            goalPrompt={activePrompt}
            isGenerating={isGenerating}
            onOpenSample={handleOpenSampleFromLoading}
            error={loadingError}
            onRetry={seeLearnApiClient.getEndpoint() ? () => handleRunPrompt(activePrompt) : undefined}
            onBackToLibrary={handleBackToPrompt}
            onEditTopic={handleBackToPrompt}
          />
        )}

        {screen === 'workspace' && (
          <>
            <WorkspaceScreen
              spec={activeSpec}
              onBackToPrompt={handleBackToPrompt}
              onSelectSpec={handleSelectSpec}
              onRegenerate={() => handleRunPrompt(activePrompt)}
            />

            {notice && (
              <div
                className="fixed bottom-20 right-6 z-50 max-w-sm p-4 rounded-xl shadow-2xl text-xs flex flex-col gap-2 border"
                style={{
                  backgroundColor: 'var(--sl-bg-surface)',
                  borderColor: 'var(--sl-accent)',
                  color: 'var(--sl-text-primary)',
                }}
              >
                <span className="font-bold uppercase tracking-wider text-xs" style={{ color: 'var(--sl-accent)' }}>
                  System Notice
                </span>
                <p style={{ color: 'var(--sl-text-secondary)' }}>{notice}</p>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="self-end px-3 py-1 rounded text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--sl-accent)',
                    color: '#ffffff',
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </>
        )}
      </Suspense>

      <PerfPanel />
      <GlobalGestureCursor />
    </div>
  );
}
