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
import { generateOrchestratorPrompt, updateClaudeMdContent } from '../core/prompt-generator.js';
import { loadConfig, applyConfigOverrides } from '../core/config-loader.js';
import { detectOmc, loadMode } from '../core/omc-detector.js';

export async function runRefresh(): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan('\n  🔄 Refreshing agent configuration...\n'));

  // Scan agents
  let agents = scanAgents(projectRoot);

  if (agents.length === 0) {
    console.log(chalk.yellow('  ⚠ No agents found in .claude/agents/ or ~/.claude/agents/'));
    console.log(chalk.dim('  The OMCSA section will be removed from CLAUDE.md.\n'));

    // Remove OMCSA section if no agents
    const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      const { removeOmcsaSection } = await import('../core/prompt-generator.js');
      const content = readFileSync(claudeMdPath, 'utf-8');
      const updated = removeOmcsaSection(content);
      writeFileSync(claudeMdPath, updated, 'utf-8');
      console.log(chalk.green('  ✓ Removed OMCSA section from CLAUDE.md\n'));
    }
    return;
  }

  // Apply config overrides
  const config = loadConfig(projectRoot);
  agents = applyConfigOverrides(agents, config);

  console.log(chalk.green(`  ✓ Found ${agents.length} agent(s):`));
  for (const agent of agents) {
    const modelStr = agent.model || 'default';
    console.log(`    - ${agent.name} (${modelStr}, ${agent.category})`);
  }

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

  console.log(chalk.green('\n  ✓ Updated .claude/CLAUDE.md'));
  console.log(chalk.green('  ✅ Refresh complete!\n'));
}
