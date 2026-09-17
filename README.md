# CadenceAI

CadenceAI is a continuous terminal assistant that routes each request to the right level of effort: direct conversation, read-only investigation, engineering, review, QA, planning, release assessment, or handoff.

It runs authenticated Claude Code, Codex, and OpenCode commands already installed on your machine. CadenceAI does not require model API keys of its own, and routing decisions are made locally without spending a model call.

> Status: internal alpha. The terminal product is functional and intended for trusted developer testing. Cross-repository work is planning-only, and public packaging is not finalized.

## What it does

Ask naturally:

```text
What does this error mean?
Summarize ELM-2851
Implement the approved requirements for ELM-2851
Assess ELM-2851 against its linked pull requests
Plan a better developer onboarding experience
```

CadenceAI classifies the request locally, shows the selected path, and requires a confirmation preflight before multi-model work or code modification.

| Workflow | Use it for | Planned calls by default |
| --- | --- | ---: |
| Chat | Normal questions with the selected model | 1 |
| Explore | Repository, Linear, or GitHub investigation | 1 |
| Engineering | Risk-adaptive, test-first implementation | 1–5 plus optional context |
| PR review | Correctness, security, maintainability, and test gaps | 6 |
| Ticket QA | Requirements versus linked PR and CI evidence | 6 |
| Ticket refinement | Development-ready requirements and acceptance criteria | 3 |
| Release readiness | Scope, implementation, operations, and go/no-go decision | 6 |
| Challenged planning | Product, UX, engineering, commercial, and adversarial perspectives | 6 |
| Cross-repository planning | Contracts, dependencies, compatibility, and rollout order | 6 |
| Session handoff | Durable continuation brief | 1 |

## Install

CadenceAI requires Node.js 20 or newer, Git, and at least one authenticated agent CLI.

```bash
curl -fsSL https://raw.githubusercontent.com/thisismayank/cadenceai/master/scripts/install.sh | bash
cadenceai setup
cadenceai doctor
```

The installer uses a dedicated checkout under `$HOME/.local/share/cadenceai`, links `cadenceai` and `cadence` under `$HOME/.local/bin`, and refuses to replace unrelated commands.

To inspect the installer first:

```bash
git clone https://github.com/thisismayank/cadenceai.git
cd cadenceai
CADENCEAI_INSTALL_ROOT="$PWD" ./scripts/install.sh
```

CadenceAI uses credentials managed by Claude Code, Codex, or OpenCode. It does not read or store those credentials.

## First five minutes

```bash
cd /path/to/your/project
cadenceai
```

The first launch in a project displays a zero-cost tour. You can reopen it with `/tour`.

Inside the terminal:

```text
What does this error mean?
/explore Summarize ELM-2851
/refine ELM-2851
/pipeline Implement the approved ELM-2851 requirements
/qa ELM-2851
/handoff
```

Type `/` to see command suggestions and press Tab to complete the first match. Use:

- `/help` for every command;
- `/help qa` or `/help refine` for purpose, cost, safety, and examples;
- `/quickstart` for the five-minute walkthrough;
- `/pipelines` to inspect configured stage sequences;
- `Ctrl+L` to focus and expand the active stage sidebar.

See the [Starter quickstart](./docs/QUICKSTART.md) and [ticket-to-handoff walkthrough](./docs/WALKTHROUGH.md) for copyable journeys.

## Workflow commands

```text
/chat <question>       Direct conversation without tools
/explore <request>     Read-only repository and connector research
/pipeline <task>       Engineering with Git safety and verification
/review <PR>           Independent pull-request review
/qa <ticket>           Requirements-to-implementation assessment
/refine <ticket>       Pre-development requirement refinement
/release <scope>       Release readiness and go/no-go report
/plan <proposal>       Multi-perspective challenged plan
/crossrepo <change>    Read-only multi-repository coordination plan
/handoff [focus]       Save a local continuation brief
```

Natural-language routing works without slash commands. Slash commands are available when you want an explicit route.

## Safety model

