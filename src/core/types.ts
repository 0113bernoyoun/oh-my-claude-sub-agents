/**
 * Core type definitions for oh-my-claude-sub-agents
 */

// ─── Install Mode Types ─────────────────────────────────────────────────────

export type InstallMode = 'standalone' | 'omc-only' | 'integrated';

// ─── Agent Types ─────────────────────────────────────────────────────────────

export type ModelName = 'haiku' | 'sonnet' | 'opus';
export type ModelTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'DEFAULT';
export type AgentCategory = 'implementation' | 'review' | 'testing' | 'exploration' | 'other';
export type AgentScope = 'global' | 'project';

export interface AgentFrontmatter {
  name?: string;
  description?: string;
  model?: ModelName;
  disallowedTools?: string[];
  [key: string]: unknown;
}

export interface DiscoveredAgent {
  name: string;
  description: string;
  model: ModelName | undefined;
  tier: ModelTier;
  category: AgentCategory;
  scope: AgentScope;
  filePath: string;
  disallowedTools?: string[];
}

// ─── Config Types ────────────────────────────────────────────────────────────

export type DelegationEnforcementLevel = 'off' | 'warn' | 'strict';

export interface AgentConfig {
  tier?: ModelTier;
  category?: AgentCategory;
}

export interface FeaturesConfig {
  ultrawork?: boolean;
  ralph?: boolean;
  delegationEnforcement?: DelegationEnforcementLevel;
  modelTiering?: boolean;
}

export interface KeywordsConfig {
  ultrawork?: string[];
  ralph?: string[];
  cancel?: string[];
}

export interface PersistenceConfig {
  maxIterations?: number;
  stateDir?: string;
}

export interface MaturityConfig {
  mode?: MaturityMode;
}

export interface OmcsaConfig {
  agents?: Record<string, AgentConfig>;
  features?: FeaturesConfig;
  keywords?: KeywordsConfig;
  persistence?: PersistenceConfig;
  maturity?: MaturityConfig;
  workflows?: WorkflowsConfig;
}

// ─── Hook Types ──────────────────────────────────────────────────────────────

export interface HookInput {
  sessionId?: string;
  prompt?: string;
  message?: { content?: string };
  parts?: Array<{ type: string; text?: string }>;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  directory?: string;
  stop_reason?: string;
  stopReason?: string;
  user_requested?: boolean;
  userRequested?: boolean;
}

export interface HookOutput {
  continue: boolean;
  message?: string;
  reason?: string;
}

export type DetectedMode = 'ultrawork' | 'ralph' | 'cancel' | null;

// ─── State Types ─────────────────────────────────────────────────────────────

export interface PersistentState {
  active: boolean;
  mode: 'ralph' | 'ultrawork';
  iteration: number;
  maxIterations: number;
  prompt: string;
  sessionId: string;
  startedAt: string;
}

// ─── Maturity Types ─────────────────────────────────────────────────────────

export type MaturityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type MaturityMode = 'auto' | 'full' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface MaturitySignals {
  agentNameReferences: number;
  workflowKeywords: number;
  taskToolUsage: number;
  delegationPatterns: number;
}

export interface MaturityResult {
  level: MaturityLevel;
  signals: MaturitySignals;
  compositeScore: number;
  details: string[];
}

// ─── OMC Agent Types ────────────────────────────────────────────────────────

export interface OmcAgent {
  name: string;
  fullName: string;
  description: string;
  category: AgentCategory;
}

// ─── Diagnostics Types ──────────────────────────────────────────────────────

export type DiagnosticSeverity = 'ok' | 'warn' | 'error' | 'info';

export interface DiagnosticResult {
  name: string;
  severity: DiagnosticSeverity;
  message: string;
  fix?: string;
  fixAction?: () => void;
}

export interface DoctorReport {
  results: DiagnosticResult[];
  maturity?: MaturityResult;
  suggestions: string[];
}

// ─── Dry Run Types ──────────────────────────────────────────────────────────

export type ChangeType = 'create' | 'modify' | 'delete';

export interface FileChange {
  path: string;
  changeType: ChangeType;
  description: string;
  before?: string;
  after?: string;
}

export interface DryRunReport {
  changes: FileChange[];
  mode: InstallMode;
  agentCount: number;
  omcDetected: boolean;
}

// ─── Prompt Generation Types ─────────────────────────────────────────────────

export interface PromptOptions {
  config?: OmcsaConfig;
  omcDetected?: boolean;
  maturityLevel?: MaturityLevel;
  mode?: InstallMode;
  omcAgents?: OmcAgent[];
}

export interface PromptGenerationOptions {
  agents: DiscoveredAgent[];
  config?: OmcsaConfig;
}

// ─── Log Types ──────────────────────────────────────────────────────────────

export interface AgentLogEntry {
  agent: string;
  model: string;
  description: string;
  timestamp: string;
  sessionId: string;
}

// ─── Workflow Types ──────────────────────────────────────────────────────────

export type WorkflowMode = 'sequential';

export interface WorkflowDefinition {
  steps: string[];
  mode: WorkflowMode;
}

export type WorkflowsConfig = Record<string, WorkflowDefinition>;

export interface WorkflowState {
  active: boolean;
  workflowName: string;
  steps: string[];
  currentStepIndex: number;
  completedSteps: string[];
  sessionId: string;
  startedAt: string;
  lastUpdatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const MODEL_TIER_MAP: Record<ModelName, ModelTier> = {
  haiku: 'LOW',
  sonnet: 'MEDIUM',
  opus: 'HIGH',
};

export const DEFAULT_CONFIG: OmcsaConfig = {
  features: {
    ultrawork: true,
    ralph: true,
    delegationEnforcement: 'warn',
    modelTiering: true,
  },
  keywords: {
    ultrawork: ['ultrawork', 'ulw'],
    ralph: ['ralph', 'must complete', 'until done'],
    cancel: ['cancelomcsa', 'stopomcsa'],
  },
  persistence: {
    maxIterations: 10,
    stateDir: '.omcsa/state',
  },
};

export const OMCSA_MARKER_START = '<!-- [OMCSA:START] - Auto-generated by oh-my-claude-sub-agents. Do not edit manually. -->';
export const OMCSA_MARKER_END = '<!-- [OMCSA:END] -->';

/** Source file extensions that should trigger delegation warnings */
export const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.swift',
  '.vue', '.svelte', '.astro',
];

/** Tools that modify source code */
export const WRITE_EDIT_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

/** Paths the orchestrator is always allowed to modify */
export const ALLOWED_PATH_PATTERNS = [
  /^\.omcsa\//,
  /^\.claude\//,
  /^\.omc\//,
  /^claudedocs\//,
  /\.md$/,
  /\.json$/,
  /\.ya?ml$/,
  /\.toml$/,
  /\.lock$/,
];
