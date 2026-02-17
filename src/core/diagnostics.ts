/**
 * Diagnostics
 *
 * Performs health checks on OMCSA installation and provides
 * actionable fixes for common issues.
 */

import { existsSync, readFileSync, readdirSync, copyFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { scanAgents } from './scanner.js';
import { loadConfig } from './config-loader.js';
import { detectOmc, loadMode, isValidMode } from './omc-detector.js';
import { analyzeMaturity } from './maturity-analyzer.js';
import { removeOmcsaSection, isExternalReference } from './prompt-generator.js';
import { OMCSA_MARKER_START, OMCSA_MARKER_END, OMCSA_EXTERNAL_FILENAME, CLAUDE_MD_SIZE_WARNING_BYTES } from './types.js';
import type { DiagnosticResult, DiagnosticSeverity, DoctorReport, MaturityResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OMCSA_HOOK_MARKER = 'omcsa-';

const EXPECTED_HOOKS = [
  'omcsa-keyword-detector.mjs',
  'omcsa-persistent-mode.mjs',
  'omcsa-pre-tool-use.mjs',
];

// ─── Diagnostic Checks ─────────────────────────────────────────────────────

/**
 * Check 1: Hook files exist in .claude/hooks/
 */
function checkHookFiles(projectRoot: string): DiagnosticResult {
  const hooksDir = join(projectRoot, '.claude', 'hooks');

  if (!existsSync(hooksDir)) {
    return {
      name: 'Hook Files',
      severity: 'error',
      message: 'Hooks directory not found (.claude/hooks/)',
      fix: 'Run `omcsa init` to install hooks',
      fixAction: () => reinstallHooks(projectRoot),
    };
  }

  const missing: string[] = [];
  for (const hook of EXPECTED_HOOKS) {
    if (!existsSync(join(hooksDir, hook))) {
      missing.push(hook);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'Hook Files',
      severity: 'error',
      message: `Missing hook files: ${missing.join(', ')}`,
      fix: 'Run `omcsa init` or `omcsa doctor --fix` to reinstall hooks',
      fixAction: () => reinstallHooks(projectRoot),
    };
  }

  return {
    name: 'Hook Files',
    severity: 'ok',
    message: `All ${EXPECTED_HOOKS.length} hooks installed`,
  };
}

/**
 * Check 2: Hooks registered in settings.json
 */
function checkHookRegistration(projectRoot: string): DiagnosticResult {
  const settingsPath = join(projectRoot, '.claude', 'settings.json');

  if (!existsSync(settingsPath)) {
    return {
      name: 'Hook Registration',
      severity: 'error',
      message: 'settings.json not found',
      fix: 'Run `omcsa init` to create settings',
    };
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const settingsStr = JSON.stringify(settings);

    const registeredCount = EXPECTED_HOOKS.filter(hook =>
      settingsStr.includes(hook)
    ).length;

    if (registeredCount === 0) {
      return {
        name: 'Hook Registration',
        severity: 'error',
        message: 'No OMCSA hooks registered in settings.json',
        fix: 'Run `omcsa init` to register hooks',
      };
    }

    if (registeredCount < EXPECTED_HOOKS.length) {
      return {
        name: 'Hook Registration',
        severity: 'warn',
        message: `Only ${registeredCount}/${EXPECTED_HOOKS.length} hooks registered in settings.json`,
        fix: 'Run `omcsa init` to re-register all hooks',
      };
    }

    return {
      name: 'Hook Registration',
      severity: 'ok',
      message: 'All hooks registered in settings.json',
    };
  } catch {
    return {
      name: 'Hook Registration',
      severity: 'error',
      message: 'Could not parse settings.json',
      fix: 'Check settings.json for syntax errors',
    };
  }
}

/**
 * Check 3: Mode JSON validity
 */
function checkModeJson(projectRoot: string): DiagnosticResult {
  const modePath = join(projectRoot, '.omcsa', 'mode.json');

  if (!existsSync(modePath)) {
    return {
      name: 'Mode JSON',
      severity: 'warn',
      message: 'mode.json not found (.omcsa/mode.json)',
      fix: 'Run `omcsa init` or `omcsa switch <mode>` to create mode.json',
    };
  }

  try {
    const modeConfig = JSON.parse(readFileSync(modePath, 'utf-8'));

    if (!modeConfig.mode || !isValidMode(modeConfig.mode)) {
      return {
        name: 'Mode JSON',
        severity: 'warn',
        message: `Invalid mode value: "${modeConfig.mode}"`,
        fix: 'Run `omcsa switch standalone` to fix mode.json',
        // NOTE: Not providing fixAction — mode changes affect hook behavior
      };
    }

    return {
      name: 'Mode JSON',
      severity: 'ok',
      message: `Mode: ${modeConfig.mode} (valid)`,
    };
  } catch {
    return {
      name: 'Mode JSON',
      severity: 'warn',
      message: 'Could not parse mode.json',
      fix: 'Run `omcsa switch <mode>` to recreate mode.json',
    };
  }
}

/**
 * Check 4: Agent files validity
 */
function checkAgentFiles(projectRoot: string): DiagnosticResult {
  const agents = scanAgents(projectRoot);

  if (agents.length === 0) {
    return {
      name: 'Agent Files',
      severity: 'warn',
      message: 'No agents found in .claude/agents/',
      fix: 'Create agent .md files in .claude/agents/',
    };
  }

  const issues: string[] = [];
  const fixActions: Array<() => void> = [];

  for (const agent of agents) {
    if (!agent.description || agent.description === agent.name) {
      issues.push(`'${agent.name}' missing description field`);
      fixActions.push(() => addDefaultDescription(agent.filePath, agent.name));
    }
  }

  if (issues.length > 0) {
    return {
      name: 'Agent Files',
      severity: 'warn',
      message: issues.join('; '),
      fix: 'Add description fields to agent frontmatter',
      fixAction: fixActions.length > 0 ? () => fixActions.forEach(fn => fn()) : undefined,
    };
  }

  return {
    name: 'Agent Files',
    severity: 'ok',
    message: `${agents.length} agent(s) valid`,
  };
}

/**
 * Check 5: CLAUDE.md OMCSA section
 */
function checkClaudeMdSection(projectRoot: string): DiagnosticResult {
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    return {
      name: 'CLAUDE.md Section',
      severity: 'error',
      message: 'CLAUDE.md not found',
      fix: 'Run `omcsa init` to create CLAUDE.md with orchestrator prompt',
    };
  }

  const content = readFileSync(claudeMdPath, 'utf-8');
  const hasStart = content.includes(OMCSA_MARKER_START);
  const hasEnd = content.includes(OMCSA_MARKER_END);

  if (!hasStart && !hasEnd) {
    return {
      name: 'CLAUDE.md Section',
      severity: 'error',
      message: 'No OMCSA section in CLAUDE.md',
      fix: 'Run `omcsa apply` to add orchestrator prompt',
    };
  }

  if (hasStart !== hasEnd) {
    return {
      name: 'CLAUDE.md Section',
      severity: 'error',
      message: 'OMCSA markers are incomplete (missing start or end)',
      fix: 'Run `omcsa refresh` to regenerate the OMCSA section',
    };
  }

  return {
    name: 'CLAUDE.md Section',
    severity: 'ok',
    message: 'OMCSA section present',
  };
}

/**
 * Check 6: Config file validity
 */
function checkConfigFile(projectRoot: string): DiagnosticResult {
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');

  if (!existsSync(configPath)) {
    return {
      name: 'Config File',
      severity: 'info',
      message: 'No omcsa.config.json (using defaults)',
    };
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Basic structure validation
    const validKeys = ['agents', 'features', 'keywords', 'persistence', 'maturity', 'omcAgents'];
    const unknownKeys = Object.keys(config).filter(k => !validKeys.includes(k));

    if (unknownKeys.length > 0) {
      return {
        name: 'Config File',
        severity: 'warn',
        message: `Unknown config keys: ${unknownKeys.join(', ')}`,
      };
    }

    return {
      name: 'Config File',
      severity: 'ok',
      message: 'Valid',
    };
  } catch {
    return {
      name: 'Config File',
      severity: 'warn',
      message: 'Could not parse omcsa.config.json',
      fix: 'Check file for JSON syntax errors or remove and run `omcsa init --config`',
    };
  }
}

/**
 * Check 7: OMC consistency
 */
function checkOmcConsistency(projectRoot: string): DiagnosticResult {
  const omcResult = detectOmc();
  const modeConfig = loadMode(projectRoot);

  if (!modeConfig) {
    return {
      name: 'OMC Consistency',
      severity: 'info',
      message: `OMC: ${omcResult.found ? 'detected' : 'not detected'} (no mode.json for consistency check)`,
    };
  }

  // Check: if OMC detected but mode says standalone, warn
  if (omcResult.found && modeConfig.mode === 'standalone' && !modeConfig.detectedOmc) {
    return {
      name: 'OMC Consistency',
      severity: 'warn',
      message: 'OMC detected but mode.json shows no OMC at init time. OMC may have been installed after OMCSA.',
      fix: 'Run `omcsa switch integrated` or `omcsa switch standalone` to update mode',
    };
  }

  // Check: if OMC not detected but mode is integrated/omc-only
  if (!omcResult.found && (modeConfig.mode === 'integrated' || modeConfig.mode === 'omc-only')) {
    return {
      name: 'OMC Consistency',
      severity: 'warn',
      message: `Mode is "${modeConfig.mode}" but OMC is not detected. OMCSA hooks will yield to OMC that doesn't exist.`,
      fix: 'Run `omcsa switch standalone` to use full OMCSA features',
    };
  }

  const omcStatus = omcResult.found ? `detected (${omcResult.method})` : 'not detected';
  return {
    name: 'OMC Consistency',
    severity: 'ok',
    message: `Mode "${modeConfig.mode}" consistent with OMC status (${omcStatus})`,
  };
}

/**
 * Check 8: External file consistency
 */
function checkExternalFile(projectRoot: string): DiagnosticResult {
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  const externalPath = join(projectRoot, '.claude', OMCSA_EXTERNAL_FILENAME);

  if (!existsSync(claudeMdPath)) {
    // No CLAUDE.md, nothing to check
    if (existsSync(externalPath)) {
      return {
        name: 'External File',
        severity: 'warn',
        message: `Orphaned ${OMCSA_EXTERNAL_FILENAME} found without CLAUDE.md`,
        fix: 'Run `omcsa init` or delete the orphaned file',
      };
    }
    return {
      name: 'External File',
      severity: 'ok',
      message: 'No external file (not applicable)',
    };
  }

  const content = readFileSync(claudeMdPath, 'utf-8');
  const hasMarkers = content.includes(OMCSA_MARKER_START);

  if (!hasMarkers) {
    if (existsSync(externalPath)) {
      return {
        name: 'External File',
        severity: 'warn',
        message: `Orphaned ${OMCSA_EXTERNAL_FILENAME} found (no OMCSA section in CLAUDE.md)`,
        fix: 'Run `omcsa init` or delete the orphaned file',
      };
    }
    return {
      name: 'External File',
      severity: 'ok',
      message: 'No external file (not applicable)',
    };
  }

  const isExternal = isExternalReference(content);

  if (isExternal && !existsSync(externalPath)) {
    return {
      name: 'External File',
      severity: 'error',
      message: `CLAUDE.md references @${OMCSA_EXTERNAL_FILENAME} but file is missing`,
      fix: 'Run `omcsa refresh` to regenerate the external file',
    };
  }

  if (!isExternal && existsSync(externalPath)) {
    return {
      name: 'External File',
      severity: 'warn',
      message: `${OMCSA_EXTERNAL_FILENAME} exists but CLAUDE.md uses inline mode`,
      fix: 'Run `omcsa apply --output external` to switch, or delete the orphaned file',
    };
  }

  if (isExternal && existsSync(externalPath)) {
    return {
      name: 'External File',
      severity: 'ok',
      message: `External mode: ${OMCSA_EXTERNAL_FILENAME} present`,
    };
  }

  return {
    name: 'External File',
    severity: 'ok',
    message: 'Inline mode (no external file)',
  };
}

/**
 * Check 9: CLAUDE.md size warning
 */
function checkClaudeMdSize(projectRoot: string): DiagnosticResult {
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    return {
      name: 'CLAUDE.md Size',
      severity: 'ok',
      message: 'Not applicable (no CLAUDE.md)',
    };
  }

  const content = readFileSync(claudeMdPath, 'utf-8');
  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  const sizeKb = (sizeBytes / 1024).toFixed(1);

  if (sizeBytes > CLAUDE_MD_SIZE_WARNING_BYTES) {
    const isInline = content.includes(OMCSA_MARKER_START) && !isExternalReference(content);

    if (isInline) {
      return {
        name: 'CLAUDE.md Size',
        severity: 'warn',
        message: `CLAUDE.md is ${sizeKb}KB (inline mode). Consider switching to external mode to reduce size.`,
        fix: 'Run `omcsa apply --output external` to externalize the orchestrator prompt',
      };
    }

    return {
      name: 'CLAUDE.md Size',
      severity: 'warn',
      message: `CLAUDE.md is ${sizeKb}KB. Large files may trigger "file too long" warnings in Claude Code.`,
    };
  }

  return {
    name: 'CLAUDE.md Size',
    severity: 'ok',
    message: `CLAUDE.md size: ${sizeKb}KB`,
  };
}

