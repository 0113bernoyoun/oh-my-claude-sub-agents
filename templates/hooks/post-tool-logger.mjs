#!/usr/bin/env node

/**
 * OMCSA Post-Tool-Use Logger (PostToolUse)
 *
 * Logs agent delegations (Task tool calls) to .omcsa/logs/{date}.jsonl
 * for orchestration visibility.
 *
 * Also tracks workflow pipeline progress and injects guidance messages.
 *
 * Only captures Task tool invocations — all other tools are ignored.
 */

import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

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

  // Only log Task tool calls
  const toolName = input.tool_name || input.toolName || '';
  if (toolName !== 'Task') {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const projectRoot = input.directory || process.cwd();
  const sessionId = input.session_id || input.sessionId || 'unknown';

  // Build log entry from tool input
  const toolInput = input.tool_input || input.toolInput || {};
  const entry = {
    agent: toolInput.subagent_type || 'unknown',
    model: toolInput.model || 'default',
    description: toolInput.description || '',
    timestamp: new Date().toISOString(),
    sessionId,
  };

  // Step 1: Append to .omcsa/logs/{date}.jsonl
  try {
    const logDir = join(projectRoot, '.omcsa', 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const logFile = join(logDir, `${dateStr}.jsonl`);
    appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch {
    // Logging should never block tool execution
  }

  // Step 2: Workflow tracking
  let message = undefined;

  // Load config
  let config = {};
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
  }

  const workflows = config.workflows;
  if (!workflows || Object.keys(workflows).length === 0) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Load workflow state
  const stateDir = join(projectRoot, config.persistence?.stateDir || '.omcsa/state');
  const wfStatePath = join(stateDir, 'workflow-state.json');
  let wfState = null;
  if (existsSync(wfStatePath)) {
    try { wfState = JSON.parse(readFileSync(wfStatePath, 'utf-8')); } catch {}
  }

  const agentName = toolInput.subagent_type || toolInput.subagentType || '';

  if (wfState && wfState.active) {
    // Active workflow: check if agent matches expected next step
    const expectedStep = wfState.steps[wfState.currentStepIndex];
    if (agentName === expectedStep) {
      wfState.completedSteps.push(agentName);
      wfState.currentStepIndex += 1;
      wfState.lastUpdatedAt = new Date().toISOString();

      if (wfState.currentStepIndex >= wfState.steps.length) {
        // Workflow complete
        message = `[WORKFLOW: ${wfState.workflowName}] All ${wfState.steps.length} steps complete! Pipeline: ${wfState.completedSteps.join(' \u2192 ')}`;
        try { unlinkSync(wfStatePath); } catch {}
      } else {
        const nextStep = wfState.steps[wfState.currentStepIndex];
        message = `[WORKFLOW: ${wfState.workflowName}] Step ${wfState.currentStepIndex}/${wfState.steps.length} complete (${agentName}). Next: delegate to ${nextStep}`;
        writeFileSync(wfStatePath, JSON.stringify(wfState, null, 2) + '\n');
      }
    }
  } else {
    // No active workflow: check if agent matches first step of any workflow
    for (const [name, wf] of Object.entries(workflows)) {
      if (wf.steps && wf.steps[0] === agentName) {
        const newState = {
          active: true,
          workflowName: name,
          steps: wf.steps,
          currentStepIndex: 1,
          completedSteps: [agentName],
          sessionId,
          startedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        };
        mkdirSync(stateDir, { recursive: true });
        writeFileSync(wfStatePath, JSON.stringify(newState, null, 2) + '\n');

        if (wf.steps.length > 1) {
          message = `[WORKFLOW: ${name}] Pipeline started! Step 1/${wf.steps.length} complete (${agentName}). Next: delegate to ${wf.steps[1]}`;
        }
        break;
      }
    }
  }

  const output = { continue: true };
  if (message) output.message = message;
  console.log(JSON.stringify(output));
}

main().catch(err => {
  console.error('[omcsa-post-tool-logger]', err);
  console.log(JSON.stringify({ continue: true }));
});
