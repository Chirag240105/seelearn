/**
 * SeeLearn AWS API Client Module
 * Communicates with AWS Serverless API Gateway endpoints with strict safety guards,
 * 10-second timeout for explanations, 90-second timeout for scene generation,
 * in-memory caching, 20-call session cap, 5-second cooldown, and offline fallback.
 * 
 * Complies with strict environmental constraints:
 * - Reads VITE_AWS_API_ENDPOINT from environment.
 * - If empty, undefined, or if a call fails/times out, seamlessly falls back to offline samples.
 * - If user types a new topic and endpoint is empty: "Connect the AWS backend to generate new topics."
 */

import { mockTutorService, InterpretGoalResponse, ExplainComponentResponse } from './mockTutorService';
import { AssemblyTemplate } from '../types/assembly';
import { SceneSpec, SceneComponent } from '../types/sceneSpec';
import { validateAndRepairSceneSpec } from '../utils/specValidator';
import { getSampleByTopic, DEFAULT_SAMPLE } from '../data/samples/samplesIndex';

export interface ChatHistoryEntry {
  sender: 'user' | 'tutor';
  text: string;
}

export interface GenerateResult {
  success: boolean;
  spec?: SceneSpec;
  refusal?: string;
  error?: string;
  isOffline?: boolean;
}

export interface ExplainResult {
  answer: string;
  groundingFacts: string[];
  isOffline: boolean;
  confidence?: 'high' | 'medium' | 'low';
}

type OfflineStatusListener = (isOffline: boolean) => void;

export class SeeLearnApiClient {
  private endpoint: string;
  private isOfflineMode: boolean = true;
  private listeners: Set<OfflineStatusListener> = new Set();
  
  // Safety & Cost Guards
  private callCount: number = 0;
  private readonly MAX_CALLS_PER_SESSION = 20;
  private lastCallTimestamp: number = 0;
  private readonly COOLDOWN_MS = 5000; // 5-second cooldown
  private specCache = new Map<string, SceneSpec>(); // in-memory cache keyed by lowercase topic

