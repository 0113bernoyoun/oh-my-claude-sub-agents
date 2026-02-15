/**
 * Orchestrator Prompt Generator
 *
 * Generates the orchestrator prompt section that gets injected into CLAUDE.md.
 * This prompt instructs Claude Code to delegate tasks to specialized sub-agents.
 *
 * Supports maturity-level-dependent prompt generation and integrated mode
 * orchestration with OMC agents.
 */

import {
  DiscoveredAgent,
  OmcsaConfig,
  OmcAgent,
  AgentCategory,
  OMCSA_MARKER_START,
  OMCSA_MARKER_END,
  DEFAULT_CONFIG,
} from './types.js';
import type { MaturityLevel, PromptOptions } from './types.js';

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Group agents by category for combination suggestions.
 */
function groupByCategory(agents: DiscoveredAgent[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const agent of agents) {
    if (!groups[agent.category]) {
      groups[agent.category] = [];
    }
    groups[agent.category].push(agent.name);
  }
  return groups;
}

/**
 * Generate agent combination suggestions based on categories.
 */
function generateCombinations(agents: DiscoveredAgent[]): string {
  const groups = groupByCategory(agents);
  const lines: string[] = [];

  const implAgents = groups['implementation'] || [];
  const testAgents = groups['testing'] || [];
  const reviewAgents = groups['review'] || [];
  const exploreAgents = groups['exploration'] || [];

  if (implAgents.length > 0 && testAgents.length > 0) {
    lines.push(`- **Implementation + Testing**: ${implAgents.join('/')} → ${testAgents.join('/')}`);
  }
  if (implAgents.length > 0 && reviewAgents.length > 0) {
    lines.push(`- **Implementation + Review**: ${implAgents.join('/')} → ${reviewAgents.join('/')}`);
  }
  if (implAgents.length > 0 && testAgents.length > 0 && reviewAgents.length > 0) {
    lines.push(`- **Full Pipeline**: ${implAgents.join('/')} → ${testAgents.join('/')} → ${reviewAgents.join('/')}`);
  }
  if (exploreAgents.length > 0 && implAgents.length > 0) {
    lines.push(`- **Explore + Implement**: ${exploreAgents.join('/')} → ${implAgents.join('/')}`);
  }

  if (lines.length === 0) {
    return '';
  }

  return `### Agent Combinations\n${lines.join('\n')}`;
}

/**
 * Generate model tier documentation.
 */
function generateModelTiers(agents: DiscoveredAgent[]): string {
  const tiers: Record<string, string[]> = { LOW: [], MEDIUM: [], HIGH: [], DEFAULT: [] };

  for (const agent of agents) {
    tiers[agent.tier].push(agent.name);
  }

  const lines: string[] = ['### Model Tiers'];
  const tierLabels: Record<string, string> = {
    LOW: 'LOW (Haiku)',
    MEDIUM: 'MEDIUM (Sonnet)',
    HIGH: 'HIGH (Opus)',
    DEFAULT: 'DEFAULT (inherit model)',
  };

  for (const [tier, label] of Object.entries(tierLabels)) {
    if (tiers[tier].length > 0) {
      lines.push(`- **${label}**: ${tiers[tier].join(', ')}`);
    }
  }

  lines.push('');
  lines.push('When delegating via Task tool, set the `model` parameter to match the agent\'s tier.');
  lines.push('If a model is unavailable (e.g., Opus on Pro plan), fall back to the next available tier.');

  return lines.join('\n');
}

/**
 * Generate the ultrawork mode prompt section.
 */
function generateUltraworkSection(agents: DiscoveredAgent[]): string {
  const agentList = agents
    .map(a => `- ${a.name} (${a.model || 'default'}): ${a.description}`)
    .join('\n');

  return `### Ultrawork Mode (Parallel Execution)

When activated with "ultrawork:" or "ulw:" prefix:
1. Identify independent tasks from the user's request
2. Launch each task via Task tool simultaneously (use run_in_background=true)
3. Set the model parameter based on each agent's tier
4. Verify all tasks completed with build/test evidence
5. Report comprehensive results

Available agents for parallel dispatch:
${agentList}`;
}

/**
 * Generate the ralph mode prompt section.
 */
function generateRalphSection(): string {
  return `### Ralph Mode (Persistent Loop)

When activated with "ralph:" or "must complete:" prefix:
1. Work continuously until ALL requirements are met
2. After each iteration, review progress against original request
3. Do not stop until explicitly cancelled or max iterations reached
4. Use verification agents (review/testing) before declaring completion
5. Run \`omcsa cancel\` when truly done`;
}

/**
 * Generate the delegation enforcement section.
 */
