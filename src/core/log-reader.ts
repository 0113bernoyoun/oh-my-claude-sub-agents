/**
 * Log Reader
 *
 * Reads agent delegation logs from .omcsa/logs/ directory.
 * Provides session summaries and log management.
 */

import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { AgentLogEntry } from './types.js';

export interface SessionSummary {
  sessionId: string;
  entries: AgentLogEntry[];
  firstTimestamp: string;
  lastTimestamp: string;
  agentCount: number;
}

/**
 * Get the log directory path.
 */
function getLogDir(projectRoot: string): string {
  return join(projectRoot, '.omcsa', 'logs');
}

/**
 * Parse a JSONL file into AgentLogEntry array.
 */
function parseLogFile(filePath: string): AgentLogEntry[] {
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) return [];

    return content
      .split('\n')
      .map(line => {
        try {
          return JSON.parse(line) as AgentLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is AgentLogEntry => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Get the most recent log file path.
 */
function getLatestLogFile(logDir: string): string | null {
  if (!existsSync(logDir)) return null;

  try {
    const files = readdirSync(logDir)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse();

    return files.length > 0 ? join(logDir, files[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Get the last session's log entries from the most recent log file.
 */
export function getLastSession(projectRoot: string): SessionSummary | null {
  const logDir = getLogDir(projectRoot);
  const latestFile = getLatestLogFile(logDir);
  if (!latestFile) return null;

  const entries = parseLogFile(latestFile);
  if (entries.length === 0) return null;

  // Group by sessionId, take the last session
  const lastEntry = entries[entries.length - 1];
  const sessionId = lastEntry.sessionId;

  const sessionEntries = entries.filter(e => e.sessionId === sessionId);
  if (sessionEntries.length === 0) return null;

  return {
    sessionId,
    entries: sessionEntries,
    firstTimestamp: sessionEntries[0].timestamp,
    lastTimestamp: sessionEntries[sessionEntries.length - 1].timestamp,
    agentCount: sessionEntries.length,
  };
}

/**
 * Get today's full log entries.
 */
export function getTodayLogs(projectRoot: string): AgentLogEntry[] {
  const logDir = getLogDir(projectRoot);
  const today = new Date().toISOString().slice(0, 10);
  const logFile = join(logDir, `${today}.jsonl`);
  return parseLogFile(logFile);
}

/**
 * Remove log files older than retentionDays.
 * Returns the number of files removed.
 */
export function cleanOldLogs(projectRoot: string, retentionDays: number): number {
  const logDir = getLogDir(projectRoot);
  if (!existsSync(logDir)) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let removed = 0;
  try {
    const files = readdirSync(logDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      // File names are {date}.jsonl, e.g. 2026-02-15.jsonl
      const dateStr = file.replace('.jsonl', '');
      if (dateStr < cutoffStr) {
        unlinkSync(join(logDir, file));
        removed++;
      }
    }
  } catch {
    // Ignore errors
  }

  return removed;
}
