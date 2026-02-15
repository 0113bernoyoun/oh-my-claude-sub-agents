/**
 * Status Command
 *
 * Shows current OMCSA configuration status including
 * OMC detection result and install mode.
 */

import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scanAgents } from '../core/scanner.js';
import { loadConfig } from '../core/config-loader.js';
import { OMCSA_MARKER_START } from '../core/types.js';
import { detectOmc, loadMode } from '../core/omc-detector.js';
import { analyzeMaturity } from '../core/maturity-analyzer.js';
import { removeOmcsaSection } from '../core/prompt-generator.js';
import { getLastSession, getTodayLogs, cleanOldLogs } from '../core/log-reader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function runStatus(options?: { logs?: boolean; cleanLogs?: string }): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan(`\n  OMCSA Status`) + chalk.dim(` (v${getVersion()})`) + '\n');

  const hooksDir = join(projectRoot, '.claude', 'hooks');

  // Check OMC
  const omcResult = detectOmc();
  console.log(omcResult.found
    ? chalk.blue(`  OMC: detected (${omcResult.method})`)
    : chalk.dim('  OMC: not detected')
  );

  // Check current mode
  const modeConfig = loadMode(projectRoot);
  if (modeConfig) {
    console.log(chalk.cyan(`  Mode: ${chalk.bold(modeConfig.mode)}`));
  } else {
    // Infer mode from installed state
    const hasOmcsaHooks = existsSync(hooksDir) && (() => {
      try {
        return readdirSync(hooksDir).some(f => f.startsWith('omcsa-'));
      } catch { return false; }
    })();

    if (omcResult.found) {
      console.log(chalk.dim(`  Mode: ${hasOmcsaHooks ? 'integrated' : 'omc-only'} (inferred, no mode.json)`));
    } else {
      console.log(chalk.dim(`  Mode: standalone (inferred, no mode.json)`));
    }
  }

  // Check agents
  const agents = scanAgents(projectRoot);
  if (agents.length > 0) {
    console.log(chalk.green(`  Agents: ${agents.length} found`));
    for (const agent of agents) {
      const modelStr = agent.model || 'default';
      console.log(`    - ${agent.name} (${modelStr}, ${agent.category}, ${agent.scope})`);
    }
  } else {
    console.log(chalk.yellow('  Agents: None found'));
  }

  // Check CLAUDE.md
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    const hasOmcsa = content.includes(OMCSA_MARKER_START);
    console.log(hasOmcsa
      ? chalk.green('  CLAUDE.md: OMCSA section present')
      : chalk.yellow('  CLAUDE.md: exists but no OMCSA section (run `omcsa init`)')
    );
  } else {
    console.log(chalk.yellow('  CLAUDE.md: not found'));
  }

  // Check hooks
  if (existsSync(hooksDir)) {
    try {
      const hooks = readdirSync(hooksDir).filter(f => f.startsWith('omcsa-'));
      if (hooks.length > 0) {
        console.log(chalk.green(`  Hooks: ${hooks.length} installed`));
        for (const hook of hooks) {
          console.log(`    - ${hook}`);
        }
      } else {
        console.log(chalk.yellow('  Hooks: none installed'));
      }
    } catch {
      console.log(chalk.yellow('  Hooks: directory not readable'));
    }
  } else {
    console.log(chalk.yellow('  Hooks: directory not found'));
  }

  // Check config (load once, reuse below for maturity)
  const config = loadConfig(projectRoot);
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
  if (existsSync(configPath)) {
    console.log(chalk.green('  Config: omcsa.config.json found'));
    console.log(`    - ultrawork: ${config.features?.ultrawork ? 'enabled' : 'disabled'}`);
    console.log(`    - ralph: ${config.features?.ralph ? 'enabled' : 'disabled'}`);
    console.log(`    - delegation: ${config.features?.delegationEnforcement || 'warn'}`);
  } else {
    console.log(chalk.dim('  Config: using defaults (no omcsa.config.json)'));
  }

  // Check active modes
  const stateDir = join(projectRoot, '.omcsa', 'state');
  const modes: string[] = [];
  for (const mode of ['ralph', 'ultrawork']) {
    const statePath = join(stateDir, `${mode}-state.json`);
    if (existsSync(statePath)) {
      try {
        const state = JSON.parse(readFileSync(statePath, 'utf-8'));
        if (state.active) {
          modes.push(`${mode} (iteration ${state.iteration}/${state.maxIterations})`);
        }
      } catch { /* ignore */ }
    }
  }

  if (modes.length > 0) {
    console.log(chalk.magenta(`  Active modes: ${modes.join(', ')}`));
  } else {
    console.log(chalk.dim('  Active modes: none'));
  }

  // Check settings.json
  const settingsPath = join(projectRoot, '.claude', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const hasOmcsaHooks = JSON.stringify(settings).includes('omcsa-');
      console.log(hasOmcsaHooks
        ? chalk.green('  Settings: OMCSA hooks registered')
        : chalk.yellow('  Settings: no OMCSA hooks registered')
      );
    } catch {
      console.log(chalk.yellow('  Settings: could not parse'));
    }
  } else {
    console.log(chalk.yellow('  Settings: settings.json not found'));
  }

  // Maturity analysis
  if (existsSync(claudeMdPath) && agents.length > 0) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    const cleanedContent = removeOmcsaSection(content);
    const maturity = analyzeMaturity(cleanedContent, agents);
    console.log(chalk.cyan(`  Maturity: ${chalk.bold(maturity.level)} (score: ${maturity.compositeScore.toFixed(2)})`));
  }

  // Maturity config
  if (config.maturity?.mode) {
    console.log(chalk.dim(`  Maturity mode: ${config.maturity.mode}`));
  }

  // ── Clean logs option ──
  if (options?.cleanLogs !== undefined) {
    const days = parseInt(options.cleanLogs, 10);
    if (isNaN(days) || days < 0) {
      console.log(chalk.red('\n  Error: --clean-logs requires a non-negative number'));
    } else {
      const removed = cleanOldLogs(projectRoot, days);
      console.log(chalk.cyan(`\n  Cleaned ${removed} log file(s) older than ${days} day(s)`));
    }
    console.log();
    return;
  }

  // ── Full logs option ──
  if (options?.logs) {
    const todayLogs = getTodayLogs(projectRoot);
    if (todayLogs.length === 0) {
      console.log(chalk.dim('\n  Orchestration Log: No agent delegations recorded today.'));
    } else {
      console.log(chalk.cyan(`\n  Orchestration Log (today, ${todayLogs.length} entries):`));
      for (const entry of todayLogs) {
        const time = entry.timestamp.slice(11, 19);
        const model = entry.model !== 'default' ? chalk.dim(` (${entry.model})`) : '';
        console.log(`    ${chalk.dim(time)} ${chalk.green(entry.agent)}${model} — ${entry.description}`);
      }
    }
    console.log();
    return;
  }

  // ── Last Orchestration summary ──
  const lastSession = getLastSession(projectRoot);
  if (lastSession) {
    const lastTime = new Date(lastSession.lastTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - lastTime.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const agoStr = diffMin < 1 ? 'just now' : diffMin < 60 ? `${diffMin}min ago` : `${Math.floor(diffMin / 60)}h ago`;

    console.log(chalk.cyan(`\n  Last Orchestration (${agoStr}):`));
    for (let i = 0; i < lastSession.entries.length; i++) {
      const entry = lastSession.entries[i];
      const isLast = i === lastSession.entries.length - 1;
      const prefix = isLast ? '  └─' : '  ├─';
      const model = entry.model !== 'default' ? chalk.dim(` (${entry.model})`) : '';
      console.log(`${prefix} ${chalk.green(entry.agent)}${model}    — ${entry.description}`);
    }
    console.log(chalk.dim(`\n  Agents used: ${lastSession.agentCount}`));
  } else {
    console.log(chalk.dim('\n  Orchestration Log: No agent delegations recorded yet.'));
  }

  console.log();
}