function generateDelegationSection(level: string): string {
  if (level === 'off') return '';

  const modeDesc = level === 'strict'
    ? 'Delegation is STRICTLY enforced. You MUST NOT directly modify source code files.'
    : 'Delegation is recommended. You SHOULD delegate source code modifications to specialized agents.';

  return `### Delegation Enforcement (${level})

${modeDesc}

As an orchestrator, your role is to:
- Analyze requirements and break them into tasks
- Delegate implementation to appropriate sub-agents via Task tool
- Verify results and coordinate between agents
- You MAY directly modify config files, documentation, and .omcsa/ files`;
}

/**
 * Generate the agent exclusivity section for standalone mode with OMC detected.
 */
function generateAgentExclusivitySection(): string {
  return `### Agent Exclusivity (Standalone Mode)

CRITICAL: You MUST ONLY delegate tasks to the agents listed in the "Available Agents" table above.
Do NOT use oh-my-claudecode (OMC) agents such as oh-my-claudecode:architect,
oh-my-claudecode:explore, oh-my-claudecode:executor, or any other oh-my-claudecode:* agent.
OMCSA manages your agent orchestration exclusively in this project.
If a task requires capabilities not covered by the available agents listed above,
handle it directly rather than delegating to OMC agents.`;
}

// ─── Maturity-Dependent Sections ────────────────────────────────────────────

/**
 * Generate getting started section for LOW maturity users.
 */
function generateGettingStartedSection(agents: DiscoveredAgent[]): string {
  const lines = [
    '### Getting Started with Agent Orchestration',
    '',
    'As an orchestrator, you coordinate specialized agents rather than doing work directly.',
    'Here\'s how to effectively delegate:',
    '',
    '**Basic delegation example:**',
    '```',
    'User: "Add a login form with validation"',
    '',
    'Orchestrator approach:',
    '1. Identify the right agent (e.g., an implementation agent)',
    '2. Use the Task tool to delegate:',
    '   Task({ subagent_type: "<agent-name>", prompt: "Build a login form with..." })',
    '3. Review the result and run tests if available',
    '```',
    '',
    '**Key principles:**',
    '- Always use the Task tool to delegate work to agents',
    '- Set the `model` parameter to match the agent\'s tier (haiku/sonnet/opus)',
    '- For independent tasks, launch agents in parallel with `run_in_background: true`',
    '- Verify each agent\'s output before considering the task complete',
  ];

  if (agents.length > 1) {
    lines.push('', '**Multi-agent workflow:**');
    lines.push('- Break complex requests into sub-tasks');
    lines.push('- Assign each sub-task to the most appropriate agent');
    lines.push('- Coordinate results and handle any conflicts');
  }

  return lines.join('\n');
}

/**
 * Generate gap analysis for MEDIUM maturity users.
 */
function generateGapAnalysis(agents: DiscoveredAgent[]): string {
  const groups = groupByCategory(agents);
  const gaps: string[] = [];

  if (!groups['testing'] || groups['testing'].length === 0) {
    gaps.push('- **Testing**: No testing agent found. Consider adding one for automated quality checks.');
  }
  if (!groups['review'] || groups['review'].length === 0) {
    gaps.push('- **Review**: No review agent found. Consider adding one for code review workflows.');
  }
  if (!groups['exploration'] || groups['exploration'].length === 0) {
    gaps.push('- **Exploration**: No exploration agent found. Consider adding one for codebase analysis.');
  }

  if (gaps.length === 0) return '';

  return `### Coverage Gaps\n\nYour agent setup could be improved in these areas:\n${gaps.join('\n')}`;
}

/**
 * Generate minimal registry for HIGH maturity users.
 */
function generateMinimalRegistry(agents: DiscoveredAgent[]): string {
  const tableHeader = '| Agent | Model | Cat | Description |';
  const tableSep =    '|-------|-------|-----|-------------|';
  const tableRows = agents.map(a =>
    `| ${a.name} | ${a.model || '-'} | ${a.category.slice(0, 4)} | ${a.description} |`
  );

  return [tableHeader, tableSep, ...tableRows].join('\n');
}

// ─── Integrated Mode ────────────────────────────────────────────────────────

/**
 * Generate integrated mode prompt with custom (PRIMARY) and OMC (SUPPLEMENTARY) agents.
 */
