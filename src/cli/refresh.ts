/**
 * Refresh Command
 *
 * Re-scans .claude/agents/ and regenerates the orchestrator prompt.
 * Alias for `apply` but with more explicit scanning output.
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scanAgents } from '../core/scanner.js';
import { generateOrchestratorPrompt, updateClaudeMdContent, removeOmcsaSection } from '../core/prompt-generator.js';
import { loadConfig, applyConfigOverrides } from '../core/config-loader.js';
import { detectOmc, loadMode } from '../core/omc-detector.js';
import { analyzeMaturity, resolveMaturityLevel } from '../core/maturity-analyzer.js';
import { scanOmcAgents } from '../core/omc-agent-scanner.js';
import type { PromptOptions } from '../core/types.js';

interface RefreshOptions {
  maturity?: string;
}

export async function runRefresh(options: RefreshOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan('\n  Refreshing agent configuration...\n'));

  // Scan agents
  let agents = scanAgents(projectRoot);

  if (agents.length === 0) {
    console.log(chalk.yellow('  No agents found in .claude/agents/ or ~/.claude/agents/'));
    console.log(chalk.dim('  The OMCSA section will be removed from CLAUDE.md.\n'));

    // Remove OMCSA section if no agents
    const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      const content = readFileSync(claudeMdPath, 'utf-8');
      const updated = removeOmcsaSection(content);
      writeFileSync(claudeMdPath, updated, 'utf-8');
      console.log(chalk.green('  Removed OMCSA section from CLAUDE.md\n'));
    }
    return;
  }

  // Apply config overrides
  const config = loadConfig(projectRoot);
  agents = applyConfigOverrides(agents, config);

  console.log(chalk.green(`  Found ${agents.length} agent(s):`));
  for (const agent of agents) {
    const modelStr = agent.model || 'default';
    console.log(`    - ${agent.name} (${modelStr}, ${agent.category})`);
  }

  // Detect OMC and check mode
  const omcResult = detectOmc();
  const modeConfig = loadMode(projectRoot);
  const mode = modeConfig?.mode || 'standalone';
  const omcExclusive = omcResult.found && mode === 'standalone';

  // Read existing CLAUDE.md for maturity analysis
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  let existingContent = '';

  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  }

  // Maturity analysis
  const cleanedContent = removeOmcsaSection(existingContent);
  const maturityResult = analyzeMaturity(cleanedContent, agents);
  const effectiveMaturity = resolveMaturityLevel(options.maturity, config.maturity?.mode, maturityResult);

  const isAdaptive = options.maturity === 'auto' || config.maturity?.mode === 'auto';
  console.log(
    chalk.dim(`  Maturity: ${maturityResult.level} (${maturityResult.compositeScore.toFixed(2)})`) +
    (isAdaptive
      ? chalk.cyan(` — Adaptive (${effectiveMaturity})`)
      : chalk.dim(' — Full prompt'))
  );

  // OMC agents for integrated mode
  let omcAgents;
  if (mode === 'integrated') {
    const omcScan = scanOmcAgents(projectRoot);
    omcAgents = omcScan.agents;
  }

  // Regenerate prompt
  const promptOptions: PromptOptions = {
    config,
    omcDetected: omcExclusive,
    maturityLevel: effectiveMaturity,
    mode,
    omcAgents,
  };
  const prompt = generateOrchestratorPrompt(agents, promptOptions);

  // Update CLAUDE.md
  const updatedContent = updateClaudeMdContent(existingContent, prompt);
  writeFileSync(claudeMdPath, updatedContent, 'utf-8');

  console.log(chalk.green('\n  Updated .claude/CLAUDE.md'));
  console.log(chalk.green('  Refresh complete!\n'));
}
