/**
 * Delegation Enforcement
 *
 * PreToolUse hook that warns or blocks the orchestrator from
 * directly modifying source code files, encouraging delegation to sub-agents.
 */

import { extname } from 'path';
import {
  HookInput,
  HookOutput,
  DelegationEnforcementLevel,
  SOURCE_EXTENSIONS,
  WRITE_EDIT_TOOLS,
  ALLOWED_PATH_PATTERNS,
  DiscoveredAgent,
} from '../core/types.js';

/**
 * Check if a path is allowed for direct orchestrator modification.
 */
function isAllowedPath(filePath: string): boolean {
  if (!filePath) return true;
  return ALLOWED_PATH_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a file is a source code file that should be delegated.
 */
function isSourceFile(filePath: string): boolean {
  if (!filePath) return false;
  const ext = extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.includes(ext);
}

/**
 * Find the best agent to delegate to based on file path.
 */
function suggestAgent(filePath: string, agents: DiscoveredAgent[]): string | null {
  const ext = extname(filePath).toLowerCase();
  const path = filePath.toLowerCase();

  // Frontend files
  if (['.tsx', '.jsx', '.vue', '.svelte', '.astro', '.css', '.scss'].includes(ext) ||
      path.includes('frontend') || path.includes('components') || path.includes('pages')) {
    const frontendAgent = agents.find(a => a.category === 'implementation' &&
      /frontend|ui|react|vue|next|svelte/i.test(`${a.name} ${a.description}`));
    if (frontendAgent) return frontendAgent.name;
  }

  // Backend/API files
  if (path.includes('api') || path.includes('server') || path.includes('backend') ||
      path.includes('routes') || path.includes('middleware')) {
    const backendAgent = agents.find(a => a.category === 'implementation' &&
      /backend|api|server|express|nest/i.test(`${a.name} ${a.description}`));
    if (backendAgent) return backendAgent.name;
  }

  // Test files
  if (/\.(test|spec)\.[jt]sx?$/.test(filePath) || path.includes('__tests__') || path.includes('test/')) {
    const testAgent = agents.find(a => a.category === 'testing');
    if (testAgent) return testAgent.name;
  }

  // Default to first implementation agent
  const implAgent = agents.find(a => a.category === 'implementation');
  return implAgent?.name || agents[0]?.name || null;
}

/**
 * Process delegation enforcement for a PreToolUse event.
 */
export function checkDelegation(
  input: HookInput,
  level: DelegationEnforcementLevel,
  agents: DiscoveredAgent[],
): HookOutput {
  // Enforcement disabled
  if (level === 'off') {
    return { continue: true };
  }

  // Only check write/edit tools
  const toolName = input.toolName || '';
  if (!WRITE_EDIT_TOOLS.includes(toolName)) {
    return { continue: true };
  }

  // Extract file path from tool input
  const toolInput = input.toolInput || {};
  const filePath = (toolInput as Record<string, string>).file_path ||
                   (toolInput as Record<string, string>).notebook_path || '';

  if (!filePath) {
    return { continue: true };
  }

  // Allow config/doc files
  if (isAllowedPath(filePath)) {
    return { continue: true };
  }

  // Only enforce for source code files
  if (!isSourceFile(filePath)) {
    return { continue: true };
  }

  const suggestedAgent = suggestAgent(filePath, agents);
  const suggestion = suggestedAgent
    ? `Consider delegating this to the "${suggestedAgent}" agent via Task tool.`
    : 'Consider delegating this to an appropriate sub-agent via Task tool.';

  if (level === 'strict') {
    return {
      continue: false,
      reason: `[OMCSA] Delegation enforced: Direct source code modification blocked.\n${suggestion}`,
    };
  }

  // warn mode
  return {
    continue: true,
    message: `[OMCSA] Delegation reminder: You are directly modifying source code (${filePath}).\n${suggestion}\nAs an orchestrator, prefer delegating implementation work to specialized agents.`,
  };
}