function generateIntegratedSection(
  agents: DiscoveredAgent[],
  omcAgents: OmcAgent[],
  maturityLevel: MaturityLevel,
): string {
  const customCategories = new Set<AgentCategory>(agents.map(a => a.category));
  const omcCategories = new Set<AgentCategory>(omcAgents.map(a => a.category));

  // Custom agents table
  const customHeader = '| Agent | Model | Category | Description |';
  const customSep =    '|-------|-------|----------|-------------|';
  const customRows = agents.map(a =>
    `| ${a.name} | ${a.model || 'default'} | ${a.category} | ${a.description} |`
  );

  // Supplementary OMC agents (only categories not covered by custom)
  const supplementary = omcAgents.filter(omc => !customCategories.has(omc.category));

  const omcHeader = '| Agent | Category | Description |';
  const omcSep =    '|-------|----------|-------------|';
  const omcRows = supplementary.map(a =>
    `| ${a.fullName} | ${a.category} | ${a.description} |`
  );

  const sections: string[] = [
    '### Custom Agents (PRIMARY - always preferred)',
    '',
    customHeader,
    customSep,
    ...customRows,
  ];

  if (omcRows.length > 0) {
    sections.push(
      '',
      '### OMC Agents (SUPPLEMENTARY - uncovered areas only)',
      '',
      omcHeader,
      omcSep,
      ...omcRows,
    );
  }

  // Routing rules
  if (maturityLevel === 'LOW') {
    sections.push(
      '',
      '### Routing Rules',
      '1. **Custom agents always take priority** — if a custom agent covers the task category, use it',
      '2. **OMC agents fill gaps** — only use OMC agents for categories not covered by custom agents',
      '3. **User CLAUDE.md rules are supreme** — any workflow rules in this document override these defaults',
      '',
      '**Example:** If you have a custom implementation agent AND OMC has oh-my-claudecode:executor,',
      'always use your custom implementation agent. Only use OMC agents for categories like testing',
      'or review if you don\'t have custom agents for those.',
    );
  } else {
    sections.push(
      '',
      '### Routing: Custom > OMC > Direct. User workflow rules override all.',
    );
  }

  // Coverage matrix
  const allCats: AgentCategory[] = ['implementation', 'review', 'testing', 'exploration'];
  const coveredCats = allCats.filter(cat => customCategories.has(cat) || omcCategories.has(cat));
  if (coveredCats.length > 0) {
    sections.push(
      '',
      '### Coverage Matrix',
      '| Category | Custom | OMC |',
      '|----------|--------|-----|',
      ...coveredCats.map(cat =>
        `| ${cat} | ${customCategories.has(cat) ? '✓' : '-'} | ${omcCategories.has(cat) ? '✓' : '-'} |`
      ),
    );
  }

  return sections.join('\n');
}

// ─── Main Prompt Generation ─────────────────────────────────────────────────

/**
 * Generate the complete orchestrator prompt.
 *
 * @param agents - Discovered custom agents
 * @param options - Prompt generation options (config, maturity, mode, OMC agents)
 */
