#!/usr/bin/env node

/**
 * OMCSA Keyword Detector Hook (UserPromptSubmit)
 *
 * Smart hook: reads .omcsa/mode.json to determine behavior.
 * - standalone: Full keyword detection (ultrawork/ralph/cancel)
 * - omc-only/integrated: Yield immediately (OMC handles keywords)
 */

import { readFileSync, existsSync, readdirSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
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
    // OMC handles keyword detection in omc-only/integrated modes
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // ── Standalone Mode: Full keyword detection ──
  const prompt = input.prompt || input.message?.content || '';
  if (!prompt) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Load config
  let config = {};
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch { /* use defaults */ }
  }

  // Load agents list for ultrawork message
  let agentsList = '';
  const agentsDir = join(projectRoot, '.claude', 'agents');
  if (existsSync(agentsDir)) {
    try {
      const files = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      agentsList = files.map(f => `- ${f.replace('.md', '')}`).join('\n');
    } catch { /* ignore */ }
  }

  // Keyword detection
  const keywords = config.keywords || {};
  const ultraworkKw = keywords.ultrawork || ['ultrawork', 'ulw'];
  const ralphKw = keywords.ralph || ['ralph', 'must complete', 'until done'];
  const cancelKw = keywords.cancel || ['cancelomcsa', 'stopomcsa'];

  // Remove code blocks
  let cleaned = prompt.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/~~~[\s\S]*?~~~/g, '');
  cleaned = cleaned.replace(/`[^`]+`/g, '');

  function matchesAny(text, keywords) {
    for (const kw of keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return true;
    }
    return false;
  }

  // Cancel check
  if (matchesAny(cleaned, cancelKw)) {
    // Clear state files
    const stateDir = join(projectRoot, config.persistence?.stateDir || '.omcsa/state');
    for (const modeName of ['ralph', 'ultrawork']) {
      const statePath = join(stateDir, `${modeName}-state.json`);
      if (existsSync(statePath)) {
        try { unlinkSync(statePath); } catch { /* ignore */ }
      }
    }
    console.log(JSON.stringify({
      continue: true,
      message: '[OMCSA] All active modes cancelled.',
    }));
    return;
  }

  const sessionId = input.sessionId || input.session_id || 'cli-session';
  const maxIterations = config.persistence?.maxIterations || 10;
  const stateDir = join(projectRoot, config.persistence?.stateDir || '.omcsa/state');

  // Ralph check
  if (matchesAny(cleaned, ralphKw)) {
    // Activate ralph state
    const state = {
      active: true,
      mode: 'ralph',
      iteration: 1,
      maxIterations,
      prompt: prompt,
      sessionId,
      startedAt: new Date().toISOString(),
    };
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, 'ralph-state.json'), JSON.stringify(state, null, 2));

    // Also activate ultrawork
    const uwState = { ...state, mode: 'ultrawork' };
    writeFileSync(join(stateDir, 'ultrawork-state.json'), JSON.stringify(uwState, null, 2));

    console.log(JSON.stringify({
      continue: true,
      message: `[RALPH MODE ACTIVATED]

Work continuously until ALL requirements are fully met.

Rules:
1. Break the task into subtasks
2. Delegate each subtask to the appropriate agent via Task tool
3. Use run_in_background=true for independent tasks
4. After each agent completes, verify the result
5. Do NOT stop until everything is done and verified
6. Run \`omcsa cancel\` when truly complete

${agentsList ? `Available agents:\n${agentsList}` : ''}

Original request:
${prompt}`,
    }));
    return;
  }

  // Ultrawork check
  if (matchesAny(cleaned, ultraworkKw)) {
    // Activate ultrawork state
    const state = {
      active: true,
      mode: 'ultrawork',
      iteration: 1,
      maxIterations,
      prompt: prompt,
      sessionId,
      startedAt: new Date().toISOString(),
    };
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, 'ultrawork-state.json'), JSON.stringify(state, null, 2));

    console.log(JSON.stringify({
      continue: true,
      message: `[ULTRAWORK MODE ACTIVATED] Parallel execution mode enabled.

Rules:
1. Identify independent tasks from the request
2. Delegate each task to the appropriate agent via Task tool
3. Launch independent tasks simultaneously (run_in_background=true)
4. Set the model parameter based on each agent's tier
5. Verify ALL tasks completed with build/test evidence
6. Do NOT declare done until everything is verified

${agentsList ? `Available agents:\n${agentsList}` : ''}

Original request:
${prompt}`,
    }));
    return;
  }

  // No keyword detected
  console.log(JSON.stringify({ continue: true }));
}

main().catch(err => {
  console.error('[omcsa-keyword-detector]', err);
  console.log(JSON.stringify({ continue: true }));
});
