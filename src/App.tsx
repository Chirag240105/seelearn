import React, { useState } from 'react';
import { SceneSpec } from './types/sceneSpec';
import { DEFAULT_SAMPLE, getSampleByTopic } from './data/samples/samplesIndex';
import { seeLearnApiClient } from './services/awsClient';
import { PromptScreen } from './components/screens/PromptScreen';
import { LoadingScreen } from './components/screens/LoadingScreen';
import { WorkspaceScreen } from './components/screens/WorkspaceScreen';

export default function App() {
  const [screen, setScreen] = useState<'prompt' | 'loading' | 'workspace'>('prompt');
  const [activePrompt, setActivePrompt] = useState<string>(
    "I'm building a racing drone, show me components, wiring and how it works"
  );
  const [activeSpec, setActiveSpec] = useState<SceneSpec>(DEFAULT_SAMPLE);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Triggered when user enters a prompt or clicks Run
  const handleRunPrompt = async (promptText: string) => {
    setActivePrompt(promptText);
    setLoadingError(null);
    setIsGenerating(true);
    setScreen('loading');

    try {
      const result = await seeLearnApiClient.generateSceneSpec(promptText);

      if (result.success && result.spec) {
        setActiveSpec(result.spec);
        if (result.isOffline && result.error) {
          setNotice(result.error);
        } else {
          setNotice(null);
        }
        setScreen('workspace');
      } else if (result.refusal) {
        setLoadingError(`Request Refused: ${result.refusal}`);
      } else {
        setLoadingError(result.error || 'Failed to generate assembly. Connect the AWS backend to generate new topics.');
      }
    } catch (err: any) {
      console.warn('Generation error:', err);
      setLoadingError(err?.message || 'Failed to generate scene spec.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectSpec = (spec: SceneSpec) => {
    setActiveSpec(spec);
    setNotice(null);
    setScreen('workspace');
  };

  const handleBackToPrompt = () => {
    setScreen('prompt');
  };

  const handleOpenSampleFromLoading = () => {
    const fallback = getSampleByTopic(activePrompt) || DEFAULT_SAMPLE;
    setActiveSpec(fallback);
    setScreen('workspace');
  };

  return (
    <div className="w-full h-full min-h-screen bg-[#070B14]">
      {screen === 'prompt' && (
        <PromptScreen
          onRunPrompt={handleRunPrompt}
          onSelectSpec={handleSelectSpec}
        />
      )}

      {screen === 'loading' && (
        <LoadingScreen
          goalPrompt={activePrompt}
          isGenerating={isGenerating}
          onOpenSample={handleOpenSampleFromLoading}
          error={loadingError}
          onRetry={() => handleRunPrompt(activePrompt)}
        />
      )}

      {screen === 'workspace' && (
        <>
          <WorkspaceScreen
            spec={activeSpec}
            onBackToPrompt={handleBackToPrompt}
            onRegenerate={() => handleRunPrompt(activePrompt)}
          />

          {notice && (
            <div className="fixed bottom-20 right-6 z-50 max-w-sm bg-slate-900 border border-sky-500/40 text-slate-200 p-4 rounded-xl shadow-2xl text-xs flex flex-col gap-2">
              <span className="font-bold text-sky-400 uppercase text-[10px]">
                System Notice
              </span>
              <p className="text-slate-300">{notice}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="self-end px-2.5 py-1 rounded bg-sky-500 text-slate-950 font-bold text-[11px] hover:bg-sky-400 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
