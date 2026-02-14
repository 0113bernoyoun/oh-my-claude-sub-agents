/**
 * Settings Updater
 *
 * Updates Claude Code's settings.json to register OMCSA hooks.
 * Preserves existing settings and only adds/removes OMCSA entries.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Claude Code hook format (new matcher-based format):
 * {
 *   "hooks": {
 *     "EventName": [
 *       {
 *         "matcher": { ... },    // optional
 *         "hooks": [
 *           { "type": "command", "command": "..." }
 *         ]
 *       }
 *     ]
 *   }
 * }
 */

interface HookCommand {
  type: string;
  command: string;
}

interface HookGroup {
  matcher?: Record<string, unknown>;
  hooks?: HookCommand[];
  // Legacy flat format fields (pre-matcher era)
  type?: string;
  command?: string;
}

interface SettingsConfig {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

const OMCSA_HOOK_MARKER = 'omcsa-';

/**
 * Get the project settings.json path.
 */
function getSettingsPath(projectRoot: string): string {
  return join(projectRoot, '.claude', 'settings.json');
}

/**
 * Load existing settings or return empty object.
 */
function loadSettings(settingsPath: string): SettingsConfig {
  if (!existsSync(settingsPath)) return {};

  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8')) as SettingsConfig;
  } catch {
    return {};
  }
}

/**
 * Check if an entry contains an OMCSA command.
 * Handles both new format ({ hooks: [{ command }] }) and
 * legacy flat format ({ type, command }).
 */
function isOmcsaEntry(entry: HookGroup): boolean {
  // New format: { hooks: [{ type, command }] }
  if (entry.hooks?.some(h => h.command?.includes(OMCSA_HOOK_MARKER))) {
    return true;
  }
  // Legacy flat format: { type, command }
  if (entry.command?.includes(OMCSA_HOOK_MARKER)) {
    return true;
  }
  return false;
}

/**
 * Add OMCSA hooks to settings.json.
 * Uses the new Claude Code hook format with matcher + hooks nesting.
 */
export function addHooksToSettings(
  projectRoot: string,
  hookCommands: Record<string, string[]>,
): void {
  const settingsPath = getSettingsPath(projectRoot);
  const settings = loadSettings(settingsPath);

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const [event, commands] of Object.entries(hookCommands)) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Remove existing OMCSA hook groups for this event
    settings.hooks[event] = settings.hooks[event].filter(
      group => !isOmcsaEntry(group)
    );

    // Add new hook group (one group per command)
    for (const command of commands) {
      settings.hooks[event].push({
        hooks: [
          {
            type: 'command',
            command,
          },
        ],
      });
    }
  }

  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

/**
 * Remove all OMCSA hooks from settings.json.
 */
export function removeHooksFromSettings(projectRoot: string): void {
  const settingsPath = getSettingsPath(projectRoot);
  if (!existsSync(settingsPath)) return;

  const settings = loadSettings(settingsPath);
  if (!settings.hooks) return;

  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event].filter(
      group => !isOmcsaEntry(group)
    );

    // Remove empty event arrays
    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }

  // Remove empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}
