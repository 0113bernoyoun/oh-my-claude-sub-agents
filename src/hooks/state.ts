/**
 * State File Management
 *
 * Manages persistent state files for modes like Ralph and Ultrawork.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { PersistentState } from '../core/types.js';

/**
 * Get the state directory path.
 */
export function getStateDir(projectRoot: string, stateDir?: string): string {
  return join(projectRoot, stateDir || '.omcsa/state');
}

/**
 * Get the state file path for a specific mode.
 */
function getStatePath(projectRoot: string, mode: string, stateDir?: string): string {
  return join(getStateDir(projectRoot, stateDir), `${mode}-state.json`);
}

/**
 * Read persistent state for a mode.
 */
export function readState(projectRoot: string, mode: string, stateDir?: string): PersistentState | null {
  const path = getStatePath(projectRoot, mode, stateDir);

  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as PersistentState;
  } catch {
    return null;
  }
}

/**
 * Write persistent state for a mode.
 */
export function writeState(projectRoot: string, state: PersistentState, stateDir?: string): void {
  const path = getStatePath(projectRoot, state.mode, stateDir);
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/**
 * Clear (delete) state for a mode.
 */
export function clearState(projectRoot: string, mode: string, stateDir?: string): void {
  const path = getStatePath(projectRoot, mode, stateDir);

  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // Ignore
    }
  }
}

/**
 * Clear all OMCSA state files.
 */
export function clearAllState(projectRoot: string, stateDir?: string): void {
  clearState(projectRoot, 'ralph', stateDir);
  clearState(projectRoot, 'ultrawork', stateDir);
}

/**
 * Create initial state for a mode.
 */
export function createState(
  mode: 'ralph' | 'ultrawork',
  prompt: string,
  sessionId: string,
  maxIterations: number = 10,
): PersistentState {
  return {
    active: true,
    mode,
    iteration: 1,
    maxIterations,
    prompt,
    sessionId,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Increment iteration count and return updated state.
 */
export function incrementIteration(projectRoot: string, mode: string, stateDir?: string): PersistentState | null {
  const state = readState(projectRoot, mode, stateDir);
  if (!state || !state.active) return null;

  state.iteration += 1;
  writeState(projectRoot, state, stateDir);
  return state;
}
