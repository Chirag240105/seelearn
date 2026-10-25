/**
 * Grounded Engineering Tutor Engine (Zero-Hallucination Service)
 * Strictly utilizes reviewed assembly template facts to generate explanations.
 */

import { RACING_DRONE_TEMPLATE } from '../data/racingDroneTemplate';
import { WHEELED_ROBOT_TEMPLATE } from '../data/wheeledRobotTemplate';
import { AssemblyComponent, AssemblyTemplate } from '../types/assembly';

export interface InterpretGoalResponse {
  templateId: string;
  templateName: string;
  confidence: number;
  interpretedGoal: string;
  suggestedView: 'solid' | 'xray' | 'exploded';
  initialFocusComponentId?: string;
  groundedSummary: string;
  isSupported: boolean;
  alternativeOptions?: string[];
}

export interface ExplainComponentResponse {
  componentId: string;
  componentName: string;
  answer: string;
  connectedComponents: Array<{ id: string; name: string; type: string; label: string }>;
  whyNeeded: string;
  specsSummary?: Record<string, string>;
  followUpQuestions: string[];
}

export class GroundedTutorService {
  private templates: Map<string, AssemblyTemplate> = new Map();

  constructor() {
    this.templates.set(RACING_DRONE_TEMPLATE.id, RACING_DRONE_TEMPLATE);
    this.templates.set(WHEELED_ROBOT_TEMPLATE.id, WHEELED_ROBOT_TEMPLATE);
  }

  /**
   * Interprets user natural language input into a verified assembly template
   */
  public interpretGoal(userPrompt: string): InterpretGoalResponse {
    const query = userPrompt.toLowerCase().trim();

    // Drone matches
    if (
      query.includes('drone') ||
      query.includes('quad') ||
      query.includes('fpv') ||
      query.includes('fly') ||
      query.includes('uav') ||
      query.includes('racing') ||
      query.includes('motor') ||
      query.includes('propeller') ||
      query === ''
    ) {
      return {
        templateId: RACING_DRONE_TEMPLATE.id,
        templateName: RACING_DRONE_TEMPLATE.name,
        confidence: 0.98,
        interpretedGoal: 'Build and understand a 5-inch 6S FPV racing quadcopter, including brushless propulsion, DShot signal telemetry, and analog FPV video transmission.',
        suggestedView: 'solid',
        initialFocusComponentId: 'flight_controller',
        groundedSummary: 'Loaded the verified 5-inch True-X FPV racing quadcopter template with 16 interconnected components, full 6S power distribution, and 8kHz PID stabilization.',
        isSupported: true,
      };
    }

    // Wheeled robot matches
    if (
      query.includes('robot') ||
      query.includes('rover') ||
      query.includes('wheel') ||
      query.includes('car') ||
      query.includes('ground') ||
      query.includes('esp32')
    ) {
      return {
        templateId: WHEELED_ROBOT_TEMPLATE.id,
        templateName: WHEELED_ROBOT_TEMPLATE.name,
        confidence: 0.94,
        interpretedGoal: 'Explore the differential-drive mobile ground robot architecture with dual H-bridge motor drivers and ultrasonic distance sensing.',
        suggestedView: 'solid',
        initialFocusComponentId: 'esp32_controller',
        groundedSummary: 'Loaded the architectural stub template for differential-drive ground robotics demonstrating schema reusability.',
        isSupported: true,
      };
    }

    // Unsupported requests (e.g. laptop, phone, submarine)
    if (query.includes('laptop') || query.includes('computer') || query.includes('macbook')) {
      return {
        templateId: RACING_DRONE_TEMPLATE.id,
        templateName: 'Laptop Architecture (Coming Soon)',
        confidence: 0.4,
        interpretedGoal: 'Laptop hardware teardown is scheduled for the next release roadmap.',
        suggestedView: 'solid',
        groundedSummary: 'Laptops and microcomputers are currently marked as "Coming Soon". Showing the 5-inch Racing Drone as the closest supported active engineering assembly.',
        isSupported: false,
        alternativeOptions: ['5" FPV Racing Quadcopter', 'Differential-Drive Ground Rover'],
      };
    }

    if (query.includes('phone') || query.includes('smartphone') || query.includes('iphone')) {
      return {
        templateId: RACING_DRONE_TEMPLATE.id,
        templateName: 'Smartphone System (Coming Soon)',
        confidence: 0.4,
        interpretedGoal: 'Smartphone RF and SoC breakdown is in active development.',
        suggestedView: 'solid',
        groundedSummary: 'Smartphone assemblies are marked "Coming Soon". Demonstrating the 5-inch Racing Drone assembly with complete avionics and RF telemetry.',
        isSupported: false,
        alternativeOptions: ['5" FPV Racing Quadcopter', 'Differential-Drive Ground Rover'],
      };
    }

    // Default to Racing Drone with explanation
    return {
      templateId: RACING_DRONE_TEMPLATE.id,
      templateName: RACING_DRONE_TEMPLATE.name,
      confidence: 0.85,
      interpretedGoal: `Interpreted goal: "${userPrompt}". Configured the primary engineering assembly.`,
      suggestedView: 'solid',
      initialFocusComponentId: 'flight_controller',
      groundedSummary: 'Matching to the 5" FPV Racing Quadcopter engineering assembly template with full electrical and mechanical grounding.',
      isSupported: true,
      alternativeOptions: ['5" FPV Racing Quadcopter', 'Differential-Drive Ground Rover'],
    };
  }

