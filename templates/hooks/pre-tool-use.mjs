#!/usr/bin/env node

/**
 * OMCSA Pre-Tool-Use Hook (PreToolUse)
 *
 * Smart hook: reads .omcsa/mode.json to determine behavior.
 * - standalone: Enforce delegation (warn/block direct source code modifications)
 * - omc-only/integrated: Yield immediately (OMC handles delegation)
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';

const WRITE_EDIT_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.swift',
  '.vue', '.svelte', '.astro',
];

const ALLOWED_PATH_PATTERNS = [
  /^\.omcsa\//,
  /^\.claude\//,
  /^\.omc\//,
  /^claudedocs\//,
  /\.md$/,
  /\.json$/,
  /\.ya?ml$/,
  /\.toml$/,
  /\.lock$/,
];

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
    // OMC handles delegation in omc-only/integrated modes
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // ── Standalone Mode: Full delegation enforcement ──

  const toolName = input.toolName || input.tool_name || '';

  // Only check write/edit tools
  if (!WRITE_EDIT_TOOLS.includes(toolName)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Load config
  let config = {};
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch { /* defaults */ }
  }

  const level = config.features?.delegationEnforcement || 'warn';
  if (level === 'off') {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Extract file path
  const toolInput = input.toolInput || input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.notebook_path || '';
  if (!filePath) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Make relative for pattern matching
  let relativePath = filePath;
  if (filePath.startsWith(projectRoot)) {
    relativePath = filePath.slice(projectRoot.length).replace(/^\//, '');
  }

  // Check if allowed path
  if (ALLOWED_PATH_PATTERNS.some(p => p.test(relativePath))) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Check if source file
  const ext = extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.includes(ext)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Suggest an agent
  let suggestion = 'Consider delegating this to an appropriate sub-agent via Task tool.';
  const agentsDir = join(projectRoot, '.claude', 'agents');
  if (existsSync(agentsDir)) {
    try {
      const agents = readdirSync(agentsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      if (agents.length > 0) {
        suggestion = `Consider delegating this to one of your agents: ${agents.join(', ')}`;
      }
    } catch { /* ignore */ }
  }

  if (level === 'strict') {
    console.log(JSON.stringify({
      continue: false,
      reason: `[OMCSA] Delegation enforced: Direct source code modification blocked for ${relativePath}.\n${suggestion}`,
    }));
    return;
  }

  // warn mode
  console.log(JSON.stringify({
    continue: true,
    message: `[OMCSA] Delegation reminder: You are directly modifying source code (${relativePath}).\n${suggestion}\nAs an orchestrator, prefer delegating implementation work to specialized agents.`,
  }));
}

main().catch(err => {
  console.error('[omcsa-pre-tool-use]', err);
  console.log(JSON.stringify({ continue: true }));
});
