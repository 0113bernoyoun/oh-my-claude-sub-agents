#!/usr/bin/env node

/**
 * OMCSA Post-Tool-Use Logger (PostToolUse)
 *
 * Logs agent delegations (Task tool calls) to .omcsa/logs/{date}.jsonl
 * for orchestration visibility.
 *
 * Only captures Task tool invocations — all other tools are ignored.
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
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

  // Build log entry from tool input
  const toolInput = input.tool_input || input.toolInput || {};
  const entry = {
    agent: toolInput.subagent_type || 'unknown',
    model: toolInput.model || 'default',
    description: toolInput.description || '',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id || input.sessionId || 'unknown',
  };

  // Append to .omcsa/logs/{date}.jsonl
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

  console.log(JSON.stringify({ continue: true }));
}

main().catch(err => {
  console.error('[omcsa-post-tool-logger]', err);
  console.log(JSON.stringify({ continue: true }));
});
