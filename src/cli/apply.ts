/**
 * Apply Command
 *
 * Re-applies config changes: re-scans agents, regenerates prompt,
 * and updates CLAUDE.md.
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scanAgents } from '../core/scanner.js';
import { generateOrchestratorPrompt, updateClaudeMdContent } from '../core/prompt-generator.js';
import { loadConfig, applyConfigOverrides } from '../core/config-loader.js';
import { detectOmc, loadMode } from '../core/omc-detector.js';

export async function runApply(): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan('\n  🔄 Applying configuration...\n'));

  // Scan agents
  let agents = scanAgents(projectRoot);

  if (agents.length === 0) {
    console.log(chalk.yellow('  ⚠ No agents found. Nothing to apply.'));
    return;
  }

  // Load and apply config overrides
  const config = loadConfig(projectRoot);
  agents = applyConfigOverrides(agents, config);

  console.log(chalk.green(`  ✓ Found ${agents.length} agent(s)`));

  // Detect OMC and check mode for agent exclusivity
  const omcResult = detectOmc();
  const modeConfig = loadMode(projectRoot);
  const omcExclusive = omcResult.found && (modeConfig?.mode || 'standalone') === 'standalone';

  // Regenerate prompt
  const prompt = generateOrchestratorPrompt(agents, config, omcExclusive);

  // Update CLAUDE.md
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  let existingContent = '';

  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  }

  const updatedContent = updateClaudeMdContent(existingContent, prompt);
  writeFileSync(claudeMdPath, updatedContent, 'utf-8');

  console.log(chalk.green('  ✓ Updated .claude/CLAUDE.md'));
  console.log(chalk.green('\n  ✅ Configuration applied!\n'));
}
