/**
 * Init Command
 *
 * Scans for agents, generates orchestrator prompt, installs hooks.
 * Supports 3 modes: standalone, omc-only, integrated.
 *
 * Mode behavior:
 * - standalone: Full install (CLAUDE.md prompt + hooks + settings)
 * - omc-only:   Prompt only (CLAUDE.md prompt, hooks yield to OMC)
 * - integrated:  Prompt only (CLAUDE.md prompt, hooks yield to OMC)
 *
 * Hooks are ALWAYS installed (mode-agnostic). Smart hooks read
 * .omcsa/mode.json at runtime and yield when mode !== 'standalone'.
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { scanAgents } from '../core/scanner.js';
import { generateOrchestratorPrompt, updateClaudeMdContent } from '../core/prompt-generator.js';
import { loadConfig, generateConfig, writeConfig } from '../core/config-loader.js';
import { installHooks, getHookCommands } from '../installer/hooks-installer.js';
import { addHooksToSettings } from '../installer/settings-updater.js';
import { detectOmc, resolveInstallMode, saveMode, isValidMode } from '../core/omc-detector.js';
import type { OmcsaConfig, InstallMode } from '../core/types.js';

interface InitOptions {
  config?: boolean;
  mode?: string;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // Step 1: Scan for agents
  console.log(chalk.cyan('\n  🔍 Scanning .claude/agents/...\n'));

  const agents = scanAgents(projectRoot);

  if (agents.length === 0) {
    console.log(chalk.yellow('  ⚠ No agents found in .claude/agents/ or ~/.claude/agents/'));
    console.log(chalk.dim('  Create .md files with YAML frontmatter in .claude/agents/ to get started.\n'));
    console.log(chalk.dim('  Example .claude/agents/my-agent.md:'));
    console.log(chalk.dim('  ---'));
    console.log(chalk.dim('  description: My custom agent'));
    console.log(chalk.dim('  model: sonnet'));
    console.log(chalk.dim('  ---'));
    console.log(chalk.dim('  Agent instructions here...\n'));
    return;
  }

  console.log(chalk.green(`  ✓ Found ${agents.length} agent${agents.length > 1 ? 's' : ''}:`));
  for (const agent of agents) {
    const modelStr = agent.model ? chalk.dim(`(${agent.model})`) : chalk.dim('(default)');
    const scopeStr = agent.scope === 'global' ? chalk.dim('[global]') : '';
    console.log(`    - ${chalk.bold(agent.name)} ${modelStr} ${scopeStr}— ${agent.description}`);
  }
  console.log();

  // Step 2: Detect OMC
  console.log(chalk.cyan('  🔎 Checking for OMC (oh-my-claudecode)...'));

  const omcResult = detectOmc();
  if (omcResult.found) {
    console.log(chalk.blue(`  ℹ OMC detected (${omcResult.method})`));
  } else {
    console.log(chalk.dim('  OMC: not detected'));
  }

  // Step 3: Resolve install mode
  let explicitMode: InstallMode | undefined;
  if (options.mode) {
    if (!isValidMode(options.mode)) {
      console.log(chalk.red(`\n  ✗ Invalid mode: "${options.mode}"`));
      console.log(chalk.dim('  Valid modes: standalone | omc-only | integrated\n'));
      process.exitCode = 1;
      return;
    }
    explicitMode = options.mode;
  }

  const { mode, advisory } = resolveInstallMode(explicitMode, omcResult);

  if (advisory) {
    console.log(chalk.yellow(`  ⚠ ${advisory}`));
  }

  console.log(chalk.cyan(`  → Mode: ${chalk.bold(mode)}`));
  console.log();

  // Step 4: Load or generate config
  let config: OmcsaConfig;
  if (options.config) {
    config = generateConfig(agents);
    const configDir = join(projectRoot, '.claude');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeConfig(projectRoot, config);
    console.log(chalk.green('  ✓ Generated config → .claude/omcsa.config.json'));
  } else {
    config = loadConfig(projectRoot);
  }

  // Step 5: Generate orchestrator prompt
  const prompt = generateOrchestratorPrompt(agents, config, omcResult.found && mode === 'standalone');

  // Step 6: Update CLAUDE.md
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  let existingContent = '';

  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  } else {
    const claudeDir = join(projectRoot, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }
  }

  const updatedContent = updateClaudeMdContent(existingContent, prompt);
  writeFileSync(claudeMdPath, updatedContent, 'utf-8');
  console.log(chalk.green('  📝 Generated orchestrator prompt → .claude/CLAUDE.md'));

  // Step 7: Install hooks (ALWAYS — smart hooks handle mode at runtime)
  const { installed, skipped } = installHooks(projectRoot);

  if (installed.length > 0) {
    console.log(chalk.green('  🔗 Installed smart hooks:'));
    const hookDescriptions: Record<string, string> = {
      'keyword-detector.mjs': 'keyword-detector (UserPromptSubmit)',
      'persistent-mode.mjs': 'persistent-mode (Stop)',
      'pre-tool-use.mjs': 'delegation-enforcer (PreToolUse)',
    };
    for (const name of installed) {
      console.log(`    - ${hookDescriptions[name] || name}`);
    }
  }

  if (skipped.length > 0) {
    console.log(chalk.yellow(`  ⚠ Skipped ${skipped.length} hook(s) (template not found)`));
  }

  // Step 8: Register hooks in settings.json (ALWAYS)
  const hookCommands = getHookCommands(projectRoot);
  addHooksToSettings(projectRoot, hookCommands);
  console.log(chalk.green('  ⚙ Updated .claude/settings.json'));

  // Step 9: Save mode to .omcsa/mode.json
  saveMode(projectRoot, mode, omcResult);
  console.log(chalk.green('  💾 Saved mode → .omcsa/mode.json'));

  // Summary
  console.log(chalk.green('\n  ✅ Setup complete!'));

  if (mode === 'standalone') {
    console.log(chalk.dim('\n  OMCSA handles all orchestration. Try these in Claude Code:\n'));
    console.log(chalk.dim('    - "ultrawork: implement this feature" → Parallel execution mode'));
    console.log(chalk.dim('    - "ralph: complete this task"         → Persistent loop mode'));
    console.log(chalk.dim('    - Normal prompts                      → Auto delegation enforcement'));
  } else {
    console.log(chalk.dim(`\n  Mode: ${mode} — OMC handles ultrawork/ralph, OMCSA provides agent orchestration.`));
    console.log(chalk.dim('  OMCSA hooks installed but yield to OMC at runtime.'));
    console.log(chalk.dim('  Switch modes anytime: omcsa switch standalone'));
  }

  console.log();
}
