#!/usr/bin/env node

/**
 * OMCSA Persistent Mode Hook (Stop)
 *
 * Smart hook: reads .omcsa/mode.json to determine behavior.
 * - standalone: Check for active ralph/ultrawork state and inject continuation
 * - omc-only/integrated: Yield immediately (OMC handles persistence)
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Read install mode from .omcsa/mode.json
 * Returns 'standalone' if file not found (safe default).
 */
function readModeSync(projectRoot) {
  try {
    const modePath = join(projectRoot, '.omcsa', 'mode.json');
    if (existsSync(modePath)) {
      const data = JSON.parse(readFileSync(modePath, 'utf-8'));
      return data.mode || 'standalone';
    }
  } catch { /* fallback */ }
  return 'standalone';
}

async function main() {
  // Read stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const inputStr = Buffer.concat(chunks).toString('utf-8');

  let input;
  try {
    input = JSON.parse(inputStr);
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const projectRoot = input.directory || process.cwd();

  // ── Smart Hook: Mode Check ──
  const mode = readModeSync(projectRoot);
  if (mode !== 'standalone') {
    // OMC handles persistence in omc-only/integrated modes
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // ── Standalone Mode: Full persistence logic ──

  // Honor user-requested stops
  const userRequested = input.user_requested === true || input.userRequested === true;
  if (userRequested) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Don't continue on context limits
  const stopReason = input.stop_reason || input.stopReason || '';
  if (stopReason === 'context_limit') {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  let config = {};
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch { /* use defaults */ }
  }

  const stateDir = join(projectRoot, config.persistence?.stateDir || '.omcsa/state');
  const sessionId = input.sessionId || input.session_id || '';

  // Check ralph state first (higher priority)
  const ralphPath = join(stateDir, 'ralph-state.json');
  if (existsSync(ralphPath)) {
    try {
      const state = JSON.parse(readFileSync(ralphPath, 'utf-8'));

      if (state.active) {
        // Session isolation
        if (sessionId && state.sessionId && state.sessionId !== sessionId) {
          console.log(JSON.stringify({ continue: true }));
          return;
        }

        // Check max iterations
        if (state.iteration >= state.maxIterations) {
          unlinkSync(ralphPath);
          console.log(JSON.stringify({
            continue: true,
            message: `[RALPH LOOP STOPPED] Max iterations (${state.maxIterations}) reached.`,
          }));
          return;
        }

        // Increment and continue
        state.iteration += 1;
        writeFileSync(ralphPath, JSON.stringify(state, null, 2));

        console.log(JSON.stringify({
          continue: true,
          message: `[RALPH LOOP - ITERATION ${state.iteration}/${state.maxIterations}]

The task is NOT complete yet. Continue working.

IMPORTANT:
- Review your progress so far
- Continue from where you left off
- When FULLY complete, run \`omcsa cancel\` to exit
- Do not stop until the task is truly done

Original task:
${state.prompt}`,
        }));
        return;
      }
    } catch { /* fall through */ }
  }

  // Check ultrawork state
  const uwPath = join(stateDir, 'ultrawork-state.json');
  if (existsSync(uwPath)) {
    try {
      const state = JSON.parse(readFileSync(uwPath, 'utf-8'));

      if (state.active) {
        if (sessionId && state.sessionId && state.sessionId !== sessionId) {
          console.log(JSON.stringify({ continue: true }));
          return;
        }

        if (state.iteration >= state.maxIterations) {
          unlinkSync(uwPath);
          console.log(JSON.stringify({
            continue: true,
            message: `[ULTRAWORK STOPPED] Max iterations (${state.maxIterations}) reached.`,
          }));
          return;
        }

        state.iteration += 1;
        writeFileSync(uwPath, JSON.stringify(state, null, 2));

        console.log(JSON.stringify({
          continue: true,
          message: `[ULTRAWORK CONTINUATION - ITERATION ${state.iteration}/${state.maxIterations}]

Work is NOT complete. Continue executing remaining tasks in parallel.

IMPORTANT:
- Check which tasks are still pending
- Launch remaining tasks via Task tool (run_in_background=true)
- Verify all completed tasks
- Do not stop until ALL tasks are done

Original request:
${state.prompt}`,
        }));
        return;
      }
    } catch { /* fall through */ }
  }

  console.log(JSON.stringify({ continue: true }));
}

main().catch(err => {
  console.error('[omcsa-persistent-mode]', err);
  console.log(JSON.stringify({ continue: true }));
});
