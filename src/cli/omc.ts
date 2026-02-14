/**
 * OMC Disable/Enable Commands
 *
 * Manages the oh-my-claudecode plugin in ~/.claude/settings.json.
 * - disable: removes OMC entries from enabledPlugins, backs up to .omcsa/omc-backup.json
 * - enable:  restores OMC entries from backup
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const BACKUP_DIR = join(process.cwd(), '.omcsa');
const BACKUP_FILE = 'omc-backup.json';

function getBackupPath(): string {
  return join(BACKUP_DIR, BACKUP_FILE);
}

function readSettings(): Record<string, unknown> | null {
  if (!existsSync(SETTINGS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Disable OMC plugin by removing it from enabledPlugins in ~/.claude/settings.json.
 * Backs up removed entries to .omcsa/omc-backup.json for later restoration.
 */
export async function runOmcDisable(): Promise<void> {
  console.log(chalk.cyan('\n  🔧 Disabling OMC plugin...\n'));

  // Read settings
  const settings = readSettings();
  if (!settings) {
    console.log(chalk.red('  ✗ Could not read ~/.claude/settings.json'));
    process.exitCode = 1;
    return;
  }

  const plugins = settings.enabledPlugins;
  if (!Array.isArray(plugins)) {
    console.log(chalk.yellow('  ⚠ No enabledPlugins found in settings.json'));
    console.log(chalk.dim('  Nothing to disable.\n'));
    return;
  }

  // Filter OMC entries
  const omcEntries = plugins.filter((p: unknown) =>
    typeof p === 'string' && p.toLowerCase().includes('oh-my-claudecode')
  );
  const remainingEntries = plugins.filter((p: unknown) =>
    typeof p !== 'string' || !p.toLowerCase().includes('oh-my-claudecode')
  );

  if (omcEntries.length === 0) {
    console.log(chalk.yellow('  ⚠ No OMC entries found in enabledPlugins'));
    console.log(chalk.dim('  Nothing to disable.\n'));
    return;
  }

  // Backup removed entries
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const backup = {
    removedPlugins: omcEntries,
    removedAt: new Date().toISOString(),
    settingsPath: SETTINGS_PATH,
  };
  writeFileSync(getBackupPath(), JSON.stringify(backup, null, 2), 'utf-8');
  console.log(chalk.green(`  ✓ Backed up ${omcEntries.length} OMC plugin entry(s) → .omcsa/${BACKUP_FILE}`));

  // Update settings
  settings.enabledPlugins = remainingEntries;
  writeSettings(settings);
  console.log(chalk.green('  ✓ Removed OMC from ~/.claude/settings.json enabledPlugins'));

  console.log(chalk.yellow('\n  ⚠ This affects ALL projects and Claude Code sessions globally.'));
  console.log(chalk.dim(`  Run ${chalk.cyan('omcsa omc enable')} to restore OMC.\n`));
}

/**
 * Re-enable OMC plugin by restoring entries from .omcsa/omc-backup.json.
 */
export async function runOmcEnable(): Promise<void> {
  console.log(chalk.cyan('\n  🔧 Restoring OMC plugin...\n'));

  const backupPath = getBackupPath();

  // Read backup
  if (!existsSync(backupPath)) {
    console.log(chalk.yellow('  ⚠ No backup found at .omcsa/omc-backup.json'));
    console.log(chalk.dim('  OMC was not previously disabled via OMCSA, or backup was removed.\n'));
    return;
  }

  let backup: { removedPlugins: string[] };
  try {
    backup = JSON.parse(readFileSync(backupPath, 'utf-8'));
  } catch {
    console.log(chalk.red('  ✗ Could not parse .omcsa/omc-backup.json'));
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(backup.removedPlugins) || backup.removedPlugins.length === 0) {
    console.log(chalk.yellow('  ⚠ Backup is empty. Nothing to restore.\n'));
    return;
  }

  // Read settings
  const settings = readSettings();
  if (!settings) {
    console.log(chalk.red('  ✗ Could not read ~/.claude/settings.json'));
    process.exitCode = 1;
    return;
  }

  // Restore plugins
  const plugins: unknown[] = Array.isArray(settings.enabledPlugins) ? settings.enabledPlugins : [];
  const existingSet = new Set(plugins.map(p => typeof p === 'string' ? p : ''));

  let restored = 0;
  for (const entry of backup.removedPlugins) {
    if (!existingSet.has(entry)) {
      plugins.push(entry);
      restored++;
    }
  }

  settings.enabledPlugins = plugins;
  writeSettings(settings);
  console.log(chalk.green(`  ✓ Restored ${restored} OMC plugin entry(s) to ~/.claude/settings.json`));

  // Remove backup
  unlinkSync(backupPath);
  console.log(chalk.green('  ✓ Removed backup file .omcsa/omc-backup.json'));

  console.log(chalk.green('\n  ✅ OMC restored successfully!\n'));
}
