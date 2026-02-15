#!/usr/bin/env node

/**
 * OMCSA CLI - oh-my-claude-sub-agents
 *
 * Auto-detect custom Claude Code agents and add OMC-level orchestration.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load version from package.json
function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

const program = new Command();

program
  .name('omcsa')
  .description('Auto-detect custom Claude Code agents and add OMC-level orchestration')
  .version(getVersion());

program
  .command('init')
  .description('Initialize OMCSA: scan agents, generate orchestrator prompt, install hooks')
  .option('--config', 'Generate omcsa.config.json for fine-grained control')
  .option('--mode <mode>', 'Install mode: standalone | omc-only | integrated')
  .option('--maturity <mode>', 'Maturity mode: auto | full | LOW | MEDIUM | HIGH')
  .option('--dry-run', 'Preview changes without applying them')
  .action(async (options) => {
    const { runInit } = await import('./init.js');
    await runInit(options);
  });

program
  .command('apply')
  .description('Re-apply configuration changes (re-scan + regenerate prompt)')
  .option('--maturity <mode>', 'Maturity mode: auto | full | LOW | MEDIUM | HIGH')
  .option('--dry-run', 'Preview changes without applying them')
  .action(async (options) => {
    const { runApply } = await import('./apply.js');
    await runApply(options);
  });

program
  .command('status')
  .description('Show current OMCSA configuration status')
  .option('--logs', 'Show today\'s full orchestration log')
  .option('--clean-logs <days>', 'Remove logs older than N days')
  .action(async (options) => {
    const { runStatus } = await import('./status.js');
    await runStatus(options);
  });

program
  .command('refresh')
  .description('Re-scan .claude/agents/ and regenerate orchestrator prompt')
  .option('--maturity <mode>', 'Maturity mode: auto | full | LOW | MEDIUM | HIGH')
  .action(async (options) => {
    const { runRefresh } = await import('./refresh.js');
    await runRefresh(options);
  });

program
  .command('cancel')
  .description('Cancel any active modes (ralph, ultrawork)')
  .action(async () => {
    const { runCancel } = await import('./cancel.js');
    await runCancel();
  });

program
  .command('switch <mode>')
  .description('Switch install mode: standalone | omc-only | integrated')
  .action(async (mode) => {
    const { runSwitch } = await import('./switch.js');
    await runSwitch(mode);
  });

program
  .command('uninstall')
  .description('Remove all OMCSA components (hooks, prompts, state)')
  .action(async () => {
    const { runUninstall } = await import('./uninstall.js');
    await runUninstall();
  });

program
  .command('doctor')
  .description('Diagnose OMCSA installation and suggest fixes')
  .option('--fix', 'Auto-fix fixable issues')
  .action(async (options) => {
    const { runDoctor } = await import('./doctor.js');
    await runDoctor(options);
  });

const omcCmd = program
  .command('omc')
  .description('Manage oh-my-claudecode (OMC) plugin');

omcCmd
  .command('disable')
  .description('Disable OMC plugin (remove from ~/.claude/settings.json enabledPlugins)')
  .action(async () => {
    const { runOmcDisable } = await import('./omc.js');
    await runOmcDisable();
  });

omcCmd
  .command('enable')
  .description('Re-enable OMC plugin (restore from backup)')
  .action(async () => {
    const { runOmcEnable } = await import('./omc.js');
    await runOmcEnable();
  });

program.parse();
