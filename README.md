# CadenceAI

Self-hosted control plane for agent-assisted software engineering. CadenceAI turns a task into an evidence-backed, verify-before-merge workflow.

**Status:** Internal alpha. The local terminal interface can use authenticated Codex and Claude CLIs for direct conversation and pipeline planning; workflow execution is still under development.

See [`SPEC.md`](./SPEC.md) for the V1 spec and [`DECISIONS.md`](./DECISIONS.md) for the resolved V1 decision tree.

---

## Stack

- **Web + API + Inngest handler:** Next.js on Vercel
- **DB:** Neon Postgres via Drizzle ORM
- **Workflow engine:** Inngest
- **Sandbox (Phase 1):** E2B
- **Agent runner (Phase 1):** Claude Code CLI inside sandbox

Monorepo via pnpm workspaces.

## Product surfaces

CadenceAI has two complementary interfaces:

- **Web UI:** the evidence and trust surface for stage timelines, plans, diffs, test reports, findings, cost, and approvals.
- **CLI:** a continuous assistant for normal developer Q&A and the fast control surface for pipeline work.

The terminal adapts to the request. Questions receive direct answers; clear implementation requests activate an inspectable, test-first cadence. Large review artifacts can still live in the web evidence surface.

The internal-alpha workflow is:

```text
Task → Analyzer → Implementer → Tester → Adversarial → Human approval → Draft PR
```

The analyzer emits a typed execution plan using capability profiles such as `coding`, `fast_judge`, and `adversarial_reasoner`. Provider-specific model names are resolved later by adapters and are not embedded in workflow definitions.

## Local agent CLIs

CadenceAI is being built to use existing authenticated coding-agent commands rather than requiring model API keys. The agent package currently includes:

- Codex CLI diagnostics and noninteractive execution with model, reasoning, sandbox, JSONL, and schema controls.
- Claude Code diagnostics and noninteractive execution with model, effort, permissions, allowed tools, and schema controls.
- OpenCode diagnostics and noninteractive execution, allowing configured provider/model pairs such as DeepSeek, Kimi, or local models to participate without CadenceAI owning their credentials.
- Capability-based model routing with ordered fallback candidates.

Authenticate with the vendor CLIs themselves (`codex login` and `claude auth login`). CadenceAI does not read or store their credentials.

## Terminal interface

The primary CadenceAI interface is a continuous terminal conversation. During development, launch it from the repository root:

```bash
pnpm --filter @cadenceai/cli build
./apps/cli/dist/index.js
```

Or run the TypeScript development entrypoint:

```bash
pnpm cli
```

Pass a project directory or resume the latest local session:

```bash
./apps/cli/dist/index.js /path/to/project
./apps/cli/dist/index.js --continue
```

Inside the TUI:

- Ask an ordinary question to get a direct answer without activating agents or repository tools.
- Ask CadenceAI to fetch or summarize a Linear ticket to use the underlying runner's existing MCP connection read-only.
- Describe a clear implementation task (for example, `implement ENG-123`) to resolve connected context and activate a risk-sized test-first pipeline.
- Ask it to review a pull request to run an independent, read-only review cadence over the real diff.
- Use `/chat <question>` or `/pipeline <task>` to override automatic routing once.
- Use `/explore <request>` to force connected, read-only exploration or `/review <PR>` to force the review pipeline.
- Use `/mode auto`, `/mode chat`, or `/mode pipeline` to control routing for subsequent messages.
- Use `/models` and `/model <alias>` to select the model used for ordinary conversation. Direct OpenCode references use `/model opencode/<provider>/<model>`.
- Use `/budget economy`, `/budget balanced`, or `/budget thorough` to control engineering depth. Balanced is the default.
- Type `/usage` to view CadenceAI's local seven-day activity ledger and active provider cooldowns. It is not a provider quota balance.
- Referential requests such as `implement that` locally freeze recent substantive conversation into the engineering preflight. Use `/context view` to inspect the full capsule or `/context none` to remove it.
- Type `/doctor` to inspect installed versions and authentication for Claude, Codex, and OpenCode.
- Press `Ctrl+L` to focus the cadence sidebar, use the arrow keys to select a stage, and press Enter to expand its details and streamed events.
- Type `/stages` to focus the same navigator, `/new` to clear the active cadence, or `/exit` to close the session.

After linking the package globally, launch it from any project with either `cadenceai` or `cadence`.

Sessions are append-only JSONL files under `.cadence/sessions/` in the target project. The directory is local and ignored by Git.

## Routing and risk

CadenceAI separates the requested outcome from its context:

