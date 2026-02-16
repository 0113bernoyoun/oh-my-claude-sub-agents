/**
 * Cancel Command
 *
 * Cancels any active modes (ralph, ultrawork) by clearing state files.
 */

import chalk from 'chalk';
import { existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../core/config-loader.js';

export async function runCancel(): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);
  const stateDir = join(projectRoot, config.persistence?.stateDir || '.omcsa/state');

  console.log(chalk.cyan('\n  🛑 Cancelling active modes...\n'));

  if (!existsSync(stateDir)) {
    console.log(chalk.dim('  No active modes found.\n'));
    return;
  }

  let cancelled = 0;

  try {
    const files = readdirSync(stateDir);
    for (const file of files) {
      if (file.endsWith('-state.json')) {
        const filePath = join(stateDir, file);
        const mode = file.replace('-state.json', '');
        unlinkSync(filePath);
        const label = mode === 'workflow' ? 'active workflow' : `${mode} mode`;
        console.log(chalk.green(`  \u2713 Cancelled ${label}`));
        cancelled++;
      }
    }
  } catch {
    console.log(chalk.yellow('  ⚠ Could not read state directory'));
  }

  if (cancelled === 0) {
    console.log(chalk.dim('  No active modes found.'));
  } else {
    console.log(chalk.green(`\n  ✅ Cancelled ${cancelled} mode(s)\n`));
  }
}
