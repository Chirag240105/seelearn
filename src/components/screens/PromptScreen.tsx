import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  Sparkles,
  Cpu,
  Layers,
  Upload,
  FileText,
  CheckCircle2,
  X,
  AlertCircle,
  ExternalLink,
  Moon,
  Sun,
  History,
  FolderOpen,
  Info,
} from 'lucide-react';
import {
  getAllSamples,
  DEFAULT_SAMPLE,
  getSampleByTopic,
  SampleMeta,
  registerCustomSample,
  getRecentModels,
  isDemoMode,
  setDemoMode,
} from '../../data/samples/samplesIndex';
import { SceneSpec } from '../../types/sceneSpec';
import { validateAndRepairSceneSpec } from '../../utils/specValidator';
import { seeLearnApiClient } from '../../services/awsClient';
import { useTheme } from '../../hooks/useTheme';

interface PromptScreenProps {
  onRunPrompt: (promptText: string) => void;
  onSelectSpec: (spec: SceneSpec) => void;
  initialPrompt?: string;
}

export const PromptScreen: React.FC<PromptScreenProps> = ({
  onRunPrompt,
  onSelectSpec,
  initialPrompt = "I'm building a racing drone, show me components, wiring and how it works",
}) => {
  const [inputValue, setInputValue] = useState(initialPrompt);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState<boolean>(isDemoMode);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();

  const isAwsEndpointConnected = Boolean(seeLearnApiClient.getEndpoint());
  const allSamples = getAllSamples();
  const recentModels = getRecentModels();

  const handleToggleDemoMode = (checked: boolean) => {
    setDemoActive(checked);
    setDemoMode(checked);
  };

  useEffect(() => {
    if (!isImportModalOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsImportModalOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isImportModalOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;

    if (demoActive) {
      onSelectSpec(getSampleByTopic(text) ?? DEFAULT_SAMPLE);
      return;
    }

    if (!isAwsEndpointConnected) {
      // Find matching sample or default
      const matched = getSampleByTopic(text);
      if (matched) {
        onSelectSpec(matched);
        return;
      }
    }

    onRunPrompt(text);
  };

  const processJsonText = useCallback(
    (rawText: string) => {
      setImportError(null);
      try {
        const parsed = JSON.parse(rawText);
        const validation = validateAndRepairSceneSpec(parsed);
        if (!validation.valid && validation.errors.length > 0) {
          setImportError(`Invalid Scene Spec: ${validation.errors.join('; ')}`);
          return;
        }
        const registered = registerCustomSample(validation.spec);
        setIsImportModalOpen(false);
        onSelectSpec(registered.spec);
      } catch (parseErr: any) {
        setImportError(`JSON syntax error: ${parseErr?.message || 'Malformed JSON syntax'}`);
      }
    },
    [onSelectSpec]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setImportJsonText(text);
        processJsonText(text);
      }
    };
    reader.readAsText(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          processJsonText(text);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="screen-enter min-h-screen w-full flex flex-col justify-between p-4 sm:p-6 md:p-8 relative select-none"
      style={{ backgroundColor: 'var(--sl-bg-base)', color: 'var(--sl-text-primary)' }}
    >
      {/* Drag overlay indicator */}
      {isDragging && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-md border-4 border-dashed"
          style={{
            backgroundColor: 'rgba(15, 17, 23, 0.85)',
            borderColor: 'var(--sl-accent)',
            color: 'var(--sl-text-primary)',
          }}
        >
          <Upload className="w-16 h-16 mb-4 animate-bounce" style={{ color: 'var(--sl-accent)' }} />
          <h2 className="text-2xl font-bold mb-2">Drop JSON SceneSpec Here</h2>
          <p className="text-sm" style={{ color: 'var(--sl-text-secondary)' }}>
            Instantly import and explore your custom 3D assembly
          </p>
        </div>
      )}

      {/* Top Header */}
      <header
        className="flex items-center justify-between gap-4 max-w-6xl mx-auto w-full z-10 pb-4 border-b"
        style={{ borderColor: 'var(--sl-border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold border"
            style={{
              backgroundColor: 'var(--sl-accent-muted)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-accent)',
            }}
          >
            SL
          </div>
          <div>
            <span className="text-base font-bold tracking-tight" style={{ color: 'var(--sl-text-primary)' }}>
              SeeLearn
            </span>
            <span className="text-xs ml-2 hidden sm:inline" style={{ color: 'var(--sl-text-secondary)' }}>
              Explorable 3D Engineering Tutor
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Demo Mode Toggle */}
          <label
            className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: demoActive ? 'var(--sl-accent)' : 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
            title="Force bundled library only (disables remote API)"
          >
            <input
              type="checkbox"
              checked={demoActive}
              onChange={(e) => handleToggleDemoMode(e.target.checked)}
              className="accent-blue-500 rounded"
            />
            <span className="hidden md:inline font-medium">Demo Mode</span>
          </label>

          {/* Import JSON */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
          >
            <Upload className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
            <span>Import JSON</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border text-xs transition cursor-pointer"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-secondary)',
            }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto w-full my-6 sm:my-8 z-10">
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-3 border"
            style={{
              backgroundColor: 'var(--sl-accent-muted)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-accent)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>3D Interactive Engineering Schematics</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-2.5">
            Explore and deconstruct any machine.
          </h1>
          <p className="text-xs sm:text-sm max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--sl-text-secondary)' }}>
            Step through components, trace wiring, inspect physical mechanisms, or control the 3D viewport hands-free with OpenCV gestures.
          </p>
        </div>

        {/* Input Box */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div
            className="rounded-xl border p-2 flex items-center shadow-lg transition-all focus-within:ring-2 focus-within:ring-blue-500/30"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
            }}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g. 5-inch racing drone, brushless DC motor, smartphone cooling..."
              className="w-full bg-transparent px-3 py-2 text-xs sm:text-sm focus:outline-none"
              style={{ color: 'var(--sl-text-primary)' }}
            />
            <button
              type="submit"
              className="shrink-0 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              style={{
                backgroundColor: 'var(--sl-accent)',
                color: '#ffffff',
              }}
            >
              <span>Explore</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Missing AWS Backend Informational Notice */}
        {!isAwsEndpointConnected && !demoActive && (
          <div
            className="mb-6 p-3.5 rounded-xl border flex items-start gap-3"
            style={{
              backgroundColor: 'var(--sl-accent-muted)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
          >
            <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--sl-accent)' }} />
            <div className="text-xs leading-relaxed">
              <span className="font-semibold" style={{ color: 'var(--sl-accent)' }}>
                Offline / Local Mode:
              </span>{' '}
              <span style={{ color: 'var(--sl-text-secondary)' }}>
                Generation needs the AWS backend. Choose a model from the library below, or import your own JSON spec.
              </span>
            </div>
          </div>
        )}

        {/* Recent Models (if any exist in session) */}
        {recentModels.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--sl-text-secondary)' }}>
              <History className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
              <span>Recently Explored This Session</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentModels.map((spec) => (
                <button
                  key={`recent-${spec.topic}`}
                  type="button"
                  onClick={() => onSelectSpec(spec)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  style={{
                    backgroundColor: 'var(--sl-bg-surface)',
                    borderColor: 'var(--sl-border)',
                    color: 'var(--sl-text-primary)',
                  }}
                >
                  <span>{spec.title}</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--sl-text-muted)' }}>
                    ({spec.components.length})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Curated Library Grid */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--sl-text-secondary)' }}>
              <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
              <span>Bundled Engineering Library</span>
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--sl-text-muted)' }}>
              {allSamples.length} verified assemblies
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {allSamples.map((sample: SampleMeta) => (
              <div
                key={sample.id}
                onClick={() => onSelectSpec(sample.spec)}
                className="p-4 rounded-xl border flex flex-col justify-between transition-all hover:shadow-md cursor-pointer group"
                style={{
                  backgroundColor: 'var(--sl-bg-surface)',
                  borderColor: 'var(--sl-border)',
                }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded border"
                      style={{
                        backgroundColor: 'var(--sl-accent-muted)',
                        borderColor: 'var(--sl-border)',
                        color: 'var(--sl-accent)',
                      }}
                    >
                      {sample.tag}
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--sl-text-muted)' }}>
                      {sample.componentCount} parts
                    </span>
                  </div>

                  <h3
                    className="text-sm font-semibold mb-1 transition-colors group-hover:text-blue-500"
                    style={{ color: 'var(--sl-text-primary)' }}
                  >
                    {sample.title}
                  </h3>

                  <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--sl-text-secondary)' }}>
                    {sample.subtitle}
                  </p>
                </div>

                <div
                  className="flex items-center justify-between mt-3 pt-3 border-t text-xs font-medium"
                  style={{ borderColor: 'var(--sl-border-subtle)', color: 'var(--sl-accent)' }}
                >
                  <span className="capitalize" style={{ color: 'var(--sl-text-muted)' }}>
                    {sample.layoutStyle} layout
                  </span>
                  <span className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    <span>Open 3D Model</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="max-w-6xl mx-auto w-full z-10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-4 border-t"
        style={{ borderColor: 'var(--sl-border-subtle)', color: 'var(--sl-text-muted)' }}
      >
        <div className="flex items-center gap-2">
          <span>Camera & Gestures: OpenCV + MediaPipe</span>
          <span>·</span>
          <span>Procedural 3D Visualizer</span>
        </div>
        <div className="font-mono">AI-generated, conceptual model. Verify critical details.</div>
      </footer>

      {/* Import JSON Modal */}
      {isImportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
        >
          <div
            className="border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-primary)',
            }}
          >
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg border transition cursor-pointer"
              style={{
                backgroundColor: 'var(--sl-bg-raised)',
                borderColor: 'var(--sl-border)',
                color: 'var(--sl-text-muted)',
              }}
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold mb-1.5 flex items-center gap-2">
              <Upload className="w-4 h-4" style={{ color: 'var(--sl-accent)' }} />
              <span>Import Scene Specification</span>
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--sl-text-secondary)' }}>
              Upload a `.json` file or paste a SceneSpec to visualize your custom engineering model.
            </p>

            <div className="mb-4">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json" className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-lg border border-dashed text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition"
                style={{
                  backgroundColor: 'var(--sl-bg-raised)',
                  borderColor: 'var(--sl-border)',
                  color: 'var(--sl-text-primary)',
                }}
              >
                <FileText className="w-4 h-4" style={{ color: 'var(--sl-accent)' }} />
                <span>Choose .json File from Computer</span>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--sl-text-secondary)' }}>
                Or Paste JSON:
              </label>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='{ "topic": "racing drone", "components": [...] }'
                rows={6}
                className="w-full border rounded-lg p-3 text-xs font-mono focus:outline-none"
                style={{
                  backgroundColor: 'var(--sl-bg-base)',
                  borderColor: 'var(--sl-border)',
                  color: 'var(--sl-text-primary)',
                }}
              />
            </div>

            {importError && (
              <div
                className="mb-4 p-3 rounded-lg border text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'var(--sl-danger-muted)',
                  borderColor: 'var(--sl-danger)',
                  color: 'var(--sl-danger)',
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                style={{ color: 'var(--sl-text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => processJsonText(importJsonText)}
                disabled={!importJsonText.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--sl-accent)',
                  color: '#ffffff',
                }}
              >
                Validate & Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