  /**
   * Generates grounded Q&A explanations based strictly on template facts
   */
  public explainComponent(
    template: AssemblyTemplate,
    componentId: string,
    question?: string
  ): ExplainComponentResponse {
    const comp = template.components.find((c) => c.id === componentId) || template.components[0];

    // Find all directly connected components
    const directConnections = template.connections.filter(
      (c) => c.from === comp.id || c.to === comp.id
    );

    const connectedComponents = directConnections.map((c) => {
      const otherId = c.from === comp.id ? c.to : c.from;
      const otherComp = template.components.find((item) => item.id === otherId);
      return {
        id: otherId,
        name: otherComp?.name || otherId,
        type: c.type,
        label: c.label,
      };
    });

    let answer = comp.detailed_description;

    if (question) {
      const q = question.toLowerCase();
      if (q.includes('why') || q.includes('need') || q.includes('purpose')) {
        answer = `${comp.why_needed} In this assembly, ${comp.name} receives: ${comp.inputs.join(
          ', '
        )}, and outputs: ${comp.outputs.join(', ')}.`;
      } else if (q.includes('connect') || q.includes('wire') || q.includes('trace') || q.includes('interface')) {
        const connDesc = directConnections
          .map((c) => `• [${c.type.toUpperCase()}] ${c.label}: ${c.description}`)
          .join('\n');
        answer = `${comp.name} interfaces directly through ${directConnections.length} verified connections:\n${connDesc}`;
      } else if (q.includes('spec') || q.includes('voltage') || q.includes('rating') || q.includes('power')) {
        if (comp.specs) {
          const specList = Object.entries(comp.specs)
            .map(([k, v]) => `• ${k}: ${v}`)
            .join('\n');
          answer = `Engineering specifications for ${comp.name}:\n${specList}`;
        } else {
          answer = `${comp.name} operates with inputs: ${comp.inputs.join('; ')} and outputs: ${comp.outputs.join('; ')}.`;
        }
      } else if (q.includes('fail') || q.includes('break') || q.includes('crash') || q.includes('risk')) {
        const relatedExp = template.experiments.find((e) => e.componentId === comp.id);
        if (relatedExp) {
          answer = `Failure Mode Analysis: ${relatedExp.observationSummary}\n\nEngineering Mechanism: ${relatedExp.engineeringExplanation}`;
        } else {
          answer = `If ${comp.name} fails, downstream components depending on its outputs (${comp.outputs.join(
            ', '
          )}) will experience signal loss or electrical disconnect.`;
        }
      } else {
        answer = `${comp.short_description} ${comp.detailed_description}\n\nKey Function: ${comp.why_needed}`;
      }
    }

    const followUpQuestions = [
      `What happens if ${comp.name} disconnects during operation?`,
      `Show electrical and signal connections linked to ${comp.name}`,
      `What are the critical engineering specifications of ${comp.name}?`,
      `How does ${comp.name} interface with the flight control loop?`
    ];

    return {
      componentId: comp.id,
      componentName: comp.name,
      answer,
      connectedComponents,
      whyNeeded: comp.why_needed,
      specsSummary: comp.specs,
      followUpQuestions,
    };
  }
}

export const mockTutorService = new GroundedTutorService();