export function generateOrchestratorPrompt(
  agents: DiscoveredAgent[],
  options?: PromptOptions,
): string {
  const config = options?.config;
  const omcDetected = options?.omcDetected ?? false;
  const maturityLevel = options?.maturityLevel ?? 'LOW';
  const mode = options?.mode;
  const omcAgents = options?.omcAgents;

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const features = mergedConfig.features || DEFAULT_CONFIG.features!;

  // For integrated mode with OMC agents, generate specialized prompt
  const isIntegrated = mode === 'integrated' && omcAgents && omcAgents.length > 0;

  const sections: string[] = [OMCSA_MARKER_START];

  if (maturityLevel === 'HIGH') {
    // HIGH maturity: minimal registry + mode keywords only
    sections.push(
      '## Agent Orchestration',
      '',
      generateMinimalRegistry(agents),
    );

    if (isIntegrated) {
      sections.push('', generateIntegratedSection(agents, omcAgents!, maturityLevel));
    }

    // Only keywords for modes
    const modeKeywords: string[] = [];
    if (features.ultrawork) modeKeywords.push('ultrawork/ulw');
    if (features.ralph) modeKeywords.push('ralph/must-complete');
    if (modeKeywords.length > 0) {
      sections.push('', `Modes: ${modeKeywords.join(', ')}`);
    }

    if (omcDetected && mode !== 'integrated') {
      sections.push('', 'Agents: custom only (no OMC)');
    }
  } else if (maturityLevel === 'MEDIUM') {
    // MEDIUM maturity: agent table + condensed rules + gap analysis
    const tableHeader = '| Agent | Model | Category | Scope | Description |';
    const tableSep =    '|-------|-------|----------|-------|-------------|';
    const tableRows = agents.map(a =>
      `| ${a.name} | ${a.model || 'default'} | ${a.category} | ${a.scope} | ${a.description} |`
    );

    sections.push(
      '## Agent Orchestration',
      '',
      '### Available Agents',
      '',
      tableHeader,
      tableSep,
      ...tableRows,
      '',
      '### Rules',
      '- Delegate via Task tool, parallelize independent tasks, verify with evidence',
      '- Follow all project conventions and workflow rules defined in this document',
    );

    if (isIntegrated) {
      sections.push('', generateIntegratedSection(agents, omcAgents!, maturityLevel));
    }

    // Condensed combinations
    const combinations = generateCombinations(agents);
    if (combinations) {
      sections.push('', combinations);
    }

    // Model tiers (condensed)
    if (features.modelTiering) {
      sections.push('', generateModelTiers(agents));
    }

    // Ultrawork/Ralph (condensed)
    if (features.ultrawork) {
      sections.push('', '### Ultrawork Mode', 'Prefix with "ultrawork:" for parallel agent dispatch.');
    }
    if (features.ralph) {
      sections.push('', '### Ralph Mode', 'Prefix with "ralph:" for persistent loop until completion.');
    }

    // Delegation
    const delegationLevel = features.delegationEnforcement || 'warn';
    if (delegationLevel !== 'off') {
      sections.push('', generateDelegationSection(delegationLevel));
    }

    if (omcDetected && mode !== 'integrated') {
      sections.push('', generateAgentExclusivitySection());
    }

    // Gap analysis
    const gapAnalysis = generateGapAnalysis(agents);
    if (gapAnalysis) {
      sections.push('', gapAnalysis);
    }
  } else {
    // LOW maturity: full detailed prompt (v0.1.0 compatible)
    const tableHeader = '| Agent | Model | Category | Scope | Description |';
    const tableSep =    '|-------|-------|----------|-------|-------------|';
    const tableRows = agents.map(a =>
      `| ${a.name} | ${a.model || 'default'} | ${a.category} | ${a.scope} | ${a.description} |`
    );

    sections.push(
      '## Agent Orchestration',
      '',
      'You are an orchestrator. Delegate tasks to specialized sub-agents instead of doing work directly.',
      '',
      '### Available Agents',
      '',
      tableHeader,
      tableSep,
      ...tableRows,
      '',
      '### Orchestration Rules',
      '1. **Delegate**: Use Task tool to delegate to the appropriate agent',
      '2. **Parallelize**: Launch independent tasks simultaneously',
      '3. **Verify**: Always verify completion with build/test evidence',
      '4. **Continue**: Do not stop until ALL tasks are completed',
      '',
      `### Workflow & Convention Integration
**IMPORTANT**: This project has custom rules, workflows, and conventions defined in this document
(and any files referenced via @imports). You MUST follow ALL of them, including:
- **Code conventions**: Naming, style, patterns, and architecture rules
- **Agent workflows**: Chaining sequences (e.g., implementation → review)
- **Post-completion actions**: Artifact creation, documentation updates
- **Agent dependencies**: Handoff protocols between agents
- **Team processes**: Any team-specific conventions

When delegating to sub-agents, include relevant convention context in the Task prompt.
When an agent completes work, check if workflow rules specify follow-up actions
and execute them before considering the task complete.`,
    );

    if (isIntegrated) {
      sections.push('', generateIntegratedSection(agents, omcAgents!, maturityLevel));
    }

    // Agent combinations
    const combinations = generateCombinations(agents);
    if (combinations) {
      sections.push('', combinations);
    }

    // Model tiers
    if (features.modelTiering) {
      sections.push('', generateModelTiers(agents));
    }

    // Ultrawork mode
    if (features.ultrawork) {
      sections.push('', generateUltraworkSection(agents));
    }

    // Ralph mode
    if (features.ralph) {
      sections.push('', generateRalphSection());
    }

    // Delegation enforcement
    const delegationLevel = features.delegationEnforcement || 'warn';
    if (delegationLevel !== 'off') {
      sections.push('', generateDelegationSection(delegationLevel));
    }

    // Agent Exclusivity (standalone mode with OMC detected)
    if (omcDetected && mode !== 'integrated') {
      sections.push('', generateAgentExclusivitySection());
    }

    // Getting started guide
    sections.push('', generateGettingStartedSection(agents));
  }

  sections.push(OMCSA_MARKER_END);

  return sections.join('\n');
}

// ─── CLAUDE.md Operations ───────────────────────────────────────────────────

/**
 * Update CLAUDE.md content with the OMCSA orchestrator section.
 * If markers exist, replaces the section. Otherwise appends.
 */
export function updateClaudeMdContent(existingContent: string, orchestratorPrompt: string): string {
  const startIdx = existingContent.indexOf(OMCSA_MARKER_START);
  const endIdx = existingContent.indexOf(OMCSA_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing section
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + OMCSA_MARKER_END.length);
    return `${before}${orchestratorPrompt}${after}`;
  }

  // Append to end
  const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
  return `${existingContent}${separator}${orchestratorPrompt}\n`;
}

/**
 * Remove the OMCSA section from CLAUDE.md content.
 */
export function removeOmcsaSection(content: string): string {
  const startIdx = content.indexOf(OMCSA_MARKER_START);
  const endIdx = content.indexOf(OMCSA_MARKER_END);

  if (startIdx === -1 || endIdx === -1) return content;

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + OMCSA_MARKER_END.length);

  // Clean up extra newlines
  return (before + after).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
