/**
 * SeeLearn Template Validation Engine
 * Validates assembly integrity, topological consistency, and referential ground truth.
 */

import { AssemblyTemplate, TemplateValidationResult } from '../types/assembly';

export function validateAssemblyTemplate(template: AssemblyTemplate): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required top-level fields check
  if (!template.id) errors.push('Template missing unique "id"');
  if (!template.name) errors.push('Template missing "name"');
  if (!template.category) errors.push('Template missing "category"');
  if (!template.components || !Array.isArray(template.components)) {
    errors.push('Template missing "components" array');
    return {
      isValid: false,
      errors,
      warnings,
      stats: {
        componentCount: 0,
        connectionCount: 0,
        powerConnections: 0,
        signalConnections: 0,
        mechanicalConnections: 0,
        stepsCount: 0,
        experimentsCount: 0,
      }
    };
  }

  const componentMap = new Map<string, boolean>();
  template.components.forEach((comp, idx) => {
    if (!comp.id) {
      errors.push(`Component at index ${idx} is missing an "id"`);
    } else {
      if (componentMap.has(comp.id)) {
        errors.push(`Duplicate component ID detected: "${comp.id}"`);
      }
      componentMap.set(comp.id, true);
    }

    if (!comp.name) errors.push(`Component "${comp.id || idx}" missing name`);
    if (!comp.subsystem) errors.push(`Component "${comp.id || idx}" missing subsystem`);
    if (!comp.mesh) errors.push(`Component "${comp.id || idx}" missing mesh configuration`);
    if (!comp.position || comp.position.length !== 3) {
      errors.push(`Component "${comp.id || idx}" position must be [x, y, z]`);
    }
    if (!comp.short_description) errors.push(`Component "${comp.id || idx}" missing short_description`);
    if (!comp.detailed_description) errors.push(`Component "${comp.id || idx}" missing detailed_description`);
    if (!comp.why_needed) errors.push(`Component "${comp.id || idx}" missing why_needed grounding`);
    if (!Array.isArray(comp.inputs)) errors.push(`Component "${comp.id || idx}" inputs must be an array`);
    if (!Array.isArray(comp.outputs)) errors.push(`Component "${comp.id || idx}" outputs must be an array`);
  });

  // 2. Connections validation (Referential Integrity)
  let powerCount = 0;
  let signalCount = 0;
  let mechanicalCount = 0;

  if (Array.isArray(template.connections)) {
    template.connections.forEach((conn, idx) => {
      if (!conn.id) errors.push(`Connection at index ${idx} missing id`);
      if (!conn.from) errors.push(`Connection "${conn.id || idx}" missing "from" source`);
      if (!conn.to) errors.push(`Connection "${conn.id || idx}" missing "to" target`);

      if (conn.from && !componentMap.has(conn.from)) {
        errors.push(`Connection "${conn.id}": Source component "${conn.from}" does not exist in template components`);
      }
      if (conn.to && !componentMap.has(conn.to)) {
        errors.push(`Connection "${conn.id}": Target component "${conn.to}" does not exist in template components`);
      }

      if (conn.type === 'power') powerCount++;
      else if (conn.type === 'signal') signalCount++;
      else if (conn.type === 'mechanical') mechanicalCount++;
      else {
        errors.push(`Connection "${conn.id}" has invalid type "${conn.type}". Must be "power", "signal", or "mechanical"`);
      }
    });
  } else {
    errors.push('Template missing "connections" array');
  }

  // 3. Assembly steps verification
  if (Array.isArray(template.assembly_steps)) {
    template.assembly_steps.forEach((step) => {
      if (step.componentIds) {
        step.componentIds.forEach((compId) => {
          if (!componentMap.has(compId)) {
            errors.push(`Assembly Step ${step.step} references non-existent component "${compId}"`);
          }
        });
      }
    });
  }

  // 4. Mechanisms verification
  if (Array.isArray(template.mechanisms)) {
    template.mechanisms.forEach((mech) => {
      if (mech.componentsInvolved) {
        mech.componentsInvolved.forEach((compId) => {
          if (!componentMap.has(compId)) {
            warnings.push(`Mechanism "${mech.name}" references unmapped component "${compId}"`);
          }
        });
      }
    });
  }

  // 5. Experiments verification
  if (Array.isArray(template.experiments)) {
    template.experiments.forEach((exp) => {
      if (exp.componentId && !componentMap.has(exp.componentId)) {
        errors.push(`Experiment "${exp.id}" targets non-existent component "${exp.componentId}"`);
      }
      if (exp.predictionOptions.length < 2) {
        errors.push(`Experiment "${exp.id}" must have at least 2 prediction options`);
      }
      if (
        exp.correctPredictionIndex < 0 ||
        exp.correctPredictionIndex >= exp.predictionOptions.length
      ) {
        errors.push(`Experiment "${exp.id}" correctPredictionIndex out of bounds`);
      }
    });
  }

  // 6. Notes & Grounding fidelity
  if (!template.notes) {
    errors.push('Template missing "notes" block with engineering fidelity declarations');
  } else {
    if (!template.notes.safetyDisclaimer) {
      warnings.push('Template missing explicit safety disclaimer');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      componentCount: template.components.length,
      connectionCount: template.connections?.length || 0,
      powerConnections: powerCount,
      signalConnections: signalCount,
      mechanicalConnections: mechanicalCount,
      stepsCount: template.assembly_steps?.length || 0,
      experimentsCount: template.experiments?.length || 0,
    }
  };
}
