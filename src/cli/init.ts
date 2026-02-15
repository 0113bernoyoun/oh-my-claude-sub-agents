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
import { generateOrchestratorPrompt, updateClaudeMdContent, removeOmcsaSection } from '../core/prompt-generator.js';
import { loadConfig, generateConfig, writeConfig } from '../core/config-loader.js';
import { installHooks, getHookCommands } from '../installer/hooks-installer.js';
import { addHooksToSettings } from '../installer/settings-updater.js';
import { detectOmc, resolveInstallMode, saveMode, isValidMode } from '../core/omc-detector.js';
import { analyzeMaturity, resolveMaturityLevel } from '../core/maturity-analyzer.js';
import { scanOmcAgents } from '../core/omc-agent-scanner.js';
import { DryRunCollector, displayDryRunReport } from '../core/dry-run.js';
import type { OmcsaConfig, InstallMode, PromptOptions } from '../core/types.js';

interface InitOptions {
  config?: boolean;
  mode?: string;
  maturity?: string;
  dryRun?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // Step 1: Scan for agents
  console.log(chalk.cyan('\n  Scanning .claude/agents/...\n'));

  const agents = scanAgents(projectRoot);

  if (agents.length === 0) {
    console.log(chalk.yellow('  No agents found in .claude/agents/ or ~/.claude/agents/'));
    console.log(chalk.dim('  Create .md files with YAML frontmatter in .claude/agents/ to get started.\n'));
    console.log(chalk.dim('  Example .claude/agents/my-agent.md:'));
    console.log(chalk.dim('  ---'));
    console.log(chalk.dim('  description: My custom agent'));
    console.log(chalk.dim('  model: sonnet'));
    console.log(chalk.dim('  ---'));
    console.log(chalk.dim('  Agent instructions here...\n'));
    return;
  }

  console.log(chalk.green(`  Found ${agents.length} agent${agents.length > 1 ? 's' : ''}:`));
  for (const agent of agents) {
    const modelStr = agent.model ? chalk.dim(`(${agent.model})`) : chalk.dim('(default)');
    const scopeStr = agent.scope === 'global' ? chalk.dim('[global]') : '';
    console.log(`    - ${chalk.bold(agent.name)} ${modelStr} ${scopeStr}— ${agent.description}`);
  }
  console.log();

  // Step 2: Detect OMC
  console.log(chalk.cyan('  Checking for OMC (oh-my-claudecode)...'));

  const omcResult = detectOmc();
  if (omcResult.found) {
    console.log(chalk.blue(`  OMC detected (${omcResult.method})`));
  } else {
    console.log(chalk.dim('  OMC: not detected'));
  }

  // Step 3: Resolve install mode
  let explicitMode: InstallMode | undefined;
  if (options.mode) {
    if (!isValidMode(options.mode)) {
      console.log(chalk.red(`\n  Invalid mode: "${options.mode}"`));
      console.log(chalk.dim('  Valid modes: standalone | omc-only | integrated\n'));
      process.exitCode = 1;
      return;
    }
    explicitMode = options.mode;
  }

  const { mode, advisory } = resolveInstallMode(explicitMode, omcResult);

  if (advisory) {
    console.log(chalk.yellow(`  ${advisory}`));
  }

  console.log(chalk.cyan(`  Mode: ${chalk.bold(mode)}`));
  console.log();

  // Step 4: Load or generate config
  let config: OmcsaConfig;
  if (options.config) {
    config = generateConfig(agents);
  } else {
    config = loadConfig(projectRoot);
  }

