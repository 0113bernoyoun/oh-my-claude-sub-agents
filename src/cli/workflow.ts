/**
 * Workflow Command
 *
 * Manages agent workflow pipelines.
 * - list: Show configured workflows
 * - add all: Auto-generate from agent categories
 * - add <agents...>: Custom workflow from listed agents
 * - rm <name>: Remove a workflow
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scanAgents } from '../core/scanner.js';
import { loadConfig, writeConfig, applyConfigOverrides } from '../core/config-loader.js';
import { generateSuggestedWorkflows } from '../core/workflow-generator.js';
import { generateOrchestratorPrompt, updateClaudeMdContent, removeOmcsaSection } from '../core/prompt-generator.js';
import { detectOmc, loadMode } from '../core/omc-detector.js';
import { analyzeMaturity, resolveMaturityLevel } from '../core/maturity-analyzer.js';
import { scanOmcAgents } from '../core/omc-agent-scanner.js';
import type { PromptOptions, WorkflowDefinition } from '../core/types.js';

/**
 * Re-scan agents and regenerate CLAUDE.md prompt (shared helper).
 */
async function reapplyPrompt(projectRoot: string): Promise<void> {
  let agents = scanAgents(projectRoot);
  if (agents.length === 0) return;

  const config = loadConfig(projectRoot);
  agents = applyConfigOverrides(agents, config);

  const omcResult = detectOmc();
  const modeConfig = loadMode(projectRoot);
  const mode = modeConfig?.mode || 'standalone';

  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  let existingContent = '';
  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  }

  const cleanedContent = removeOmcsaSection(existingContent);
  const maturityResult = analyzeMaturity(cleanedContent, agents);
  const effectiveMaturity = resolveMaturityLevel(undefined, config.maturity?.mode, maturityResult);

  let omcAgents;
  if (mode === 'integrated') {
    const omcScan = scanOmcAgents(projectRoot);
    omcAgents = omcScan.agents;
  }

  const promptOptions: PromptOptions = {
    config,
    omcDetected: omcResult.found && mode === 'standalone',
    maturityLevel: effectiveMaturity,
    mode,
    omcAgents,
  };
  const prompt = generateOrchestratorPrompt(agents, promptOptions);
  const updatedContent = updateClaudeMdContent(existingContent, prompt);
  writeFileSync(claudeMdPath, updatedContent, 'utf-8');
}

/**
 * List configured workflows.
 */
export async function runWorkflowList(): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);

  console.log(chalk.cyan('\n  Workflow Pipelines\n'));

  if (!config.workflows || Object.keys(config.workflows).length === 0) {
    console.log(chalk.dim('  No workflows configured.'));
    console.log(chalk.dim('  Run: omcsa workflow add all\n'));
    return;
  }

  for (const [name, wf] of Object.entries(config.workflows)) {
    console.log(`  ${chalk.bold(name)} (${wf.mode}):`);
    console.log(`    ${wf.steps.join(' \u2192 ')}`);
  }
  console.log();
}

/**
 * Add workflows.
 * - "all" → auto-generate from agent categories
 * - list of agent names → custom workflow
 */
export async function runWorkflowAdd(
  agents: string[],
  options?: { name?: string },
): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);

  if (!config.workflows) {
    config.workflows = {};
  }

  if (agents.length === 1 && agents[0] === 'all') {
    // Auto-generate from agent categories
    const discoveredAgents = applyConfigOverrides(scanAgents(projectRoot), config);
    if (discoveredAgents.length === 0) {
      console.log(chalk.yellow('\n  No agents found. Cannot generate workflows.\n'));
      return;
    }

    const suggested = generateSuggestedWorkflows(discoveredAgents);
    if (Object.keys(suggested).length === 0) {
      const categoryCounts = new Map<string, number>();
      for (const a of discoveredAgents) {
        categoryCounts.set(a.category, (categoryCounts.get(a.category) || 0) + 1);
      }
      const categoryList = Array.from(categoryCounts.entries())
        .map(([cat, n]) => `${cat}(${n})`)
        .join(', ');

      console.log(chalk.yellow('\n  Cannot auto-generate workflows.'));
      console.log(chalk.yellow(`  Need 2+ agents across 2+ different categories.`));
      console.log(chalk.yellow(`  Current: ${discoveredAgents.length} agents — ${categoryList}`));
      console.log();
      console.log(chalk.dim('  Options:'));
      console.log(chalk.dim('  - Set categories in agent frontmatter (category: implementation/review/testing/exploration)'));
      console.log(chalk.dim('  - Set categories in omcsa.config.json'));
      console.log(chalk.dim('  - Create custom: omcsa workflow add --name my-flow agent1 agent2 agent3\n'));
      return;
    }

    // Merge into config (overwrite existing with same name)
    for (const [name, wf] of Object.entries(suggested)) {
      config.workflows[name] = wf;
    }

    writeConfig(projectRoot, config);

    console.log(chalk.green('\n  Generated workflows:'));
    for (const [name, wf] of Object.entries(suggested)) {
      console.log(`    ${chalk.bold(name)}: ${wf.steps.join(' \u2192 ')}`);
    }
  } else if (agents.length >= 2) {
    // Custom workflow from listed agents
    const name = options?.name || (agents.length > 0 ? `${agents[0]}-flow` : 'custom');

    const wf: WorkflowDefinition = {
      steps: agents,
      mode: 'sequential',
    };

    config.workflows[name] = wf;
    writeConfig(projectRoot, config);

    console.log(chalk.green(`\n  Added workflow "${name}":`));
    console.log(`    ${wf.steps.join(' \u2192 ')}`);
  } else {
    console.log(chalk.yellow('\n  Usage:'));
    console.log(chalk.dim('    omcsa workflow add all              Auto-generate from agent categories'));
    console.log(chalk.dim('    omcsa workflow add agent1 agent2    Custom workflow\n'));
    return;
  }

  // Re-apply prompt
  console.log(chalk.dim('  Regenerating prompt...'));
  await reapplyPrompt(projectRoot);
  console.log(chalk.green('  Updated .claude/CLAUDE.md\n'));
}

/**
 * Remove a workflow by name.
 */
export async function runWorkflowRemove(name: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);

  if (!config.workflows || !config.workflows[name]) {
    console.log(chalk.yellow(`\n  Workflow "${name}" not found.\n`));

    if (config.workflows && Object.keys(config.workflows).length > 0) {
      console.log(chalk.dim('  Available workflows:'));
      for (const wfName of Object.keys(config.workflows)) {
        console.log(chalk.dim(`    - ${wfName}`));
      }
      console.log();
    }
    return;
  }

  delete config.workflows[name];

  // Clean up empty workflows object
  if (Object.keys(config.workflows).length === 0) {
    delete config.workflows;
  }

  writeConfig(projectRoot, config);
  console.log(chalk.green(`\n  Removed workflow "${name}"`));

  // Re-apply prompt
  console.log(chalk.dim('  Regenerating prompt...'));
  await reapplyPrompt(projectRoot);
  console.log(chalk.green('  Updated .claude/CLAUDE.md\n'));
}
