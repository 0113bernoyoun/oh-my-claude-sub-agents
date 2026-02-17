/**
 * Apply Command
 *
 * Re-applies config changes: re-scans agents, regenerates prompt,
 * and updates CLAUDE.md.
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scanAgents } from '../core/scanner.js';
import {
  generateOrchestratorPrompt,
  generateOrchestratorPromptContent,
  generateImportReference,
  updateClaudeMdContent,
  removeOmcsaSection,
  removeExternalFile,
} from '../core/prompt-generator.js';
import { loadConfig, applyConfigOverrides } from '../core/config-loader.js';
import { detectOmc, loadMode } from '../core/omc-detector.js';
import { analyzeMaturity, resolveMaturityLevel } from '../core/maturity-analyzer.js';
import { scanOmcAgents } from '../core/omc-agent-scanner.js';
import { DryRunCollector, displayDryRunReport } from '../core/dry-run.js';
import type { PromptOptions, PromptOutputMode } from '../core/types.js';
import { OMCSA_EXTERNAL_FILENAME, CLAUDE_MD_SIZE_WARNING_BYTES } from '../core/types.js';

interface ApplyOptions {
  maturity?: string;
  output?: string;
  dryRun?: boolean;
}

export async function runApply(options: ApplyOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan('\n  Applying configuration...\n'));

  // Scan agents
  let agents = scanAgents(projectRoot);

  if (agents.length === 0) {
    console.log(chalk.yellow('  No agents found. Nothing to apply.'));
    return;
  }

  // Load and apply config overrides
  const config = loadConfig(projectRoot);
  agents = applyConfigOverrides(agents, config);

  console.log(chalk.green(`  Found ${agents.length} agent(s)`));

  // Detect OMC and check mode
  const omcResult = detectOmc();
  const modeConfig = loadMode(projectRoot);
  const mode = modeConfig?.mode || 'standalone';
  const omcExclusive = omcResult.found && mode === 'standalone';

  // Read existing CLAUDE.md for maturity analysis
  const claudeMdPath = join(projectRoot, '.claude', 'CLAUDE.md');
  let existingContent = '';

  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  }

  // Maturity analysis
  const cleanedContent = removeOmcsaSection(existingContent);
  const maturityResult = analyzeMaturity(cleanedContent, agents);
  const effectiveMaturity = resolveMaturityLevel(options.maturity, config.maturity?.mode, maturityResult);

  const isAdaptive = options.maturity === 'auto' || config.maturity?.mode === 'auto';
  console.log(
    chalk.dim(`  Maturity: ${maturityResult.level} (${maturityResult.compositeScore.toFixed(2)})`) +
    (isAdaptive
      ? chalk.cyan(` — Adaptive (${effectiveMaturity})`)
      : chalk.dim(' — Full prompt'))
  );

  // OMC agents for integrated mode
  let omcAgents;
  if (mode === 'integrated') {
    const omcScan = scanOmcAgents(projectRoot);
    omcAgents = omcScan.agents;
  }

  // Resolve output mode
  const outputMode: PromptOutputMode = (options.output === 'inline' || options.output === 'external')
    ? options.output
    : (config.features?.outputMode || 'external');

  // Regenerate prompt
  const promptOptions: PromptOptions = {
    config,
    omcDetected: omcExclusive,
    maturityLevel: effectiveMaturity,
    mode,
    omcAgents,
  };

  const externalFilePath = join(projectRoot, '.claude', OMCSA_EXTERNAL_FILENAME);

  let updatedContent: string;
  let externalFileContent: string | undefined;

  if (outputMode === 'external') {
    externalFileContent = generateOrchestratorPromptContent(agents, promptOptions);
    const importRef = generateImportReference();
    updatedContent = updateClaudeMdContent(existingContent, importRef);
  } else {
    const prompt = generateOrchestratorPrompt(agents, promptOptions);
    updatedContent = updateClaudeMdContent(existingContent, prompt);
  }

  // Dry run check
  if (options.dryRun) {
    const collector = new DryRunCollector(projectRoot);
    collector.recordFileWrite(claudeMdPath, updatedContent, existingContent || undefined);
    if (outputMode === 'external' && externalFileContent) {
      collector.recordFileWrite(externalFilePath, externalFileContent);
    }
    const report = collector.buildReport(mode, agents.length, omcResult.found);
    displayDryRunReport(report);
    return;
  }

  // Execute
  if (outputMode === 'external') {
    writeFileSync(externalFilePath, externalFileContent!, 'utf-8');
    console.log(chalk.green(`  Updated .claude/${OMCSA_EXTERNAL_FILENAME}`));
    writeFileSync(claudeMdPath, updatedContent, 'utf-8');
    console.log(chalk.green('  Updated .claude/CLAUDE.md (@import reference)'));
  } else {
    writeFileSync(claudeMdPath, updatedContent, 'utf-8');
    console.log(chalk.green('  Updated .claude/CLAUDE.md'));

    // Clean up external file if switching from external to inline
    if (removeExternalFile(projectRoot)) {
      console.log(chalk.green(`  Removed ${OMCSA_EXTERNAL_FILENAME} (switched to inline)`));
    }

    // Size warning
    const claudeMdSize = Buffer.byteLength(updatedContent, 'utf-8');
    if (claudeMdSize > CLAUDE_MD_SIZE_WARNING_BYTES) {
      console.log(chalk.yellow(`\n  ⚠ CLAUDE.md is ${(claudeMdSize / 1024).toFixed(1)}KB. Consider using --output external to reduce size.`));
    }
  }

  console.log(chalk.green('\n  Configuration applied!\n'));
}
