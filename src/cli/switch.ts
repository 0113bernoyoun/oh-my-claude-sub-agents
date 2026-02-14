/**
 * Switch Command
 *
 * Switches the OMCSA install mode at runtime.
 * Smart hooks read mode.json to decide whether to yield or execute.
 * No hook reinstallation needed.
 */

import chalk from 'chalk';
import { isValidMode, loadMode, saveMode, detectOmc } from '../core/omc-detector.js';
import type { InstallMode } from '../core/types.js';

export async function runSwitch(modeArg: string): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Validate mode
  if (!isValidMode(modeArg)) {
    console.log(chalk.red(`\n  ✗ Invalid mode: "${modeArg}"`));
    console.log(chalk.dim('  Valid modes: standalone | omc-only | integrated\n'));
    process.exitCode = 1;
    return;
  }

  const newMode: InstallMode = modeArg;

  // 2. Load current mode
  const current = loadMode(projectRoot);
  const currentMode = current?.mode || 'standalone';

  if (currentMode === newMode) {
    console.log(chalk.yellow(`\n  Already in ${newMode} mode. No changes made.\n`));
    return;
  }

  // 3. Detect OMC for advisory
  const omcResult = detectOmc();

  // 4. Save new mode
  saveMode(projectRoot, newMode, omcResult);

  // 5. Output
  console.log(chalk.green(`\n  Mode switched: ${chalk.dim(currentMode)} → ${chalk.bold(newMode)}`));

  switch (newMode) {
    case 'standalone':
      console.log(chalk.dim('  OMCSA hooks now active (full orchestration by OMCSA).'));
      if (omcResult.found) {
        console.log(chalk.yellow('  ⚠ OMC is installed — hooks from both systems will be active.'));
      }
      break;
    case 'omc-only':
      console.log(chalk.dim('  OMCSA hooks now yield to OMC. Only orchestrator prompt active.'));
      if (!omcResult.found) {
        console.log(chalk.yellow('  ⚠ OMC not detected — mode features (ultrawork/ralph) will not be available.'));
      }
      break;
    case 'integrated':
      console.log(chalk.dim('  OMCSA hooks now yield to OMC. OMC + OMCSA agents integrated.'));
      if (!omcResult.found) {
        console.log(chalk.yellow('  ⚠ OMC not detected — mode features (ultrawork/ralph) will not be available.'));
      }
      break;
  }

  console.log();
}