// ─── Fix Actions ────────────────────────────────────────────────────────────

/**
 * Reinstall hook files atomically (temp file + rename).
 */
function reinstallHooks(projectRoot: string): void {
  const templatesDir = join(__dirname, '..', '..', 'templates', 'hooks');
  const hooksDir = join(projectRoot, '.claude', 'hooks');

  // Ensure directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const hookNames = [
    'keyword-detector.mjs',
    'persistent-mode.mjs',
    'pre-tool-use.mjs',
  ];

  for (const name of hookNames) {
    const srcPath = join(templatesDir, name);
    const destPath = join(hooksDir, `omcsa-${name}`);

    if (!existsSync(srcPath)) continue;

    // Atomic write: copy to temp, then rename
    const tempPath = join(tmpdir(), `omcsa-${name}-${Date.now()}`);
    copyFileSync(srcPath, tempPath);
    renameSync(tempPath, destPath);
  }
}

/**
 * Add a default description to an agent file's frontmatter.
 */
function addDefaultDescription(filePath: string, agentName: string): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) return;

  const frontmatter = frontmatterMatch[1];
  if (/description:/i.test(frontmatter)) return; // Already has description

  const updatedFrontmatter = `${frontmatter}\ndescription: ${agentName} agent`;
  const updatedContent = content.replace(
    frontmatterMatch[0],
    `---\n${updatedFrontmatter}\n---`
  );

  writeFileSync(filePath, updatedContent, 'utf-8');
}

