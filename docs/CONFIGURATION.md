# Configuration reference

## Locations and precedence

CadenceAI builds one configuration by recursively merging:

1. built-in defaults from `apps/cli/src/config.ts`;
2. `~/.config/cadenceai/config.json`;
3. `<project>/.cadenceai.json`.

Project values win. Arrays replace earlier arrays; objects merge by key. Run `/config reload` after editing a project file.

Create a complete project configuration with:

```text
/config init
```

Run `cadenceai setup` to update only personal chat, budget, and guardrail preferences while preserving unrelated settings.

## Top-level shape

```json
{
  "version": 1,
  "budget": {
    "defaultMode": "economy"
  },
  "guardrails": {
    "maxModelCallsPerTask": 6
  },
  "chat": {
    "defaultModel": "auto",
    "models": {}
  },
  "profiles": {},
  "risk": {
    "highKeywords": [],
    "lowKeywords": []
  },
  "pipelines": {}
}
```

Partial override files are supported because they merge with defaults. Every loaded file must still contain `"version": 1` after merging.

## Budget

`budget.defaultMode` is `economy`, `balanced`, or `thorough`. It controls engineering depth only. Review, QA, refinement, release, planning, cross-repository, and handoff workflows retain their configured stage orders.

- Economy minimizes model calls and uses local classification where possible.
- Balanced adds independent reasoning according to risk.
- Thorough runs every configured stage for the engineering risk level.

High-risk Economy engineering keeps analyzer and adversarial scrutiny.

## Guardrails

`guardrails.maxModelCallsPerTask` is `null` or an integer from 1 through 50.

The value counts planned logical model stages, including connected evidence collection. Provider fallback attempts can occur when a candidate is unavailable or fails. The guardrail is checked before the preflight and again before execution.

Use `/limit <number>` or `/limit off` for a session-only override.

## Chat model selection

```json
{
  "chat": {
    "defaultModel": "auto",
    "models": {
      "claude-sonnet": { "cli": "claude", "model": "sonnet", "effort": "low" },
      "codex-terra": { "cli": "codex", "model": "gpt-5.6-terra", "effort": "low" }
    }
  }
}
```

`defaultModel` can be `auto`, a configured alias, or a direct `opencode/<provider>/<model>` selection. Inside the TUI, `/models` lists aliases and `/model <selection>` changes the current session.

Allowed runner names are `claude`, `codex`, and `opencode`. Allowed effort values are `low`, `medium`, `high`, `xhigh`, and `max`.

## Capability profiles

Each profile is an ordered candidate list. The router tries candidates in order while respecting installation, authentication, and temporary cooldowns.

```json
{
  "profiles": {
    "conversation": [
      { "cli": "claude", "model": "sonnet", "effort": "low" },
      { "cli": "codex", "model": "gpt-5.6-terra", "effort": "low" }
    ],
    "connected_research": [
      { "cli": "claude", "model": "sonnet", "effort": "medium" }
    ]
  }
}
```

Required profile keys are:

- `conversation`
- `connected_research`
- `pull_request_review`
- `fast_classifier`
- `balanced_reasoner`
- `flagship_coder`
- `flagship_reasoner`
- `critical_escalation`

Stage configuration references profiles rather than provider-specific model names.

## Risk classification

`risk.highKeywords` and `risk.lowKeywords` are case-insensitive substring lists. High wins over low. Requests matching neither are medium risk.

Risk classification is local. It does not consume a model call.

## Pipeline stages

Every stage has:

```json
{
  "name": "Requirements critic",
  "detail": "Find ambiguity and missing behavior",
  "modelProfile": "balanced_reasoner"
}
```

`modelProfile` is a capability profile, `shell`, or `human`.

Ordered read-only pipelines use a `stages` object and an `order` array:

```json
{
  "pipelines": {
    "ticketRefinement": {
      "stages": {
        "collect": {
          "name": "Collect ticket",
          "detail": "Retrieve ticket evidence",
          "modelProfile": "connected_research"
        },
        "critique": {
          "name": "Requirements critic",
          "detail": "Find gaps",
          "modelProfile": "balanced_reasoner"
        },
        "synthesize": {
          "name": "Ready-for-development brief",
          "detail": "Create a testable brief",
          "modelProfile": "pull_request_review"
        },
        "human_review": {
          "name": "Human decision",
          "detail": "Approve or revise",
          "modelProfile": "human"
        }
      },
      "order": ["collect", "critique", "synthesize", "human_review"]
    }
  }
}
```

The configurable keys are:

- `engineering`
- `pullRequestReview`
- `qualityAssurance`
- `ticketRefinement`
- `releaseReadiness`
- `planning`
- `crossRepository`
- `handoff`

The workflow executor relies on semantic stage IDs such as `collect`, `synthesize`, and workflow-specific IDs when selecting prompt contracts. Rename display names freely; change IDs only with corresponding code and tests.

## Engineering pipeline

Engineering differs because its stage set is selected by risk:

```json
{
  "pipelines": {
    "engineering": {
      "stages": {},
      "riskStages": {
        "low": ["analyze", "implement", "verify", "human_review"],
        "medium": ["analyze", "investigate", "test_design", "implement", "verify", "human_review"],
        "high": ["analyze", "investigate", "test_design", "implement", "verify", "adversarial", "human_review"]
      },
      "verificationCommands": "auto"
    }
  }
}
```

`verificationCommands` is `"auto"` or an explicit list:

```json
[
  { "command": "pnpm", "args": ["test"], "label": "tests" },
  { "command": "pnpm", "args": ["typecheck"], "label": "typecheck" }
]
```

Commands run without a shell and should be repository-local, deterministic, and noninteractive.

## Safe customization procedure

1. Run `/config init`.
2. Change one pipeline or profile.
3. Run `/config reload` and resolve validation errors.
4. Run `/pipelines` to inspect effective orders.
5. Submit a representative request and inspect the preflight call count.
6. Keep the project override in version control if the whole team should share it.

Never place credentials in `.cadenceai.json`.
