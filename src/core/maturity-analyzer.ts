/**
 * Maturity Analyzer
 *
 * Analyzes CLAUDE.md content to determine the user's orchestration maturity level.
 * Uses composite scoring across 4 weighted signal categories to classify
 * maturity as LOW, MEDIUM, or HIGH.
 *
 * CRITICAL: Always call removeOmcsaSection() before analysis to prevent
 * feedback loops where OMCSA's own prompts inflate maturity scores.
 */

import type { DiscoveredAgent, MaturityLevel, MaturityResult, MaturitySignals } from './types.js';

/** Agent names matching this pattern are safe for regex construction */
const SAFE_AGENT_NAME = /^[a-zA-Z0-9_-]+$/;

// ─── Weight Configuration ───────────────────────────────────────────────────

const WEIGHTS = {
  agentNameReferences: 0.20,
  workflowKeywords: 0.35,
  taskToolUsage: 0.25,
  delegationPatterns: 0.20,
};

// ─── Maturity Level Thresholds ──────────────────────────────────────────────

const MEDIUM_THRESHOLD = 0.25;
const HIGH_THRESHOLD = 0.60;

// ─── Orchestration Context Patterns ─────────────────────────────────────────

/**
 * Workflow keyword patterns that match orchestration-specific contexts.
 * These use word boundaries and context to avoid false positives like
 * "CI/CD pipeline" or "delegate responsibility to team".
 */
const WORKFLOW_PATTERNS: RegExp[] = [
  /delegate\s+(to|via)\s+(agent|task|sub-?agent)/i,
  /agent\s+(chain|pipeline|workflow|orchestrat)/i,
  /sub-?agent\s+(type|routing|dispatch|selection)/i,
  /orchestrat(e|or|ion)\s+(agent|task|workflow|rule)/i,
  /route\s+(to|task|request)\s+(agent|sub-?agent)/i,
  /agent\s+combination/i,
  /parallel\s+(agent|task|dispatch|execution\s+.*agent)/i,
  /sequential\s+(agent|task|dispatch)/i,
  /agent\s+selector/i,
  /task\s+tool\s+(delegation|dispatch|routing)/i,
];

/**
 * Task tool usage patterns.
 */
const TASK_TOOL_PATTERNS: RegExp[] = [
  /Task\s+tool/i,
  /subagent_type/i,
  /delegate\s+via\s+Task/i,
  /launch\s+.*\s+agent/i,
  /spawn\s+.*\s+agent/i,
  /run_in_background/i,
  /Task\s+tool.*agent/i,
  /agent.*Task\s+tool/i,
];

/**
 * Delegation pattern indicators.
 */
const DELEGATION_PATTERNS: RegExp[] = [
  /always\s+delegate/i,
  /orchestrator\s+role/i,
  /route\s+to\s+agent/i,
  /never\s+(directly|modify|edit|write).*(?:source|code)/i,
  /must\s+delegate/i,
  /delegation\s+(enforce|require|rule|policy)/i,
  /do\s+not\s+(directly|implement|code)/i,
  /agent-?first/i,
];

// ─── Analysis Functions ─────────────────────────────────────────────────────

/**
 * Count how many agent names are referenced in the content.
 * Returns a normalized score (0-1).
 */
function analyzeAgentNameReferences(content: string, agents: DiscoveredAgent[]): { score: number; details: string[] } {
  if (agents.length === 0) return { score: 0, details: [] };

  const details: string[] = [];
  let found = 0;

  for (const agent of agents) {
    // Validate agent name before constructing regex to prevent ReDoS
    if (!SAFE_AGENT_NAME.test(agent.name)) {
      // Fallback to case-insensitive substring search for unusual names
      if (content.toLowerCase().includes(agent.name.toLowerCase())) {
        found++;
        details.push(`Agent "${agent.name}" referenced`);
      }
      continue;
    }
    const pattern = new RegExp(`\\b${escapeRegex(agent.name)}\\b`, 'i');
    if (pattern.test(content)) {
      found++;
      details.push(`Agent "${agent.name}" referenced`);
    }
  }

  const score = Math.min(found / Math.max(agents.length, 1), 1);
  return { score, details };
}

/**
 * Analyze workflow keyword patterns in orchestration context.
 * Returns a normalized score (0-1).
 */