// ─── Main Doctor Function ───────────────────────────────────────────────────

/**
 * Run all diagnostic checks and return a report.
 */
export function runDiagnostics(projectRoot: string): DoctorReport {
  // Check if OMCSA is initialized
  const omcsaDir = join(projectRoot, '.omcsa');
  const isInitialized = existsSync(omcsaDir);

  const results: DiagnosticResult[] = [];

  // Run all checks
  results.push(checkHookFiles(projectRoot));
  results.push(checkHookRegistration(projectRoot));
  results.push(checkModeJson(projectRoot));
  results.push(checkAgentFiles(projectRoot));
  results.push(checkClaudeMdSection(projectRoot));
  results.push(checkConfigFile(projectRoot));
  results.push(checkOmcConsistency(projectRoot));
  results.push(checkExternalFile(projectRoot));
  results.push(checkClaudeMdSize(projectRoot));

  // Scan agents once for reuse
  const agents = scanAgents(projectRoot);

  // Maturity analysis
  let maturity: MaturityResult | undefined;
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    const cleanedContent = removeOmcsaSection(content);
    maturity = analyzeMaturity(cleanedContent, agents);
  }

  // Generate suggestions
  const suggestions: string[] = [];

  if (!isInitialized) {
    suggestions.push('OMCSA is not initialized. Run `omcsa init` to set up.');
  }

  if (maturity) {
    if (maturity.level === 'LOW') {
      suggestions.push('Consider adding workflow rules to CLAUDE.md for better orchestration');
    }
    if (maturity.compositeScore > 0.25 && maturity.compositeScore < 0.6) {
      suggestions.push('Use `--maturity auto` with init/refresh for adaptive prompts matching your setup');
    }
  }

  // Check for agent gaps
  const categories = new Set(agents.map(a => a.category));
  if (agents.length > 0 && !categories.has('testing')) {
    suggestions.push('Consider adding a testing agent for automated quality checks');
  }
  if (agents.length > 0 && !categories.has('review')) {
    suggestions.push('Consider adding a review agent for code review workflows');
  }

  // Check for specific agent issues from results
  for (const result of results) {
    if (result.severity === 'warn' && result.name === 'Agent Files') {
      suggestions.push(`Agent issue: ${result.message}`);
    }
  }

  return { results, maturity, suggestions };
}

/**
 * Apply auto-fixes for fixable issues.
 * Returns the list of fixes applied.
 */
export function applyFixes(report: DoctorReport): string[] {
  const fixed: string[] = [];

  for (const result of report.results) {
    if (result.fixAction && (result.severity === 'error' || result.severity === 'warn')) {
      // Safety: skip mode.json fixes (mode changes affect hook behavior)
      if (result.name === 'Mode JSON') continue;

      try {
        result.fixAction();
        fixed.push(`Fixed: ${result.message}`);
      } catch (err) {
        // Log but don't fail
        fixed.push(`Failed to fix: ${result.message} (${err instanceof Error ? err.message : 'unknown error'})`);
      }
    }
  }

  return fixed;
}
