/**
 * Uninstall Command
 *
 * Removes all OMCSA components:
 * - Hook scripts from .claude/hooks/
 * - OMCSA section from CLAUDE.md
 * - Hook registrations from settings.json
 * - State files and mode.json from .omcsa/
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { removeOmcsaSection } from '../core/prompt-generator.js';
import { OMCSA_EXTERNAL_FILENAME } from '../core/types.js';
import { uninstallHooks } from '../installer/hooks-installer.js';
import { removeHooksFromSettings } from '../installer/settings-updater.js';

export async function runUninstall(): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan('\n  🗑  Uninstalling OMCSA...\n'));

  // Remove hooks
  const removedHooks = uninstallHooks(projectRoot);
  if (removedHooks.length > 0) {
    console.log(chalk.green(`  ✓ Removed ${removedHooks.length} hook script(s)`));
  }

  // Remove from settings.json
  removeHooksFromSettings(projectRoot);
  console.log(chalk.green('  ✓ Cleaned settings.json'));

  // Remove OMCSA section from CLAUDE.md
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    const updated = removeOmcsaSection(content);
    writeFileSync(claudeMdPath, updated, 'utf-8');
    console.log(chalk.green('  ✓ Removed OMCSA section from CLAUDE.md'));
  }

  // Remove external omcsa-agents.md file
  const externalPath = join(projectRoot, '.claude', OMCSA_EXTERNAL_FILENAME);
  if (existsSync(externalPath)) {
    rmSync(externalPath);
    console.log(chalk.green(`  ✓ Removed ${OMCSA_EXTERNAL_FILENAME}`));
  }

  // Remove state directory
  const stateDir = join(projectRoot, '.omcsa');
  if (existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
    console.log(chalk.green('  ✓ Removed .omcsa/ state directory'));
  }

  // Remove config file
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
  if (existsSync(configPath)) {
    rmSync(configPath);
    console.log(chalk.green('  ✓ Removed omcsa.config.json'));
  }

  console.log(chalk.green('\n  ✅ OMCSA fully uninstalled.\n'));
}