- Normal chat has tools disabled where the underlying runner supports it.
- Exploration, review, QA, refinement, release, planning, and cross-repository discovery are read-only.
- Retrieved tickets, comments, diffs, and documents are treated as untrusted source material.
- Engineering requires a Git repository with a clean working tree, shows a call-count preflight, and checks Git again immediately before execution.
- CadenceAI never commits, pushes, reverts, deletes, posts comments, or changes tickets automatically.
- Cross-repository mode does not mutate repositories. Launch from a shared parent directory when sibling repositories must be inspected.
- Handoffs are stored under `.cadence/handoffs/`; common credential shapes are redacted from the durable file.
- Sessions and the usage ledger stay under `.cadence/`, which is ignored by Git.

## Models, budgets, and plan limits

Use `/models` and `/model <alias>` to choose the normal-chat model. Pipeline stages use capability profiles with ordered Claude, Codex, or OpenCode fallbacks.

Starter setup defaults to Economy engineering and a maximum of six planned model calls per task:

```text
/budget economy
/limit 6
/usage
```

`/usage` is a local activity ledger, not an authoritative provider subscription balance. Quota-like failures place the provider on a temporary in-process cooldown and preserve the request for `/retry`.

## Linear and GitHub context

CadenceAI delegates connected retrieval to the authenticated underlying CLI. If Claude or Codex already has a Linear MCP connection, requests such as `Summarize ELM-2851`, `/refine ELM-2851`, and `/qa ELM-2851` can reuse it.

GitHub pull-request evidence is inspected through read-only `gh` commands. QA and release workflows distinguish reported CI evidence from tests actually executed locally.

## Configuration

Run `/config init` to create a shareable `.cadenceai.json` in the current project. Edit it to change:

- chat aliases and defaults;
- ordered models for each capability profile;
- default engineering budget and per-task call ceiling;
- risk keywords;
- engineering verification commands;
- stages and models for review, QA, refinement, release, planning, cross-repository, and handoff workflows.

Run `/config reload` after editing. Personal defaults can live at `~/.config/cadenceai/config.json`; project settings take precedence. Credentials remain in the provider CLIs rather than CadenceAI configuration.

## Updating and troubleshooting

```bash
cadenceai doctor
cadenceai update
```

`doctor` checks installation and authentication with remediation commands. `update` prints checkout-aware, fast-forward-only instructions and never updates in the background.

Inside the TUI, use `/retry` after a provider failure and `/doctor` for runtime diagnostics.

## Development

The active product lives in `apps/cli`; model routing and CLI adapters live in `packages/agents`. Other workspace packages are experimental and are not required to run the terminal product.

```bash
git clone git@github.com:thisismayank/cadenceai.git
cd cadenceai
pnpm install
pnpm validate
./apps/cli/dist/index.js
```

## Maintainer handbook

- [Architecture](./docs/ARCHITECTURE.md): runtime boundaries, lifecycle, persistence, and extension points.
- [Configuration](./docs/CONFIGURATION.md): precedence, profiles, pipelines, budgets, and guardrails.
- [Workflows](./docs/WORKFLOWS.md): behavior, cost, tools, outputs, and safety for every route.
- [Providers and connectors](./docs/PROVIDERS-AND-CONNECTORS.md): authentication, model routing, MCP, GitHub, fallbacks, and quotas.
- [Development](./docs/DEVELOPMENT.md): setup, validation, and common change recipes.
- [Troubleshooting](./docs/TROUBLESHOOTING.md): installation, authentication, connector, Git, quota, and retry failures.
- [Releases](./docs/RELEASES.md): protected-branch policy, release checklist, and rollback.
- [Roadmap](./docs/ROADMAP.md), [changelog](./CHANGELOG.md), and [contribution guide](./CONTRIBUTING.md).
- [Agent guidance](./AGENTS.md): product invariants and repository map for coding agents.

`SPEC.md` and `DECISIONS.md` describe the earlier hosted control-plane exploration. They remain as historical design context and are not the implementation contract for the current local CLI.

The project is currently an internal alpha. A public repository is not automatically open source: choose and add an explicit license before inviting unrestricted reuse or redistribution.