function analyzeWorkflowKeywords(content: string): { score: number; details: string[] } {
  const details: string[] = [];
  let matches = 0;

  for (const pattern of WORKFLOW_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      matches++;
      details.push(`Workflow pattern: "${match[0]}"`);
    }
  }

  // Normalize: 3+ matches = full score
  const score = Math.min(matches / 3, 1);
  return { score, details };
}

/**
 * Analyze Task tool usage references.
 * Returns a normalized score (0-1).
 */
function analyzeTaskToolUsage(content: string): { score: number; details: string[] } {
  const details: string[] = [];
  let matches = 0;

  for (const pattern of TASK_TOOL_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      matches++;
      details.push(`Task tool usage: "${match[0]}"`);
    }
  }

  // Normalize: 3+ matches = full score
  const score = Math.min(matches / 3, 1);
  return { score, details };
}

/**
 * Analyze delegation pattern indicators.
 * Returns a normalized score (0-1).
 */
function analyzeDelegationPatterns(content: string): { score: number; details: string[] } {
  const details: string[] = [];
  let matches = 0;

  for (const pattern of DELEGATION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      matches++;
      details.push(`Delegation pattern: "${match[0]}"`);
    }
  }

  // Normalize: 2+ matches = full score
  const score = Math.min(matches / 2, 1);
  return { score, details };
}

/**
 * Check for @import directives (bonus signal).
 */
function hasImportDirectives(content: string): boolean {
  return /@\w+\.md\b/.test(content);
}

// ─── Main Analysis ──────────────────────────────────────────────────────────

/**
 * Analyze the maturity level of CLAUDE.md content.
 *
 * IMPORTANT: The content passed here should already have the OMCSA section
 * removed (via removeOmcsaSection) to prevent feedback loops.
 *
 * @param cleanedContent - CLAUDE.md content with OMCSA section removed
 * @param agents - Discovered agents to check for name references
 */
export function analyzeMaturity(cleanedContent: string, agents: DiscoveredAgent[]): MaturityResult {
  const agentRef = analyzeAgentNameReferences(cleanedContent, agents);
  const workflow = analyzeWorkflowKeywords(cleanedContent);
  const taskTool = analyzeTaskToolUsage(cleanedContent);
  const delegation = analyzeDelegationPatterns(cleanedContent);

  const signals: MaturitySignals = {
    agentNameReferences: agentRef.score,
    workflowKeywords: workflow.score,
    taskToolUsage: taskTool.score,
    delegationPatterns: delegation.score,
  };

  let compositeScore =
    signals.agentNameReferences * WEIGHTS.agentNameReferences +
    signals.workflowKeywords * WEIGHTS.workflowKeywords +
    signals.taskToolUsage * WEIGHTS.taskToolUsage +
    signals.delegationPatterns * WEIGHTS.delegationPatterns;

  // @import directive bonus
  const details = [...agentRef.details, ...workflow.details, ...taskTool.details, ...delegation.details];
  if (hasImportDirectives(cleanedContent)) {
    compositeScore = Math.min(compositeScore + 0.1, 1);
    details.push('@import directives detected (+0.1 bonus)');
  }

  // Determine level
  let level: MaturityLevel;
  if (compositeScore >= HIGH_THRESHOLD) {
    level = 'HIGH';
  } else if (compositeScore >= MEDIUM_THRESHOLD) {
    level = 'MEDIUM';
  } else {
    level = 'LOW';
  }

  return { level, signals, compositeScore, details };
}

/**
 * Resolve the effective maturity level based on CLI flags and config.
 *
 * Priority: CLI flag > config > default ("auto")
 *
 * @param cliMaturity - CLI --maturity flag value
 * @param configMode - Config maturity.mode value
 * @param analyzed - Result from analyzeMaturity()
 * @returns The maturity level to use
 */
export function resolveMaturityLevel(
  cliMaturity: string | undefined,
  configMode: string | undefined,
  analyzed: MaturityResult,
): MaturityLevel {
  const effective = cliMaturity || configMode || 'auto';

  switch (effective) {
    case 'auto':
      return analyzed.level;
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':
      return effective;
    case 'full':
    default:
      return 'LOW'; // full = always generate complete prompt (same as LOW)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
