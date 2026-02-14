/**
 * OMC (oh-my-claudecode) Detection & Mode Management
 *
 * Detects whether OMC is installed globally and manages
 * the OMCSA install mode (standalone | omc-only | integrated).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { InstallMode } from './types.js';

// ─── OMC Detection ──────────────────────────────────────────────────────────

export interface OmcDetectionResult {
  found: boolean;
  method: 'plugin' | 'hooks' | 'settings' | null;
  details: string;
}

/**
 * Detect whether OMC (oh-my-claudecode) is installed globally.
 *
 * Detection order:
 * 1. ~/.claude/settings.json → enabledPlugins contains "oh-my-claudecode"
 * 2. ~/.claude/hooks/ → OMC hook files exist
 * 3. ~/.claude/settings.json → hooks contain OMC-related commands
 */
export function detectOmc(): OmcDetectionResult {
  const home = homedir();

  // 1. Check enabledPlugins in global settings
  const globalSettingsPath = join(home, '.claude', 'settings.json');
  if (existsSync(globalSettingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(globalSettingsPath, 'utf-8'));
      const plugins = settings.enabledPlugins || [];
      if (Array.isArray(plugins) && plugins.some((p: string) =>
        typeof p === 'string' && p.toLowerCase().includes('oh-my-claudecode')
      )) {
        return {
          found: true,
          method: 'plugin',
          details: 'Found oh-my-claudecode in enabledPlugins',
        };
      }
    } catch { /* continue checking */ }
  }

  // 2. Check for OMC hook files in global hooks directory
  const globalHooksDir = join(home, '.claude', 'hooks');
  if (existsSync(globalHooksDir)) {
    try {
      const files: string[] = readdirSync(globalHooksDir);
      const omcHooks = files.filter((f: string) =>
        f.includes('omc') && !f.includes('omcsa')
      );
      if (omcHooks.length > 0) {
        return {
          found: true,
          method: 'hooks',
          details: `Found OMC hooks: ${omcHooks.join(', ')}`,
        };
      }
    } catch { /* continue checking */ }
  }

  // 3. Check global settings for OMC hook commands
  if (existsSync(globalSettingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(globalSettingsPath, 'utf-8'));
      const settingsStr = JSON.stringify(settings);
      if (
        settingsStr.includes('oh-my-claudecode') ||
        (settingsStr.includes('omc') && !settingsStr.includes('omcsa'))
      ) {
        return {
          found: true,
          method: 'settings',
          details: 'Found OMC references in settings.json hooks',
        };
      }
    } catch { /* not found */ }
  }

  return {
    found: false,
    method: null,
    details: 'OMC not detected',
  };
}

// ─── Mode Resolution ────────────────────────────────────────────────────────

/**
 * Resolve the install mode based on explicit user choice and OMC detection.
 *
 * 1. If user specified --mode explicitly → use that
 * 2. If not specified → default to 'standalone'
 * 3. If OMC detected → print advisory message
 */
export function resolveInstallMode(
  explicitMode: InstallMode | undefined,
  omcResult: OmcDetectionResult,
): { mode: InstallMode; advisory: string | null } {
  if (explicitMode) {
    // User explicitly chose a mode
    if (omcResult.found && explicitMode === 'standalone') {
      return {
        mode: explicitMode,
        advisory: 'OMC detected but standalone mode requested. OMCSA hooks will be active alongside OMC.',
      };
    }
    return { mode: explicitMode, advisory: null };
  }

  // No explicit mode → default standalone, but advise if OMC found
  if (omcResult.found) {
    return {
      mode: 'standalone',
      advisory: `OMC detected (${omcResult.method}). Tip: use --mode integrated for coexistence.`,
    };
  }

  return { mode: 'standalone', advisory: null };
}

// ─── Mode Persistence ───────────────────────────────────────────────────────

export interface ModeConfig {
  mode: InstallMode;
  detectedOmc: boolean;
  omcMethod: string | null;
  updatedAt: string;
}

const MODE_FILE = 'mode.json';

function getModeDir(projectRoot: string): string {
  return join(projectRoot, '.omcsa');
}

function getModePath(projectRoot: string): string {
  return join(getModeDir(projectRoot), MODE_FILE);
}

/**
 * Save current install mode to .omcsa/mode.json
 */
export function saveMode(projectRoot: string, mode: InstallMode, omcResult: OmcDetectionResult): void {
  const dir = getModeDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const modeConfig: ModeConfig = {
    mode,
    detectedOmc: omcResult.found,
    omcMethod: omcResult.method,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(getModePath(projectRoot), JSON.stringify(modeConfig, null, 2), 'utf-8');
}

/**
 * Load current install mode from .omcsa/mode.json
 * Returns null if not found.
 */
export function loadMode(projectRoot: string): ModeConfig | null {
  const modePath = getModePath(projectRoot);
  if (!existsSync(modePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(modePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Validate that a string is a valid InstallMode.
 */
export function isValidMode(mode: string): mode is InstallMode {
  return mode === 'standalone' || mode === 'omc-only' || mode === 'integrated';
}