  constructor() {
    const rawEndpoint = (import.meta as any).env?.VITE_AWS_API_ENDPOINT;
    this.endpoint = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
    this.isOfflineMode = !this.endpoint;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  public isOffline(): boolean {
    return this.isOfflineMode;
  }

  public getRemainingCalls(): number {
    return Math.max(0, this.MAX_CALLS_PER_SESSION - this.callCount);
  }

  public onStatusChange(callback: OfflineStatusListener): () => void {
    this.listeners.add(callback);
    callback(this.isOfflineMode);
    return () => this.listeners.delete(callback);
  }

  private setOfflineMode(offline: boolean) {
    if (this.isOfflineMode !== offline) {
      this.isOfflineMode = offline;
      this.listeners.forEach((fn) => fn(this.isOfflineMode));
    }
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generates a dynamic 3D Scene Specification for any requested engineering topic.
   */
  public async generateSceneSpec(rawTopic: string): Promise<GenerateResult> {
    const topic = (rawTopic || '').trim().slice(0, 200); // 200 chars max
    const cacheKey = topic.toLowerCase();

    // 1. Check in-memory cache
    if (this.specCache.has(cacheKey)) {
      return {
        success: true,
        spec: this.specCache.get(cacheKey)!,
        isOffline: this.isOfflineMode,
      };
    }

    // 2. If endpoint is empty, check bundled samples or show exact required message
    if (!this.endpoint) {
      this.setOfflineMode(true);
      const bundled = getSampleByTopic(topic);
      if (bundled) {
        this.specCache.set(cacheKey, bundled);
        return {
          success: true,
          spec: bundled,
          isOffline: true,
        };
      }
      return {
        success: false,
        error: 'Connect the AWS backend to generate new topics.',
        isOffline: true,
      };
    }

    // 3. Safety Guards: Session Limit
    if (this.callCount >= this.MAX_CALLS_PER_SESSION) {
      return {
        success: false,
        error: `Session limit reached (${this.MAX_CALLS_PER_SESSION} generations). Please reload to reset session.`,
        isOffline: false,
      };
    }

    // 4. Cooldown Check (5 seconds)
    const now = Date.now();
    const timeSinceLast = now - this.lastCallTimestamp;
    if (timeSinceLast < this.COOLDOWN_MS) {
      const waitSec = Math.ceil((this.COOLDOWN_MS - timeSinceLast) / 1000);
      return {
        success: false,
        error: `Please wait ${waitSec}s cooldown before generating another system.`,
      };
    }

    this.lastCallTimestamp = now;
    this.callCount++;

    // 5. Remote API call with 90-second timeout
    try {
      const targetUrl = this.endpoint.replace(/\/+$/, '') + '/generate';
      const response = await this.fetchWithTimeout(
        targetUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate',
            topic,
          }),
        },
        90000 // 90-second generation timeout
      );

      if (!response.ok) {
        throw new Error(`AWS Gateway HTTP ${response.status}`);
      }

      const data = await response.json();

      // Check for refusal response
      if (data.refusal) {
        return {
          success: false,
          refusal: data.refusal,
          isOffline: false,
        };
      }

      // Validate and repair returned JSON spec
      const validation = validateAndRepairSceneSpec(data.spec || data);
      if (!validation.valid && validation.errors.length > 0) {
        throw new Error(`Invalid scene spec returned: ${validation.errors.join(', ')}`);
      }

      this.setOfflineMode(false);
      this.specCache.set(cacheKey, validation.spec);

      return {
        success: true,
        spec: validation.spec,
        isOffline: false,
      };
    } catch (err: any) {
      console.warn('[SeeLearn API] Scene generation failed or timed out:', err);
      this.setOfflineMode(true);

      return {
        success: false,
        error: err?.message || 'Failed to generate scene spec. Connect the AWS backend to generate new topics.',
        isOffline: true,
      };
    }
  }

  /**
   * Grounded explanation of a component within a SceneSpec
   */
  public async explainSceneComponent(
    spec: SceneSpec,
    componentId: string,
    question?: string,
    history?: ChatHistoryEntry[]
  ): Promise<ExplainResult> {
    const component = spec.components.find((c) => c.id === componentId);
    if (!component) {
      return {
        answer: 'Component not found in current scene specification.',
        groundingFacts: [],
        isOffline: true,
      };
    }

    const localGroundingFacts = [
      component.summary,
      component.howItWorks,
      component.whyNeeded,
      ...(component.keyFacts || []),
    ];

    // If no endpoint, return grounded local answer
    if (!this.endpoint) {
      this.setOfflineMode(true);
      return this.generateLocalGroundedAnswer(component, spec, question);
    }

    // Call AWS /explain with 10-second timeout
    try {
      const targetUrl = this.endpoint.replace(/\/+$/, '') + '/explain';
      const requestBody = {
        action: 'explain',
        componentId,
        question: (question || '').slice(0, 2000),
        specSummary: {
          topic: spec.topic.slice(0, 200),
          title: spec.title.slice(0, 200),
          component: {
            id: component.id,
            name: component.name.slice(0, 200),
            group: component.group.slice(0, 100),
            summary: component.summary.slice(0, 400),
            howItWorks: component.howItWorks.slice(0, 400),
            whyNeeded: component.whyNeeded.slice(0, 400),
            keyFacts: (component.keyFacts || []).slice(0, 3).map((fact) => fact.slice(0, 200)),
            confidence: component.confidence,
          },
          connectedTo: spec.connections
            .filter((c) => c.from === componentId || c.to === componentId)
            .slice(0, 12)
            .map((connection) => ({
              from: connection.from,
              to: connection.to,
              type: connection.type,
              label: connection.label.slice(0, 120),
              description: connection.description.slice(0, 160),
            })),
        },
      };
      let body = JSON.stringify(requestBody);
      while (new TextEncoder().encode(body).byteLength >= 20 * 1024) {
        if (requestBody.specSummary.connectedTo.length > 0) {
          requestBody.specSummary.connectedTo.length = Math.floor(requestBody.specSummary.connectedTo.length / 2);
        } else if (requestBody.question.length > 0) {
          requestBody.question = requestBody.question.slice(0, Math.floor(requestBody.question.length / 2));
        } else {
          throw new Error('Component explanation payload exceeds the 20 KB limit.');
        }
        body = JSON.stringify(requestBody);
      }
      const response = await this.fetchWithTimeout(
        targetUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
        10000 // 10-second timeout
      );

      if (!response.ok) {
        throw new Error(`AWS /explain returned HTTP ${response.status}`);
      }

      const data = await response.json();
      this.setOfflineMode(false);

      return {
        answer: data.answer || data.explanation || component.howItWorks,
        groundingFacts: data.groundingFacts || localGroundingFacts,
        isOffline: false,
        confidence: component.confidence,
      };
    } catch (err) {
      console.warn('[SeeLearn API] /explain failed or timed out. Falling back to grounded local text:', err);
      this.setOfflineMode(true);
      return this.generateLocalGroundedAnswer(component, spec, question);
    }
  }

  /**
   * Local grounded response generator using strictly the component's reviewed facts
   */
  private generateLocalGroundedAnswer(
    component: SceneComponent,
    spec: SceneSpec,
    question?: string
  ): ExplainResult {
    const relatedConns = spec.connections.filter(
      (c) => c.from === component.id || c.to === component.id
    );

    let answer = `${component.summary}\n\nOperation: ${component.howItWorks}\n\nCritical role: ${component.whyNeeded}`;

    if (relatedConns.length > 0) {
      answer += `\n\nInterconnections:\n` + relatedConns.map((c) => `• ${c.label} (${c.type}): ${c.description}`).join('\n');
    }

    if (question && question.trim()) {
      answer = `[Offline Answer] ${answer}`;
    }

    return {
      answer,
      groundingFacts: [
        component.summary,
        component.howItWorks,
        component.whyNeeded,
        ...(component.keyFacts || []),
      ],
      isOffline: true,
      confidence: component.confidence,
    };
  }

  // --- Backwards compatibility methods ---
  public async interpretGoal(prompt: string): Promise<InterpretGoalResponse> {
    if (!this.endpoint) {
      this.setOfflineMode(true);
      return mockTutorService.interpretGoal(prompt);
    }
    try {
      const sanitizedUrl = this.endpoint.replace(/\/+$/, '') + '/interpret';
      const response = await this.fetchWithTimeout(
        sanitizedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goalPrompt: prompt, prompt }),
        },
        10000
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.setOfflineMode(false);
      return data;
    } catch (err) {
      this.setOfflineMode(true);
      return mockTutorService.interpretGoal(prompt);
    }
  }

  public async explainComponent(
    template: AssemblyTemplate,
    componentId: string,
    question?: string,
    history?: ChatHistoryEntry[]
  ): Promise<ExplainComponentResponse> {
    return mockTutorService.explainComponent(template, componentId, question);
  }
}

export const seeLearnApiClient = new SeeLearnApiClient();
export const awsClient = seeLearnApiClient;
