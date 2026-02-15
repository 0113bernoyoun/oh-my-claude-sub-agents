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

export async function runStatus(): Promise<void> {
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

  console.log();
}
