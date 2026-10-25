import React, { useState, useRef } from 'react';
import { 
  ArrowRight, 
  Sparkles, 
  Cpu, 
  Layers, 
  Upload, 
  FileText, 
  ShieldCheck, 
  Radio, 
  ExternalLink, 
  CheckCircle2, 
  X,
  AlertCircle
} from 'lucide-react';
import { BUNDLED_SAMPLES, SampleMeta } from '../../data/samples/samplesIndex';
import { SceneSpec } from '../../types/sceneSpec';
import { validateAndRepairSceneSpec } from '../../utils/specValidator';
import { seeLearnApiClient } from '../../services/awsClient';

interface PromptScreenProps {
  onRunPrompt: (promptText: string) => void;
  onSelectSpec: (spec: SceneSpec) => void;
}

export const PromptScreen: React.FC<PromptScreenProps> = ({ onRunPrompt, onSelectSpec }) => {
  const [inputValue, setInputValue] = useState(
    "I'm building a racing drone, show me components, wiring and how it works"
  );
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAwsEndpointConnected = Boolean(seeLearnApiClient.getEndpoint());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onRunPrompt(inputValue.trim());
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setImportJsonText(text);
        processJsonImport(text);
      } catch (err: any) {
        setImportError(`File read error: ${err?.message || 'Invalid file format'}`);
      }
    };
    reader.readAsText(file);
  };

  const processJsonImport = (rawText: string) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(rawText);
      const validation = validateAndRepairSceneSpec(parsed);
      if (!validation.valid && validation.errors.length > 0) {
        setImportError(`Invalid Scene Spec: ${validation.errors.join('; ')}`);
        return;
      }
      setIsImportModalOpen(false);
      onSelectSpec(validation.spec);
    } catch (parseErr: any) {
      setImportError(`JSON syntax error: ${parseErr?.message || 'Malformed JSON syntax'}`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070B14] text-slate-100 flex flex-col justify-between p-6 md:p-10 relative overflow-x-hidden select-none">
      {/* Background radial glow & technical grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* Top Header */}
      <header className="flex items-center justify-between gap-6 max-w-6xl mx-auto w-full z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-sky-400 font-bold shadow-lg shadow-sky-500/10 font-mono text-sm">
            SL
          </div>
          <span className="text-xl font-bold tracking-tight text-white font-['Outfit']">
            SeeLearn
          </span>
          <span className="text-xs text-sky-400/80 font-mono border-l border-slate-700/60 pl-3 hidden sm:inline">
            OpenCV + AWS Hackathon
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/70 hover:border-sky-500/50 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Import JSON</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isAwsEndpointConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-400 hidden md:inline">
              {isAwsEndpointConnected ? 'AWS Connected' : 'Sample / Offline Mode'}
            </span>
          </div>
        </div>
      </header>

      {/* Hero & Prompt Section */}
      <main className="max-w-4xl mx-auto w-full my-auto z-10 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-400 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Explorable 3D Engineering Assembly Tutor</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-3 font-['Outfit']">
            Prompt any machine or system.
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            SeeLearn dynamically generates a verified 3D assembly, wires subsystem dependencies, and lets you explore physical mechanisms via hand gestures or mouse.
          </p>
        </div>

        {/* Input Box */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
            <div className="relative bg-[#0F172A] border border-slate-800 rounded-xl p-2.5 flex items-center shadow-2xl">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g. I'm building a racing drone, show me components, wiring and how it works"
                className="w-full bg-transparent px-4 py-3 text-slate-100 placeholder-slate-500 text-sm md:text-base focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 px-6 py-3 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer"
              >
                <span>Run</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>

        {/* Judge Mode Curated 4-Button Row */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Judge Quick-Launch Mode</span>
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Instant 3D Assemblies</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {BUNDLED_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => onSelectSpec(sample.spec)}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-850 hover:shadow-lg hover:shadow-sky-500/5 transition text-left cursor-pointer group"
              >
                <div className="text-[11px] font-mono text-sky-400/90 mb-1 flex items-center justify-between">
                  <span>{sample.tag}</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">➔</span>
                </div>
                <div className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors">
                  {sample.title}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {sample.componentCount} components · {sample.layoutStyle}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Offline Gallery Cards */}
        <div>
          <div className="text-xs text-slate-500 mb-3 font-medium">Bundled Architecture Gallery:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BUNDLED_SAMPLES.map((sample) => (
              <div
                key={`gallery-${sample.id}`}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-semibold text-slate-200">{sample.title}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      {sample.layoutStyle}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {sample.subtitle}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/60">
                  <span className="text-[11px] font-mono text-slate-500">
                    {sample.spec.learningObjectives.length} learning goals
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectSpec(sample.spec)}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Launch 3D Model</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer System Specs */}
      <footer className="max-w-6xl mx-auto w-full z-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 pt-6 border-t border-slate-800/60">
        <div className="flex items-center gap-4">
          <span>Camera & Hand Tracking: OpenCV 5 + MediaPipe</span>
          <span className="text-slate-700">|</span>
          <span>Zero-Hallucination Verified Specs</span>
        </div>
        <div className="text-slate-400 font-mono">
          Interactive Physical Computing
        </div>
      </footer>

      {/* Import JSON Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5 text-sky-400" />
              <span>Import Scene Specification</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Paste custom SceneSpec JSON or upload a `.json` file to visualize any custom mechanical or electronics assembly.
            </p>

            <div className="mb-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-750 border border-dashed border-slate-700 text-xs font-medium text-slate-300 flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Upload .json File</span>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Or Paste JSON:
              </label>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='{ "schemaVersion": 1, "topic": "...", "components": [...] }'
                rows={7}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500/50"
              />
            </div>

            {importError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => processJsonImport(importJsonText)}
                disabled={!importJsonText.trim()}
                className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs transition cursor-pointer"
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