| Intent | Behavior |
| --- | --- |
| Conversation | Direct response from the selected chat model, with tools disabled where the runner supports it |
| Exploration | Read-only repository and configured MCP tools |
| Engineering | Optional connected-context resolution followed by risk-adaptive investigation, test design, implementation, deterministic verification, adversarial review, and human review |
| Pull-request review | Read-only evidence collection followed by requirements, correctness, test-gap, adversarial, and synthesis stages |

Engineering tasks are classified as low, medium, or high risk. Low-risk work uses a shorter cadence; security, authentication, billing, permissions, migrations, and other configured high-risk areas receive the full adversarial cadence.

Engineering requests stop at a local preflight before invoking a model. The preflight shows the expected model-call count, deterministic stages, and selected cadence; press Enter to proceed, change `/budget`, or `/cancel`. Economy minimizes calls, Balanced adds independent reasoning according to risk, and Thorough uses every configured stage. High-risk Economy work still retains analyzer and adversarial scrutiny.

When an engineering request refers to prior discussion, CadenceAI captures up to eight recent substantive turns within a bounded local context capsule. Interface messages and previous preflights are excluded, `/new` forms a hard context boundary, and explicit ticket or risk signals in the capsule influence connected-context resolution and risk selection. The frozen capsule is shown before execution and prior assistant statements are labeled as untrusted proposals that agents must verify.

Quota-like provider errors activate a temporary in-process cooldown, allowing the router to fall back without repeatedly retrying an exhausted provider. Successful calls are recorded locally in `.cadence/usage.jsonl`.

Routing itself is local and does not spend a model call. CadenceAI shows the selected path immediately (for example, `Connected → claude/sonnet → Linear ENG-123`), streams direct-chat output, caches CLI authentication checks briefly, and remembers the last successful connected runner per capability. Direct conversations resume provider sessions when Claude, Codex, or OpenCode exposes a session identifier; connected read-only lookups remain isolated one-shot sessions.

## Model and pipeline configuration

Run `/config init` inside the TUI to create a shareable `.cadenceai.json` in the target project. Edit it to change:

- normal-chat aliases and defaults;
- the default budget mode;
- ordered model candidates for each capability profile;
- keywords used by the risk classifier;
- stages selected for low-, medium-, and high-risk engineering tasks;
- automatic or explicit deterministic verification commands;
- pull-request review stages and their model profiles.

Run `/config reload` after editing. A personal override can also live at `~/.config/cadenceai/config.json`; project settings take precedence. Configuration is validated before it is activated. Credentials remain in Claude, Codex, OpenCode, and their MCP/provider configuration rather than in `.cadenceai.json`.

## Repository structure

```text
cadenceai/
├── apps/
│   └── web/                # Next.js app (dashboard + API + Inngest handler)
└── packages/
    ├── db/                 # Drizzle schema + client
    ├── schemas/            # Zod schemas + state machine
    ├── workflows/          # Inngest functions
    ├── agents/             # AgentProvider interface + Mock
    ├── sandboxes/          # SandboxProvider interface + Mock
    └── shared/             # env + common types
```

---

## Local dev

Requires Node 20+ and pnpm 11+.

```bash
# 1. Install (already done if you cloned after Phase 0)
pnpm install

# 2. Copy env template and fill in DATABASE_URL at minimum
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local:
#   DATABASE_URL=postgres://…neon.tech/neondb?sslmode=require
#   CADENCEAI_MASTER_KEY=$(openssl rand -hex 32)

# 3. Push schema to your Neon DB (or a local Postgres)
DATABASE_URL="…" pnpm db:generate   # creates SQL migrations from Drizzle schema
DATABASE_URL="…" pnpm db:migrate    # applies them

# 4. Start the app
pnpm dev
# → http://localhost:3000

# 5. In a second terminal, start the Inngest dev server
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
# → http://localhost:8288
```

## Typecheck

```bash
pnpm -r typecheck
```

---

## What Phase 0 does

- Create a Task via the UI or API.
- Create an Execution for that Task.
- Execution runs a **mock** Inngest workflow that walks through the state machine (Implementer → Tester → Adversarial → AwaitingApproval → CreatingPR → Completed) with fake delays. No agents, no sandbox, no diff.
- Dashboard shows Task list, Execution list, and per-execution state timeline.

Phase 1 replaces the mock workflow with real Impl / Test / Adv stages backed by E2B + Claude Code CLI.

---

## What Phase 0 explicitly does NOT do

See [`DECISIONS.md`](./DECISIONS.md) §"What V1 Explicitly Does NOT Include" for the full list. TL;DR: no agents, no sandbox execution, no GitHub PR creation, no confidence score computation, no auth, no cost tracking.
