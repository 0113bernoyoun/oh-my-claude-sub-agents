/**
 * Doctor Command
 *
 * Diagnoses OMCSA installation issues and optionally auto-fixes them.
 */

import chalk from 'chalk';
import { runDiagnostics, applyFixes } from '../core/diagnostics.js';
import type { DiagnosticSeverity } from '../core/types.js';

interface DoctorOptions {
  fix?: boolean;
}

const SEVERITY_ICONS: Record<DiagnosticSeverity, string> = {
  ok: chalk.green('✓'),
  warn: chalk.yellow('⚠'),
  error: chalk.red('✗'),
  info: chalk.blue('ℹ'),
};

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan('\n  OMCSA Doctor\n'));

  const report = runDiagnostics(projectRoot);

  // Display results
  for (const result of report.results) {
    const icon = SEVERITY_ICONS[result.severity];
    console.log(`  ${icon} ${chalk.bold(result.name)}: ${result.message}`);
    if (result.fix && result.severity !== 'ok') {
      console.log(chalk.dim(`    → ${result.fix}`));
    }
  }

  // Display maturity
  if (report.maturity) {
    const score = report.maturity.compositeScore.toFixed(2);
    console.log(`\n  ${chalk.cyan('Maturity Analysis')}: ${chalk.bold(report.maturity.level)} (score: ${score})`);
  }

  // Display suggestions
  if (report.suggestions.length > 0) {
    console.log(`\n  ${chalk.cyan('Suggestions')}:`);
    for (const suggestion of report.suggestions) {
      console.log(`    - ${suggestion}`);
    }
  }

  // Apply fixes if requested
  if (options.fix) {
    const fixable = report.results.filter(r =>
      r.fixAction && (r.severity === 'error' || r.severity === 'warn') && r.name !== 'Mode JSON'
    );

    if (fixable.length === 0) {
      console.log(chalk.dim('\n  No auto-fixable issues found.'));
    } else {
      console.log(chalk.cyan('\n  Applying fixes...\n'));
      const fixed = applyFixes(report);
      for (const msg of fixed) {
        console.log(`  ${chalk.green('✓')} ${msg}`);
      }
    }
  } else {
    // Check if there are fixable issues
    const fixable = report.results.filter(r =>
      r.fixAction && (r.severity === 'error' || r.severity === 'warn')
    );
    if (fixable.length > 0) {
      console.log(chalk.dim(`\n  ${fixable.length} issue(s) can be auto-fixed. Run \`omcsa doctor --fix\` to apply.`));
    }
  }

  console.log();
}
