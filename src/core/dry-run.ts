/**
 * Dry Run
 *
 * Collects and displays file changes without executing them.
 * Used by init and apply commands to preview changes before execution.
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { relative } from 'path';
import type { ChangeType, FileChange, DryRunReport, InstallMode } from './types.js';
import { OMCSA_MARKER_START, OMCSA_MARKER_END } from './types.js';

// ─── DryRunCollector ────────────────────────────────────────────────────────

export class DryRunCollector {
  private changes: FileChange[] = [];
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Record a file write operation.
   */
  recordFileWrite(path: string, content: string, existing?: string): void {
    const changeType: ChangeType = existing !== undefined ? 'modify' : (
      existsSync(path) ? 'modify' : 'create'
    );

    const relPath = this.relativePath(path);
    let description: string;

    if (changeType === 'create') {
      description = `Create ${relPath}`;
    } else {
      description = `Modify ${relPath}`;
    }

    this.changes.push({
      path: relPath,
      changeType,
      description,
      before: existing ?? (existsSync(path) ? this.safeRead(path) : undefined),
      after: content,
    });
  }

  /**
   * Record a file delete operation.
   */
  recordFileDelete(path: string): void {
    const relPath = this.relativePath(path);
    this.changes.push({
      path: relPath,
      changeType: 'delete',
      description: `Delete ${relPath}`,
    });
  }

  /**
   * Build the final report.
   */
  buildReport(mode: InstallMode, agentCount: number, omcDetected: boolean): DryRunReport {
    return {
      changes: this.changes,
      mode,
      agentCount,
      omcDetected,
    };
  }

  private relativePath(path: string): string {
    return relative(this.projectRoot, path);
  }

  private safeRead(path: string): string | undefined {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return undefined;
    }
  }
}

// ─── Report Display ─────────────────────────────────────────────────────────

/**
 * Display a dry-run report to the console.
 */
export function displayDryRunReport(report: DryRunReport): void {
  console.log(chalk.cyan('\n  Dry Run Report\n'));
  console.log(chalk.dim(`  Mode: ${report.mode} | Agents: ${report.agentCount} | OMC: ${report.omcDetected ? 'detected' : 'not detected'}`));
  console.log();

  if (report.changes.length === 0) {
    console.log(chalk.dim('  No changes would be made.\n'));
    return;
  }

  console.log(chalk.bold(`  ${report.changes.length} file(s) would be affected:\n`));

  for (const change of report.changes) {
    const icon = change.changeType === 'create' ? '+' : change.changeType === 'modify' ? '~' : '-';
    const color = change.changeType === 'create' ? chalk.green : change.changeType === 'modify' ? chalk.yellow : chalk.red;

    console.log(color(`  ${icon} ${change.path}`));

    // Show diff details for specific file types
    if (change.changeType === 'modify' && change.before && change.after) {
      displayFileDiff(change);
    } else if (change.changeType === 'create') {
      displayFilePreview(change);
    }
  }

  console.log(chalk.dim('\n  Run without --dry-run to apply these changes.\n'));
}

/**
 * Display bounded diff for CLAUDE.md (OMCSA section only) or summary for other files.
 */
function displayFileDiff(change: FileChange): void {
  if (!change.before || !change.after) return;

  // For CLAUDE.md, show only the OMCSA section diff
  if (change.path.endsWith('CLAUDE.md')) {
    displayOmcsaSectionDiff(change.before, change.after);
    return;
  }

  // For settings.json, show added hook entries
  if (change.path.endsWith('settings.json')) {
    displaySettingsDiff(change.before, change.after);
    return;
  }

  // For other files, show a summary
  const beforeLines = change.before.split('\n').length;
  const afterLines = change.after.split('\n').length;
  const diff = afterLines - beforeLines;
  const diffStr = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '0';
  console.log(chalk.dim(`    (${beforeLines} → ${afterLines} lines, ${diffStr})`));
}

/**
 * Display the OMCSA section diff from CLAUDE.md.
 */
function displayOmcsaSectionDiff(before: string, after: string): void {
  const beforeSection = extractOmcsaSection(before);
  const afterSection = extractOmcsaSection(after);

  if (!afterSection) {
    console.log(chalk.dim('    (OMCSA section would be removed)'));
    return;
  }

  if (!beforeSection) {
    console.log(chalk.dim('    (OMCSA section would be added)'));
    const lines = afterSection.split('\n');
    const preview = lines.slice(0, 5);
    for (const line of preview) {
      console.log(chalk.green(`    + ${line}`));
    }
    if (lines.length > 5) {
      console.log(chalk.dim(`    ... and ${lines.length - 5} more lines`));
    }
    return;
  }

  // Both exist — show line count change
  const beforeLines = beforeSection.split('\n').length;
  const afterLines = afterSection.split('\n').length;
  const diff = afterLines - beforeLines;
  const diffStr = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '0';
  console.log(chalk.dim(`    OMCSA section: ${beforeLines} → ${afterLines} lines (${diffStr})`));
}

/**
 * Extract the OMCSA section from content.
 */
function extractOmcsaSection(content: string): string | null {
  const startIdx = content.indexOf(OMCSA_MARKER_START);
  const endIdx = content.indexOf(OMCSA_MARKER_END);

  if (startIdx === -1 || endIdx === -1) return null;

  return content.slice(startIdx, endIdx + OMCSA_MARKER_END.length);
}

/**
 * Display diff for settings.json (hook entries).
 */
function displaySettingsDiff(before: string, after: string): void {
  try {
    const beforeObj = JSON.parse(before);
    const afterObj = JSON.parse(after);

    const beforeHooks = JSON.stringify(beforeObj.hooks || {});
    const afterHooks = JSON.stringify(afterObj.hooks || {});

    if (beforeHooks === afterHooks) {
      console.log(chalk.dim('    (no hook changes)'));
    } else {
      // Count OMCSA hook entries in after
      const omcsaCount = (afterHooks.match(/omcsa-/g) || []).length;
      console.log(chalk.dim(`    (${omcsaCount} OMCSA hook entries)`));
    }
  } catch {
    console.log(chalk.dim('    (settings changes)'));
  }
}

/**
 * Display a preview for new files.
 */
function displayFilePreview(change: FileChange): void {
  if (!change.after) return;

  const lines = change.after.split('\n');
  if (lines.length <= 3) {
    for (const line of lines) {
      if (line.trim()) console.log(chalk.dim(`    ${line.trim().slice(0, 80)}`));
    }
  } else {
    console.log(chalk.dim(`    (${lines.length} lines)`));
  }
}
