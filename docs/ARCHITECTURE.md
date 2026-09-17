# Current architecture

## Scope

CadenceAI is currently a local terminal application. It orchestrates authenticated coding-agent CLIs and keeps its own state in local files. It does not require a server or database for the active product.

The active runtime is:

```text
apps/cli
  └─ terminal UI, local routing, workflows, preflights, sessions
       │
       ▼
packages/agents
  └─ Claude Code, Codex, and OpenCode adapters and fallback router
       │
       ▼
provider-managed authentication, repository tools, MCP connectors
```

Other workspace packages are experimental remnants of the earlier control-plane design and are not on the CLI execution path.

## Request lifecycle

```text
User input
  ↓
Local intent and risk classification
  ├─ chat → one selected conversation model, tools disabled
  ├─ explore → one isolated read-only connected call
  ├─ engineering → Git safety → call-count preflight → execution
  ├─ review / QA → read-only evidence → independent stages → report
  └─ refine / release / plan / crossrepo / handoff
       → workflow-specific preflight → configurable read-only stages
```

Routing in `task.ts` is deterministic and costs no model call. A user can override it with slash commands or `/mode`.

## Core modules

### Terminal application

`app.tsx` owns session-level interaction state:

- transcript and streaming output;
- pending preflights;
- workflow stage sidebar;
- selected chat model and engineering budget;
- retry preservation;
- command handling and contextual suggestions.

It delegates domain work rather than implementing model adapters itself.

### Configuration

`config.ts` defines `CadenceConfig`, default model policies, risk keywords, engineering stages, and all ordered read-only pipelines.

Configuration is merged in this order:

1. built-in defaults;
2. `~/.config/cadenceai/config.json`;
3. `<project>/.cadenceai.json`.

Later layers override earlier values recursively. The merged result is validated before use.

### Local routing

`task.ts` extracts Linear IDs and GitHub PR URLs, infers intent, assesses configured risk keywords, and decides whether connected tools are needed. It deliberately routes conservatively: ordinary questions remain chat unless the request clearly asks for another workflow.

### Model routing

`packages/agents/src/cli/router.ts` resolves a capability profile to ordered candidates. It:

- checks installation and authentication;
- reuses cached diagnostics;
- falls back between configured candidates;
- temporarily cools down providers after quota-like failures;
- preserves provider/model metadata in results.

`apps/cli/src/chat.ts` is the CLI-facing adapter to that router and records successful usage locally.

### Connected evidence

`context.ts` performs isolated read-only retrieval. It builds the narrow tool allowlist needed for the request, resists prompt injection from retrieved sources, remembers the last successful connected provider by capability, and packages source references for downstream stages.

Connected evidence calls are not resumable chat sessions. Direct chat can reuse provider conversation identifiers where the adapter supports it.

### Engineering

Engineering has a stronger mutation boundary than other workflows:

1. `git-safety.ts` requires a repository and clean worktree.
2. `budget.ts` selects stages from budget and risk.
3. The terminal displays context, calls, deterministic checks, and stages.
4. Git safety runs again after confirmation.
5. Optional connected evidence and analysis feed `engineering.ts`.
6. Model stages may modify the repository.
7. Shell verification runs configured or detected tests, typechecks, lint, and builds.
8. The final response reports Git state without committing or reverting.

### Read-only workflows

`workflow.ts` runs refinement, release, planning, cross-repository planning, and handoff pipelines from ordered configuration. Only the evidence stage can receive read-only tools; later stages operate on bounded prior evidence.

PR review and ticket QA have dedicated modules because their evidence contracts and outputs are more specialized.

### Local persistence

CadenceAI has no active database dependency.

```text
.cadence/
  sessions/<session-id>.jsonl   append-only conversation and stage events
  usage.jsonl                   successful routing activity
  handoffs/<timestamp>.md       redacted continuation briefs
```

The directory is ignored by Git. `/new` creates a logical context boundary inside the transcript; `--continue` resumes the latest session file.

## Security boundaries

- Provider credentials remain in provider-owned stores.
- Normal chat uses no tools.
- Read-only tools use explicit allowlists.
- Source content is labeled untrusted in prompts.
- External mutations are not implemented.
- Engineering mutations are scoped to the current clean repository.
- Handoff files apply deterministic redaction for common credential shapes.
- Call limits are checked at preflight and again immediately before execution.

## Extension points

- Add models by changing capability-profile candidate lists.
- Add a provider by implementing `CliAgentAdapter` and registering it in `chat.ts`.
- Add a read-only workflow through config, task routing, help, preflight integration, and `workflow.ts` stage instructions.
- Add deterministic verification by extending repository script detection or configuring explicit commands.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for exact procedures.
