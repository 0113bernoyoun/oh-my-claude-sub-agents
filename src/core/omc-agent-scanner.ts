/**
 * OMC Agent Scanner
 *
 * Discovers oh-my-claudecode (OMC) agents for integrated mode orchestration.
 * Uses a multi-strategy approach:
 * 1. Dynamic discovery from OMC plugin directory
 * 2. Fallback to known agents registry
 * 3. User override via config
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { OmcAgent, AgentCategory } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface OmcScanResult {
  agents: OmcAgent[];
  source: 'dynamic' | 'fallback' | 'config';
  registryVersion?: string;
}

// ─── Dynamic Discovery ─────────────────────────────────────────────────────

/**
 * Attempt dynamic discovery of OMC agents from the plugin installation.
 */
function discoverFromPlugin(): OmcAgent[] | null {
  const home = homedir();
  const globalSettingsPath = join(home, '.claude', 'settings.json');

  if (!existsSync(globalSettingsPath)) return null;

  try {
    const settings = JSON.parse(readFileSync(globalSettingsPath, 'utf-8'));
    const plugins: string[] = settings.enabledPlugins || [];

    // Find the OMC plugin path
    const omcPlugin = plugins.find((p: string) =>
      typeof p === 'string' && p.toLowerCase().includes('oh-my-claudecode')
    );

    if (!omcPlugin) return null;

    // Try to read agent definitions from the plugin directory
    const pluginDir = omcPlugin.startsWith('~')
      ? join(home, omcPlugin.slice(1))
      : omcPlugin;

    // Look for agent definitions in common locations
    const agentPaths = [
      join(pluginDir, 'agents'),
      join(pluginDir, 'src', 'agents'),
      join(pluginDir, 'dist', 'agents'),
    ];

    for (const agentPath of agentPaths) {
      if (existsSync(agentPath)) {
        const agents = scanOmcAgentDir(agentPath);
        if (agents.length > 0) return agents;
      }
    }
  } catch {
    // Fall through to fallback
  }

  return null;
}

/**
 * Scan a directory for OMC agent definitions.
 */
function scanOmcAgentDir(dirPath: string): OmcAgent[] {
  const agents: OmcAgent[] = [];

  try {
    const files = readdirSync(dirPath).filter(f => f.endsWith('.md') || f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = readFileSync(join(dirPath, file), 'utf-8');
        const name = file.replace(/\.(md|json)$/, '');

        // Extract description from first line or frontmatter
        const descMatch = content.match(/description:\s*(.+)/i);
        const description = descMatch ? descMatch[1].trim() : `OMC agent: ${name}`;

        agents.push({
          name,
          fullName: `oh-my-claudecode:${name}`,
          description,
          category: inferOmcCategory(name, description),
        });
      } catch {
        // Skip unparseable files
      }
    }
  } catch {
    // Directory not readable
  }

  return agents;
}

/**
 * Infer category for an OMC agent from its name and description.
 */
function inferOmcCategory(name: string, description: string): AgentCategory {
  const combined = `${name} ${description}`.toLowerCase();

  if (/review|critic|audit/.test(combined)) return 'review';
  if (/test|qa|tdd|quality/.test(combined)) return 'testing';
  if (/explore|search|research|architect|analy|vision|plan/.test(combined)) return 'exploration';
  if (/implement|execut|build|fix|design|writ/.test(combined)) return 'implementation';

  return 'other';
}

// ─── Fallback Registry ─────────────────────────────────────────────────────

interface KnownAgentsRegistry {
  omcVersion: string;
  lastUpdated: string;
  agents: OmcAgent[];
}

/**
 * Load the fallback known agents registry.
 */
function loadFallbackRegistry(): { agents: OmcAgent[]; version: string } {
  try {
    // Try multiple paths since JSON is in src/data/ but code runs from dist/core/
    const candidates = [
      join(__dirname, '..', 'data', 'omc-known-agents.json'),           // dist/data/ (if copied)
      join(__dirname, '..', '..', 'src', 'data', 'omc-known-agents.json'), // from dist/core/ → src/data/
      join(__dirname, '..', '..', 'data', 'omc-known-agents.json'),     // package-root/data/
    ];

    for (const candidatePath of candidates) {
      if (existsSync(candidatePath)) {
        const content = readFileSync(candidatePath, 'utf-8');
        const registry = JSON.parse(content) as KnownAgentsRegistry;
        return { agents: registry.agents, version: registry.omcVersion };
      }
    }

    return { agents: [], version: 'unknown' };
  } catch {
    return { agents: [], version: 'unknown' };
  }
}

// ─── Config Override ────────────────────────────────────────────────────────

/**
 * Load OMC agent overrides from config.
 */
function loadConfigOverrides(projectRoot: string): OmcAgent[] | null {
  const configPath = join(projectRoot, '.claude', 'omcsa.config.json');
  if (!existsSync(configPath)) return null;

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (!config.omcAgents || !Array.isArray(config.omcAgents)) return null;
    return config.omcAgents as OmcAgent[];
  } catch {
    return null;
  }
}

// ─── Main Scanner ───────────────────────────────────────────────────────────

/**
 * Scan for OMC agents using multi-strategy approach.
 *
 * Priority:
 * 1. Config override (omcsa.config.json → omcAgents)
 * 2. Dynamic discovery from OMC plugin
 * 3. Fallback to known agents registry
 */
export function scanOmcAgents(projectRoot: string): OmcScanResult {
  // 1. Config override
  const configAgents = loadConfigOverrides(projectRoot);
  if (configAgents && configAgents.length > 0) {
    return { agents: configAgents, source: 'config' };
  }

  // 2. Dynamic discovery
  const dynamicAgents = discoverFromPlugin();
  if (dynamicAgents && dynamicAgents.length > 0) {
    return { agents: dynamicAgents, source: 'dynamic' };
  }

  // 3. Fallback registry
  const { agents, version } = loadFallbackRegistry();
  return { agents, source: 'fallback', registryVersion: version };
}

/**
 * Filter OMC agents to only those covering categories not already
 * covered by custom agents.
 */
export function getSupplementaryOmcAgents(
  omcAgents: OmcAgent[],
  customCategories: Set<AgentCategory>,
): OmcAgent[] {
  // Include OMC agents for categories not covered by custom agents
  return omcAgents.filter(omc => !customCategories.has(omc.category));
}

/**
 * Build a coverage matrix showing which categories are covered
 * by custom agents, OMC agents, or both.
 */
export function buildCoverageMatrix(
  customCategories: Set<AgentCategory>,
  omcCategories: Set<AgentCategory>,
): Array<{ category: AgentCategory; custom: boolean; omc: boolean }> {
  const allCategories: AgentCategory[] = ['implementation', 'review', 'testing', 'exploration', 'other'];

  return allCategories
    .filter(cat => customCategories.has(cat) || omcCategories.has(cat))
    .map(cat => ({
      category: cat,
      custom: customCategories.has(cat),
      omc: omcCategories.has(cat),
    }));
}
