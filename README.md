# oh-my-claude-sub-agents (OMCSA)

Your custom Claude Code agents deserve pro-level orchestration.
One command to turn your `.claude/agents/` into a coordinated team.

Inspired by [oh-my-claudecode](https://github.com/anthropics/claude-code).

[**한국어 README**](./README.ko.md)

---

## What This Does

If you have custom sub-agents defined in `.claude/agents/*.md`, OMCSA gives them:

- **Orchestrator prompt** — Claude automatically delegates to the right agent
- **Parallel execution** (Ultrawork mode) — run multiple agents simultaneously
- **Persistent loops** (Ralph mode) — keep working until truly done
- **Delegation enforcement** — prevent the orchestrator from doing work directly
- **Model tiering** — route to haiku/sonnet/opus based on agent config

All via a single `omcsa init`.

### OMC Coexistence (3-Mode System)

Already using [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (OMC)? OMCSA detects it automatically and offers three install modes to avoid hook conflicts:

| Mode | Description | OMCSA Hooks | OMCSA Prompt |
|------|-------------|-------------|--------------|
| `standalone` | OMCSA handles everything (default) | Active | Yes |
| `omc-only` | OMC handles modes, OMCSA adds agent orchestration | Yield | Yes |
| `integrated` | OMC + OMCSA agents fully integrated | Yield | Yes |

---

## Requirements

- **Node.js** >= 18
- **Claude Code** CLI installed and working
- Custom agents in `~/.claude/agents/` (global) and/or `.claude/agents/` (per-project)

---

## Installation

### Option A: Run directly with npx (no install needed)

```bash
cd your-project
npx oh-my-claude-sub-agents init
```

### Option B: Install globally

```bash
npm install -g oh-my-claude-sub-agents

# Now use anywhere
omcsa init
```

### Option C: Local development (from source)

```bash
git clone https://github.com/your-username/oh-my-claude-sub-agents.git
cd oh-my-claude-sub-agents
npm install
npm run build
npm link    # registers 'omcsa' command globally
```

---

## Quick Start

### 1. Make sure you have agents

OMCSA works with agent `.md` files that have YAML frontmatter:

```
~/.claude/agents/          ← global agents (all projects)
  code-reviewer.md
  test-writer.md

your-project/.claude/agents/   ← project-specific agents
  backend-dev.md
  frontend-dev.md
```

Each agent file looks like:

```markdown
---
description: Implement backend APIs and server logic
model: sonnet
---

You are a backend developer. Your role is to...
```

Supported frontmatter fields:

| Field | Required | Values | Description |
|-------|----------|--------|-------------|
| `description` | Recommended | any string | What this agent does |
| `model` | Optional | `haiku`, `sonnet`, `opus` | Model tier for Task tool |
| `disallowedTools` | Optional | tool names | Tools this agent cannot use |

### 2. Initialize OMCSA in your project

```bash
cd your-project
omcsa init
```

This will:
1. Scan `~/.claude/agents/` and `.claude/agents/` for all agent files
2. Detect OMC (oh-my-claudecode) if installed
3. Generate orchestrator prompt to `.claude/omcsa-agents.md` and add `@import` reference to `.claude/CLAUDE.md`
4. Install smart hook scripts into `.claude/hooks/`
5. Register hooks in `.claude/settings.json`
6. Save install mode to `.omcsa/mode.json`

If OMC is detected, you'll see an advisory suggesting `--mode integrated`.

### 3. Use Claude Code as normal

```bash
claude
```

Claude will now automatically delegate tasks to your agents.

---

## Usage Modes

### Normal Mode

Just use Claude Code normally. The orchestrator prompt guides Claude to delegate to your agents.

```
> Implement the user authentication API

# Claude delegates to backend-dev agent automatically
```

### Ultrawork Mode (Parallel Execution)

Prefix your prompt with `ultrawork:` or `ulw:` to run agents in parallel.

```
> ultrawork: Build the login page frontend and the auth API backend

# Claude launches frontend-dev and backend-dev simultaneously
```

### Ralph Mode (Persistent Loop)

Prefix with `ralph:` to keep Claude working until everything is truly complete.

```
> ralph: Implement the full checkout flow with tests and code review

# Claude keeps iterating until all tasks pass verification
```

### Cancel Active Mode

```bash
# From CLI
omcsa cancel

# Or in Claude Code prompt
> cancelomcsa
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `omcsa init` | Initial setup: scan agents, generate prompt to external file, install hooks |
| `omcsa init --config` | Same as init but also generates `omcsa.config.json` for fine-tuning |
| `omcsa init --mode <mode>` | Init with explicit mode: `standalone`, `omc-only`, or `integrated` |
| `omcsa init --output <mode>` | Output mode: `external` (default) or `inline` |
| `omcsa init --dry-run` | Preview init changes without applying them |
| `omcsa init --maturity <mode>` | Set maturity mode: `auto`, `full`, `LOW`, `MEDIUM`, or `HIGH` |
| `omcsa switch <mode>` | Switch install mode at runtime (no reinstall needed) |
| `omcsa status` | Show current configuration, OMC detection, and install mode |
| `omcsa status --logs` | Show today's full orchestration log |
| `omcsa status --clean-logs <N>` | Remove logs older than N days |
| `omcsa refresh` | Re-scan agents and regenerate orchestrator prompt |
| `omcsa refresh --maturity <mode>` | Re-scan with specified maturity mode |
| `omcsa refresh --output <mode>` | Refresh with specified output mode |
| `omcsa apply` | Re-apply config changes after editing `omcsa.config.json` |
| `omcsa apply --dry-run` | Preview apply changes without modifying files |
| `omcsa apply --maturity <mode>` | Apply with specified maturity mode |
| `omcsa apply --output <mode>` | Apply with specified output mode |
| `omcsa doctor` | Diagnose OMCSA installation and suggest fixes |
| `omcsa doctor --fix` | Auto-fix fixable issues |
| `omcsa workflow` | List configured workflows |
| `omcsa workflow add all` | Auto-generate workflows from agent categories |
| `omcsa workflow add <agents...>` | Add a custom workflow (name auto-generated) |
| `omcsa workflow rm <name>` | Remove a workflow |
| `omcsa cancel` | Cancel any active persistent mode (ralph/ultrawork/workflow) |
| `omcsa omc disable` | Disable OMC plugin globally (removes from `~/.claude/settings.json`) |
| `omcsa omc enable` | Re-enable OMC plugin (restore from backup) |
| `omcsa uninstall` | Remove all OMCSA components from the project |

---

## Configuration (Optional)

For fine-grained control, generate a config file:

```bash
omcsa init --config
```

This creates `.claude/omcsa.config.json`:

```json
{
  "agents": {
    "backend-dev": { "tier": "MEDIUM", "category": "implementation" },
    "code-reviewer": { "tier": "HIGH", "category": "review" },
    "test-writer": { "tier": "LOW", "category": "testing" }
  },
  "features": {
    "ultrawork": true,
    "ralph": true,
    "delegationEnforcement": "warn",
    "modelTiering": true,
    "outputMode": "external"
  },
  "keywords": {
    "ultrawork": ["ultrawork", "ulw"],
    "ralph": ["ralph", "must complete", "until done"],
    "cancel": ["cancelomcsa", "stopomcsa"]
  },
  "persistence": {
    "maxIterations": 10,
    "stateDir": ".omcsa/state"
  },
  "maturity": {
    "mode": "auto"
  }
}
```

After editing, run `omcsa apply` to regenerate.

### Smart Prompt (Maturity-Based)

OMCSA analyzes your CLAUDE.md to determine your orchestration maturity level and adjusts prompt detail accordingly.

**Default behavior**: `auto` mode detects your maturity score and generates an appropriately condensed prompt. Experienced users get shorter prompts automatically.

```
Maturity: MEDIUM (0.42) — Adaptive prompt generated (auto mode).
```

Use `--maturity full` if you want the full verbose prompt regardless of detected maturity:

```bash
omcsa init --maturity full     # Always generate full prompt
omcsa refresh --maturity full  # Re-scan with full prompt
```

**Maturity levels:**

| Level | Score | Prompt Style |
|-------|-------|-------------|
| LOW | < 0.25 | Full orchestration guide with examples and getting-started section |
| MEDIUM | 0.25 - 0.59 | Agent table + condensed rules + coverage gap analysis |
| HIGH | >= 0.60 | Minimal registry + mode keywords only |

**Persisting the setting** in `omcsa.config.json`:

```json
{
  "maturity": {
    "mode": "auto"
  }
}
```

Valid modes: `"auto"` (default), `"full"`, `"LOW"`, `"MEDIUM"`, `"HIGH"`

CLI flag `--maturity` overrides config.

### Output Modes

OMCSA supports two output modes for the generated orchestrator prompt:

| Mode | Description |
|------|-------------|
| `external` (default) | Writes orchestrator prompt to `.claude/omcsa-agents.md` and places an `@omcsa-agents.md` import reference inside CLAUDE.md. Keeps CLAUDE.md small (~99% reduction of the OMCSA section). |
| `inline` | Embeds the full orchestrator prompt directly inside CLAUDE.md between the OMCSA markers. This was the default behavior in earlier versions. |

Set via CLI flag or config:

```bash
omcsa init --output external   # Default — separate file with @import
omcsa init --output inline     # Legacy — embed directly in CLAUDE.md
```

Or persist in `omcsa.config.json`:

```json
{
  "features": {
    "outputMode": "external"
  }
}
```

### Delegation Enforcement Levels

| Level | Behavior |
|-------|----------|
| `off` | No restrictions |
| `warn` (default) | Warns when orchestrator tries to edit source files directly |
| `strict` | Blocks direct source file edits, forces delegation |

---

## Defining Agent Workflows

OMCSA respects workflows you define in `.claude/CLAUDE.md`.

The orchestrator prompt includes a **Workflow & Convention Integration** section that instructs Claude to follow all rules, workflows, and conventions written in your CLAUDE.md.

### Example

Write your workflows in `.claude/CLAUDE.md` (above or below the OMCSA section):

```markdown
## Team Workflow

- After `backend-dev` completes, route to `code-reviewer` for review
- `code-reviewer` feedback goes back to `backend-dev` for fixes
- `test-writer` runs after all implementation agents finish
- On completion, create a summary in `docs/completed/`
```

OMCSA's orchestrator will follow these rules automatically. No extra configuration needed.

### How It Works

1. Claude Code loads the full `.claude/CLAUDE.md` into its system prompt
2. Your workflow rules are visible to the orchestrator alongside the OMCSA section
3. The OMCSA prompt explicitly tells Claude: "Follow all workflow rules in this document"
4. Agent chaining happens at the orchestrator level (sub-agents can't call other agents)

---

## OMC Coexistence

If you have [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (OMC) installed as a global plugin, OMCSA automatically detects it and prevents hook conflicts.

### The Problem

OMC and OMCSA both register hooks on the same events (UserPromptSubmit, Stop, PreToolUse). Without coexistence mode, this causes:
- Double keyword detection (ultrawork/ralph triggered twice)
- Double Stop hook execution
- Conflicting delegation enforcement

### The Solution: Smart Hooks

OMCSA hooks are "smart" — they read `.omcsa/mode.json` at runtime and decide whether to execute or yield:

```
standalone mode  → OMCSA hooks execute normally
omc-only mode    → OMCSA hooks yield ({ continue: true })
integrated mode  → OMCSA hooks yield ({ continue: true })
```

Hooks are always installed regardless of mode. Switching modes only updates `mode.json` — no reinstallation needed.

### Agent Exclusivity (Standalone Mode)

When OMCSA detects OMC in standalone mode, the orchestrator prompt includes an **Agent Exclusivity** directive
that instructs Claude to ONLY use OMCSA-managed agents and ignore OMC's built-in agents (e.g. `oh-my-claudecode:architect`).

This is a prompt-level enforcement. For stronger isolation, use `omcsa omc disable` to remove OMC entirely.

### Integrated Mode Orchestration

In `integrated` mode, OMCSA creates a unified orchestration prompt with both custom and OMC agents:

- **Custom agents** are marked as PRIMARY and always take priority
- **OMC agents** are SUPPLEMENTARY and only used for categories not covered by custom agents
- A **Coverage Matrix** shows which categories are handled by which system

```bash
omcsa init --mode integrated
```

The prompt includes routing rules: Custom > OMC > Direct handling.

### Disabling OMC Plugin

For complete isolation from OMC agents, you can temporarily disable the OMC plugin:

```bash
# Disable OMC (removes from ~/.claude/settings.json)
omcsa omc disable

# Re-enable OMC (restores from backup)
omcsa omc enable
```

> **Warning**
>
> `omcsa omc disable` modifies your **global** `~/.claude/settings.json` file.
> This affects ALL projects and Claude Code sessions, not just the current project.
>
> - The disabled OMC plugin entry is backed up to `.omcsa/omc-backup.json`
> - Use `omcsa omc enable` to restore the original configuration
> - If the backup file is lost, you will need to manually re-add the OMC plugin
> - Always run `omcsa omc enable` before uninstalling OMCSA to restore OMC

### Usage

```bash
# Default: standalone (OMCSA does everything)
omcsa init

# With OMC: let OMC handle modes, OMCSA adds orchestration
omcsa init --mode integrated

# Switch mode at runtime (instant, no reinstall)
omcsa switch integrated
omcsa switch standalone

# Check current mode
omcsa status
```

### Mode Details

| | standalone | omc-only | integrated |
|---|---|---|---|
| CLAUDE.md orchestrator | Full | Prompt only | Prompt only |
| Hooks installed | Yes | Yes (yield) | Yes (yield) |
| settings.json | Yes | Yes | Yes |
| ultrawork/ralph | OMCSA | OMC | OMC |
| Agent delegation | OMCSA exclusive | OMC 28 + custom list | OMC + custom |

---

## What Gets Created

After `omcsa init`, your project will have:

```
your-project/
├── .claude/
│   ├── CLAUDE.md              ← @import reference added here
│   ├── omcsa-agents.md        ← orchestrator prompt (external mode)
│   ├── settings.json          ← hook registrations added here
│   ├── hooks/
│   │   ├── omcsa-keyword-detector.mjs    ← detects ultrawork/ralph keywords
│   │   ├── omcsa-persistent-mode.mjs     ← keeps ralph mode running
│   │   ├── omcsa-pre-tool-use.mjs        ← delegation enforcement
│   │   └── omcsa-post-tool-logger.mjs   ← agent delegation logger
│   └── agents/                ← your existing agents (untouched)
│       ├── backend-dev.md
│       └── ...
└── .omcsa/
    ├── mode.json              ← current install mode (standalone/omc-only/integrated)
    ├── omc-backup.json        ← OMC plugin backup (created by `omc disable`)
    ├── logs/                  ← agent delegation logs (JSONL, per-day)
    │   └── 2026-02-15.jsonl
    └── state/                 ← runtime state for persistent modes
```

### CLAUDE.md Markers

OMCSA only modifies content between its markers.

**External mode** (default) -- the markers contain a single `@import` reference, keeping CLAUDE.md small:

```markdown
# Your existing CLAUDE.md content (preserved)

<!-- [OMCSA:START] - Auto-generated by oh-my-claude-sub-agents. Do not edit manually. -->
@omcsa-agents.md
<!-- [OMCSA:END] -->

# More of your content (preserved)
```

The full orchestrator prompt lives in `.claude/omcsa-agents.md`.

**Inline mode** (`--output inline`) -- the markers contain the full prompt directly:

```markdown
<!-- [OMCSA:START] - Auto-generated by oh-my-claude-sub-agents. Do not edit manually. -->
## Agent Orchestration
...
<!-- [OMCSA:END] -->
```

Running `omcsa refresh` or `omcsa uninstall` only touches content between these markers.

---

## Agent File Examples

### Implementation Agent

```markdown
---
description: Implement React/Next.js frontend features
model: sonnet
---

You are a frontend developer specializing in React and Next.js.

## Your Role
- Implement UI components and pages
- Follow the project's component patterns
- Write clean, accessible JSX/TSX

## Constraints
- Work ALONE. Do not spawn other agents.
- Follow existing code conventions.
```

### Review Agent (Read-Only)

```markdown
---
description: Code review and quality verification
model: opus
disallowedTools: Write, Edit, MultiEdit
---

You are a senior code reviewer.

## Your Role
- Review code for correctness, security, and maintainability
- Provide actionable feedback with file:line references
- You are READ-ONLY. You cannot modify files.
```

### Lightweight Agent

```markdown
---
description: Write unit and integration tests
model: haiku
---

You are a test writer. Write comprehensive tests for the given code.
```

### Workflow Pipelines

OMCSA auto-generates workflow suggestions based on your agents' categories:

```bash
omcsa init
# Workflow pipelines available for your agents:
#     default: backend-dev -> code-reviewer -> test-writer

omcsa workflow add all          # Activate all suggested workflows
omcsa workflow add my-flow a b c  # Custom workflow
omcsa workflow rm my-flow       # Remove a workflow
```

When the first agent in a workflow is called, OMCSA auto-activates pipeline tracking.
After each step, a system message guides Claude to the next agent.

View progress: `omcsa status`
Cancel: `omcsa cancel`

---

## Subscription vs API Users

OMCSA works with both Claude Code subscription plans and API keys.

- **Model tiering**: If an agent specifies `model: opus` but your plan doesn't support it, Claude automatically falls back to the next available model
- **No API key required**: All features work through CLAUDE.md prompts and hooks
- **Rate limits**: Subscription users may hit rate limits with heavy parallel execution. Reduce concurrency if needed

---

## Diagnostics & Preview

### Doctor

Check your OMCSA installation health:

```bash
omcsa doctor
```

Output includes hook file checks, settings registration, mode validation, agent file validation, CLAUDE.md section integrity, maturity analysis, external file consistency (orphaned or missing `omcsa-agents.md`), and CLAUDE.md size warnings when inline mode exceeds 15KB.

Auto-fix supported issues:

```bash
omcsa doctor --fix
```

Safety rules:
- `mode.json` is never auto-fixed (use `omcsa switch` instead)
- Global `~/.claude/settings.json` is never modified
- Agent files: only frontmatter structure is fixed, not content

### Dry Run

Preview changes before applying:

```bash
omcsa init --dry-run     # Preview full init
omcsa apply --dry-run    # Preview apply changes
```

Shows which files would be created/modified and OMCSA section diff.

---

## Orchestration Logs

OMCSA automatically logs agent delegations via a PostToolUse hook. Every time Claude delegates to a sub-agent using the Task tool, the agent type, model, and description are recorded.

View the latest orchestration activity:

- `omcsa status` — shows last session summary at the bottom
- `omcsa status --logs` — shows today's full log
- `omcsa status --clean-logs 7` — remove logs older than 7 days

Logs are stored in `.omcsa/logs/` as JSONL files (one per day). Add `.omcsa/` to your `.gitignore` — it's already excluded by default.

---

## Uninstalling

```bash
omcsa uninstall
```

This removes:
- Hook scripts from `.claude/hooks/`
- OMCSA section from `.claude/CLAUDE.md`
- External prompt file `.claude/omcsa-agents.md` (if present)
- Hook registrations from `.claude/settings.json`
- State directory `.omcsa/`

Your agent files in `.claude/agents/` are never touched.

---

## License

MIT

Inspired by [oh-my-claudecode](https://github.com/anthropics/claude-code) (MIT License).
