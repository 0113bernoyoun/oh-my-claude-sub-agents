/**
 * Agent Scanner
 *
 * Scans .claude/agents/ directories for agent definition files,
 * parses YAML frontmatter, and returns discovered agents.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  DiscoveredAgent,
  AgentFrontmatter,
  AgentCategory,
  AgentScope,
  ModelName,
  ModelTier,
  MODEL_TIER_MAP,
} from './types.js';

/**
 * Parse YAML frontmatter from a markdown file.
 * Expects format:
 * ---
 * key: value
 * ---
 * content...
 */
function parseFrontmatter(content: string): AgentFrontmatter {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  try {
    const parsed = parseYaml(match[1]);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as AgentFrontmatter;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Extract description from agent file content.
 * Tries frontmatter first, then first non-heading paragraph.
 */
function extractDescription(content: string, frontmatter: AgentFrontmatter): string {
  if (frontmatter.description) {
    return String(frontmatter.description);
  }

  // Remove frontmatter
  const body = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

  // Find first non-heading, non-empty paragraph
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      // Return first meaningful line, truncated
      return trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed;
    }
  }

  return 'Custom agent';
}

/**
 * Infer agent category from description text.
 */
function inferCategory(description: string, name: string): AgentCategory {
  const text = `${name} ${description}`.toLowerCase();

  if (/\b(test|spec|jest|vitest|pytest|testing|qa)\b/.test(text)) return 'testing';
  if (/\b(review|lint|audit|quality|check)\b/.test(text)) return 'review';
  if (/\b(explor|research|search|analyz|investigat|debug)\b/.test(text)) return 'exploration';
  if (/\b(implement|build|develop|creat|code|frontend|backend|api|ui|ux)\b/.test(text)) return 'implementation';

  return 'other';
}

/**
 * Derive model tier from model name.
 */
function deriveTier(model: ModelName | undefined): ModelTier {
  if (!model) return 'DEFAULT';
  return MODEL_TIER_MAP[model] ?? 'DEFAULT';
}

/**
 * Parse a single agent file and return a DiscoveredAgent.
 */
function parseAgentFile(filePath: string, scope: AgentScope): DiscoveredAgent | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    const fileName = basename(filePath, extname(filePath));
    const name = frontmatter.name ? String(frontmatter.name) : fileName;
    const description = extractDescription(content, frontmatter);
    const model = validateModel(frontmatter.model);
    const tier = deriveTier(model);
    const category = frontmatter.category
      ? validateCategory(String(frontmatter.category))
      : inferCategory(description, name);

    const disallowedTools = Array.isArray(frontmatter.disallowedTools)
      ? frontmatter.disallowedTools.map(String)
      : undefined;

    return {
      name,
      description,
      model,
      tier,
      category,
      scope,
      filePath,
      disallowedTools,
    };
  } catch {
    return null;
  }
}

function validateModel(value: unknown): ModelName | undefined {
  if (typeof value !== 'string') return undefined;
  const lower = value.toLowerCase();
  if (lower === 'haiku' || lower === 'sonnet' || lower === 'opus') {
    return lower as ModelName;
  }
  return undefined;
}

const CATEGORY_SYNONYMS: Record<string, AgentCategory> = {
  // implementation synonyms
  engineering: 'implementation',
  development: 'implementation',
  dev: 'implementation',
  coding: 'implementation',
  builder: 'implementation',
  // review synonyms
  quality: 'review',
  audit: 'review',
  verification: 'review',
  // testing synonyms
  qa: 'testing',
  test: 'testing',
  spec: 'testing',
  // exploration synonyms
  analysis: 'exploration',
  research: 'exploration',
  investigation: 'exploration',
};

function validateCategory(value: string): AgentCategory {
  const lower = value.toLowerCase();
  const categories: AgentCategory[] = ['implementation', 'review', 'testing', 'exploration', 'other'];
  if (categories.includes(lower as AgentCategory)) return lower as AgentCategory;
  return CATEGORY_SYNONYMS[lower] || 'other';
}

/**
 * Scan a directory for .md agent files.
 */
function scanDirectory(dirPath: string, scope: AgentScope): DiscoveredAgent[] {
  if (!existsSync(dirPath)) return [];

  const agents: DiscoveredAgent[] = [];

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const filePath = join(dirPath, entry.name);
      const agent = parseAgentFile(filePath, scope);
      if (agent) {
        agents.push(agent);
      }
    }
  } catch {
    // Directory not readable
  }

  return agents;
}

/**
 * Get the user's home directory.
 */
function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

/**
 * Scan for all agents in both global and project directories.
 * Project agents override global agents with the same name.
 */
export function scanAgents(projectRoot: string): DiscoveredAgent[] {
  const homeDir = getHomeDir();

  // Scan global agents (~/.claude/agents/)
  const globalDir = join(homeDir, '.claude', 'agents');
  const globalAgents = scanDirectory(globalDir, 'global');

  // Scan project agents (.claude/agents/)
  const projectDir = join(projectRoot, '.claude', 'agents');
  const projectAgents = scanDirectory(projectDir, 'project');

  // Merge: project overrides global (by name)
  const agentMap = new Map<string, DiscoveredAgent>();

  for (const agent of globalAgents) {
    agentMap.set(agent.name, agent);
  }
  for (const agent of projectAgents) {
    agentMap.set(agent.name, agent);
  }

  return Array.from(agentMap.values());
}

export { parseFrontmatter, extractDescription, inferCategory };
