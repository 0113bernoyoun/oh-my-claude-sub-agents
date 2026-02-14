/**
 * Persistent Mode Handler
 *
 * Manages the Stop hook for ralph and ultrawork modes.
 * When active, injects continuation prompts to keep Claude working.
 */

import { HookInput, HookOutput, PersistentState } from '../core/types.js';
import { readState, incrementIteration, clearState } from './state.js';

/**
 * Check if the stop was user-requested (should always honor).
 */
function isUserAbort(input: HookInput): boolean {
  return input.user_requested === true || input.userRequested === true;
}

/**
 * Check if stopped due to context limit.
 */
function isContextLimit(input: HookInput): boolean {
  const reason = input.stop_reason || input.stopReason || '';
  return reason === 'context_limit';
}

/**
 * Generate the continuation prompt for ralph mode.
 */
function getRalphContinuation(state: PersistentState): string {
  return `[RALPH LOOP - ITERATION ${state.iteration}/${state.maxIterations}]

The task is NOT complete yet. Continue working.

IMPORTANT:
- Review your progress so far
- Continue from where you left off
- When FULLY complete, run \`omcsa cancel\` to exit
- Do not stop until the task is truly done

Original task:
${state.prompt}`;
}

/**
 * Generate the continuation prompt for ultrawork mode.
 */
function getUltraworkContinuation(state: PersistentState): string {
  return `[ULTRAWORK CONTINUATION - ITERATION ${state.iteration}/${state.maxIterations}]

Work is NOT complete. Continue executing remaining tasks in parallel.

IMPORTANT:
- Check which tasks are still pending
- Launch remaining tasks via Task tool (run_in_background=true)
- Verify all completed tasks
- Do not stop until ALL tasks are done

Original request:
${state.prompt}`;
}

/**
 * Process the Stop hook for persistent modes.
 * Called when Claude stops (session.idle event).
 */
export function checkPersistentMode(
  input: HookInput,
  projectRoot: string,
  stateDir?: string,
): HookOutput {
  // Always allow user-requested stops
  if (isUserAbort(input)) {
    return { continue: true };
  }

  // Don't continue on context limits
  if (isContextLimit(input)) {
    return { continue: true };
  }

  // Check ralph state first (higher priority)
  const ralphState = readState(projectRoot, 'ralph', stateDir);
  if (ralphState?.active) {
    // Verify session match
    if (input.sessionId && ralphState.sessionId !== input.sessionId) {
      return { continue: true };
    }

    // Check max iterations
    if (ralphState.iteration >= ralphState.maxIterations) {
      clearState(projectRoot, 'ralph', stateDir);
      return {
        continue: true,
        message: `[RALPH LOOP STOPPED] Max iterations (${ralphState.maxIterations}) reached.`,
      };
    }

    // Increment and continue
    const updated = incrementIteration(projectRoot, 'ralph', stateDir);
    if (!updated) return { continue: true };

    return {
      continue: true,
      message: getRalphContinuation(updated),
    };
  }

  // Check ultrawork state
  const uwState = readState(projectRoot, 'ultrawork', stateDir);
  if (uwState?.active) {
    if (input.sessionId && uwState.sessionId !== input.sessionId) {
      return { continue: true };
    }

    if (uwState.iteration >= uwState.maxIterations) {
      clearState(projectRoot, 'ultrawork', stateDir);
      return {
        continue: true,
        message: `[ULTRAWORK STOPPED] Max iterations (${uwState.maxIterations}) reached.`,
      };
    }

    const updated = incrementIteration(projectRoot, 'ultrawork', stateDir);
    if (!updated) return { continue: true };

    return {
      continue: true,
      message: getUltraworkContinuation(updated),
    };
  }

  return { continue: true };
}
