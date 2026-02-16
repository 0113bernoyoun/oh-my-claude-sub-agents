/**
 * Config Loader
 *
 * Loads and merges OMCSA configuration from omcsa.config.json.
 * Falls back to defaults when config file doesn't exist.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  OmcsaConfig,
  DEFAULT_CONFIG,
  DiscoveredAgent,
  AgentConfig,
  ModelTier,
} from './types.js';
import { generateSuggestedWorkflows } from './workflow-generator.js';

const CONFIG_FILENAME = 'omcsa.config.json';

/**
 * Load config from the project directory.
 * Returns DEFAULT_CONFIG if no config file exists.
 */
export function loadConfig(projectRoot: string): OmcsaConfig {
  const configPath = join(projectRoot, '.claude', CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content) as Partial<OmcsaConfig>;
    return mergeConfig(DEFAULT_CONFIG, userConfig);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Deep merge user config with defaults.
 */
function mergeConfig(defaults: OmcsaConfig, user: Partial<OmcsaConfig>): OmcsaConfig {
  return {
    agents: user.agents ?? defaults.agents,
    features: {
      ...defaults.features,
      ...user.features,
    },
    keywords: {
      ...defaults.keywords,
      ...user.keywords,
    },
    persistence: {
      ...defaults.persistence,
      ...user.persistence,
    },
    maturity: user.maturity ?? defaults.maturity,
    workflows: user.workflows,
  };
}

/**
 * Generate a config file from discovered agents.
 */
export function generateConfig(agents: DiscoveredAgent[]): OmcsaConfig {
  const agentConfigs: Record<string, AgentConfig> = {};

  for (const agent of agents) {
    agentConfigs[agent.name] = {
      tier: agent.tier as ModelTier,
      category: agent.category,
    };
  }

  const workflows = generateSuggestedWorkflows(agents);

  return {
    agents: agentConfigs,
    features: { ...DEFAULT_CONFIG.features },
    keywords: { ...DEFAULT_CONFIG.keywords },
    persistence: { ...DEFAULT_CONFIG.persistence },
    workflows: Object.keys(workflows).length > 0 ? workflows : undefined,
  };
}

/**
 * Write config file to project directory.
 */
export function writeConfig(projectRoot: string, config: OmcsaConfig): void {
  const configPath = join(projectRoot, '.claude', CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Apply agent config overrides from config file to discovered agents.
 */
export function applyConfigOverrides(
  agents: DiscoveredAgent[],
  config: OmcsaConfig,
): DiscoveredAgent[] {
  if (!config.agents) return agents;

  return agents.map(agent => {
    const override = config.agents?.[agent.name];
    if (!override) return agent;

    return {
      ...agent,
      tier: override.tier ?? agent.tier,
      category: override.category ?? agent.category,
    };
  });
}
