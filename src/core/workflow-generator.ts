/**
 * Workflow Generator
 *
 * Generates suggested workflows from discovered agents based on their categories.
 * Creates one pipeline per implementation agent, or a single pipeline in category
 * order when no implementation agents exist.
 */

import type { AgentCategory, DiscoveredAgent, WorkflowsConfig } from './types.js';

/** Canonical category ordering for pipeline steps. */
const CATEGORY_ORDER: AgentCategory[] = ['exploration', 'implementation', 'other', 'review', 'testing'];

/**
 * Generate suggested workflows from discovered agents.
 *
 * - If implementation agents exist: one pipeline per impl agent (prepend explore,
 *   include other agents, append review/testing).
 * - If no implementation agents but 2+ distinct categories: single pipeline
 *   ordered by CATEGORY_ORDER.
 * - Otherwise: empty result (cannot determine meaningful order).
 *
 * Used by `omcsa workflow add all` and `omcsa init` (for display suggestions).
 */
export function generateSuggestedWorkflows(agents: DiscoveredAgent[]): WorkflowsConfig {
  if (agents.length < 2) return {};

  const byCategory = new Map<string, DiscoveredAgent[]>();
  for (const agent of agents) {
    const list = byCategory.get(agent.category) || [];
    list.push(agent);
    byCategory.set(agent.category, list);
  }

  const implAgents = byCategory.get('implementation') || [];
  const reviewAgents = byCategory.get('review') || [];
  const testAgents = byCategory.get('testing') || [];
  const exploreAgents = byCategory.get('exploration') || [];
  const otherAgents = byCategory.get('other') || [];

  // Case 1: implementation agents exist → one pipeline per impl agent
  if (implAgents.length > 0) {
    const hasPostSteps = reviewAgents.length > 0 || testAgents.length > 0
      || exploreAgents.length > 0 || otherAgents.length > 0;
    if (!hasPostSteps) return {};

    const workflows: WorkflowsConfig = {};

    for (const impl of implAgents) {
      const steps: string[] = [];

      // Prepend exploration agents
      if (exploreAgents.length > 0) steps.push(exploreAgents[0].name);

      // Implementation agent
      steps.push(impl.name);

      // Other agents (between impl and review)
      for (const o of otherAgents) steps.push(o.name);

      // Review agents
      for (const r of reviewAgents) steps.push(r.name);

      // Testing agents
      for (const t of testAgents) steps.push(t.name);

      const name = implAgents.length === 1
        ? 'default'
        : `${impl.name}-flow`;

      workflows[name] = { steps, mode: 'sequential' };
    }

    return workflows;
  }

  // Case 2: no implementation agents → single pipeline in category order
  // Requires 2+ distinct categories (same category only → no ordering basis)
  const distinctCategories = new Set(agents.map(a => a.category));
  if (distinctCategories.size < 2) return {};

  const steps: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const catAgents = byCategory.get(cat) || [];
    for (const a of catAgents) steps.push(a.name);
  }

  return { default: { steps, mode: 'sequential' } };
}