  // Step 5: Read existing CLAUDE.md for maturity analysis (BEFORE prompt generation)
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  let existingContent = '';

  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  }

  // Step 6: Maturity analysis (on content WITHOUT OMCSA section)
  const cleanedContent = removeOmcsaSection(existingContent);
  const maturityResult = analyzeMaturity(cleanedContent, agents);
  const effectiveMaturity = resolveMaturityLevel(options.maturity, config.maturity?.mode, maturityResult);

  // Log maturity info
  const isAdaptive = options.maturity === 'auto' || config.maturity?.mode === 'auto';
  console.log(
    chalk.dim(`  Maturity: ${maturityResult.level} (${maturityResult.compositeScore.toFixed(2)})`) +
    (isAdaptive
      ? chalk.cyan(` — Adaptive prompt (${effectiveMaturity})`)
      : chalk.dim(` — Full prompt generated (default). Use --maturity auto for adaptive prompts.`))
  );

  // Step 7: Scan OMC agents for integrated mode
  let omcAgents;
  if (mode === 'integrated') {
    const omcScan = scanOmcAgents(projectRoot);
    omcAgents = omcScan.agents;
    if (omcScan.source === 'fallback') {
      console.log(chalk.dim(`  OMC agents: ${omcAgents.length} from fallback registry (v${omcScan.registryVersion})`));
    } else {
      console.log(chalk.dim(`  OMC agents: ${omcAgents.length} from ${omcScan.source}`));
    }
  }

  // Step 8: Generate orchestrator prompt
  const promptOptions: PromptOptions = {
    config,
    omcDetected: omcResult.found && mode === 'standalone',
    maturityLevel: effectiveMaturity,
    mode,
    omcAgents,
  };
  const prompt = generateOrchestratorPrompt(agents, promptOptions);

  // Step 9: Compute all changes
  const updatedContent = updateClaudeMdContent(existingContent, prompt);

  // If dry-run, collect and display changes without executing
  if (options.dryRun) {
    const collector = new DryRunCollector(projectRoot);

    // CLAUDE.md
    collector.recordFileWrite(claudeMdPath, updatedContent, existingContent || undefined);

    // Config file
    if (options.config) {
      const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
      const configContent = JSON.stringify(config, null, 2) + '\n';
      collector.recordFileWrite(configPath, configContent);
    }

    // Hook files
    const hookNames = ['keyword-detector.mjs', 'persistent-mode.mjs', 'pre-tool-use.mjs'];
    for (const name of hookNames) {
      const hookPath = join(projectRoot, '.claude', 'hooks', `omcsa-${name}`);
      collector.recordFileWrite(hookPath, `(hook template: ${name})`);
    }

    // Settings.json
    const settingsPath = join(projectRoot, '.claude', 'settings.json');
    collector.recordFileWrite(settingsPath, '(hook registrations would be added)');

    // Mode.json
    const modePath = join(projectRoot, '.omcsa', 'mode.json');
    const modeContent = JSON.stringify({ mode, detectedOmc: omcResult.found, omcMethod: omcResult.method, updatedAt: new Date().toISOString() }, null, 2);
    collector.recordFileWrite(modePath, modeContent);

    const report = collector.buildReport(mode, agents.length, omcResult.found);
    displayDryRunReport(report);
    return;
  }

  // Step 10: Execute changes

  // Write config
  if (options.config) {
    const configDir = join(projectRoot, '.claude');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeConfig(projectRoot, config);
    console.log(chalk.green('  Generated config → .claude/omcsa.config.json'));
  }

  // Update CLAUDE.md
  if (!existsSync(join(projectRoot, '.claude'))) {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
  }
  writeFileSync(claudeMdPath, updatedContent, 'utf-8');
  console.log(chalk.green('  Generated orchestrator prompt → .claude/CLAUDE.md'));

  // Install hooks (ALWAYS — smart hooks handle mode at runtime)
  const { installed, skipped } = installHooks(projectRoot);

  if (installed.length > 0) {
    console.log(chalk.green('  Installed smart hooks:'));
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
    console.log(chalk.yellow(`  Skipped ${skipped.length} hook(s) (template not found)`));
  }

  // Register hooks in settings.json (ALWAYS)
  const hookCommands = getHookCommands(projectRoot);
  addHooksToSettings(projectRoot, hookCommands);
  console.log(chalk.green('  Updated .claude/settings.json'));

  // Save mode to .omcsa/mode.json
  saveMode(projectRoot, mode, omcResult);
  console.log(chalk.green('  Saved mode → .omcsa/mode.json'));

  // Summary
  console.log(chalk.green('\n  Setup complete!'));

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
