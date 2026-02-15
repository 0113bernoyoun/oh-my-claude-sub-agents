/**
 * Hooks Installer
 *
 * Installs OMCSA hook scripts into the project's .claude/hooks/ directory
 * and updates settings.json to register them.
 */

import { copyFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Hook definitions with their event types */
const HOOKS = [
  {
    name: 'keyword-detector.mjs',
    event: 'UserPromptSubmit',
    description: 'OMCSA keyword detector (ultrawork, ralph, cancel)',
  },
  {
    name: 'persistent-mode.mjs',
    event: 'Stop',
    description: 'OMCSA persistent mode (ralph/ultrawork continuation)',
  },
  {
    name: 'pre-tool-use.mjs',
    event: 'PreToolUse',
    description: 'OMCSA delegation enforcement',
  },
  {
    name: 'post-tool-logger.mjs',
    event: 'PostToolUse',
    description: 'OMCSA agent delegation logger',
  },
];

/**
 * Get the templates directory (relative to package root).
 */
function getTemplatesDir(): string {
  // From dist/installer/ or src/installer/, go up two levels to package root
  return join(__dirname, '..', '..', 'templates', 'hooks');
}

/**
 * Get the project hooks directory.
 */
function getProjectHooksDir(projectRoot: string): string {
  return join(projectRoot, '.claude', 'hooks');
}

/**
 * Install hook scripts into the project.
 */
export function installHooks(projectRoot: string): { installed: string[]; skipped: string[] } {
  const templatesDir = getTemplatesDir();
  const hooksDir = getProjectHooksDir(projectRoot);

  const installed: string[] = [];
  const skipped: string[] = [];

  // Ensure hooks directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  for (const hook of HOOKS) {
    const srcPath = join(templatesDir, hook.name);
    const destPath = join(hooksDir, `omcsa-${hook.name}`);

    if (!existsSync(srcPath)) {
      skipped.push(hook.name);
      continue;
    }

    copyFileSync(srcPath, destPath);
    installed.push(hook.name);
  }

  return { installed, skipped };
}

/**
 * Uninstall hook scripts from the project.
 */
export function uninstallHooks(projectRoot: string): string[] {
  const hooksDir = getProjectHooksDir(projectRoot);
  const removed: string[] = [];

  if (!existsSync(hooksDir)) return removed;

  try {
    const files = readdirSync(hooksDir);
    for (const file of files) {
      if (file.startsWith('omcsa-') && file.endsWith('.mjs')) {
        const filePath = join(hooksDir, file);
        unlinkSync(filePath);
        removed.push(file);
      }
    }
  } catch {
    // Ignore
  }

  return removed;
}

/**
 * Get the hook command strings for settings.json.
 */
export function getHookCommands(projectRoot: string): Record<string, string[]> {
  const hooksDir = getProjectHooksDir(projectRoot);

  const commands: Record<string, string[]> = {};

  for (const hook of HOOKS) {
    const hookPath = join(hooksDir, `omcsa-${hook.name}`);
    if (!commands[hook.event]) {
      commands[hook.event] = [];
    }
    commands[hook.event].push(`node "${hookPath}"`);
  }

  return commands;
}

export { HOOKS };
