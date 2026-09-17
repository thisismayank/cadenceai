# CadenceAI

Self-hosted control plane for agent-assisted software engineering. CadenceAI turns a task into an evidence-backed, verify-before-merge workflow.

**Status:** Internal alpha foundation. CRUD, state machine, analyzer contract, and mock workflow only. No production agents yet.

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

CadenceAI intentionally has two interfaces backed by the same API:

- **Web UI:** the evidence and trust surface for stage timelines, plans, diffs, test reports, findings, cost, and approvals.
- **CLI (planned):** the fast control surface for submitting, watching, retrying, cancelling, and approving executions from a terminal or CI job.

The UI is not an agent chat interface. The terminal is not expected to render large review artifacts. Keeping those responsibilities separate lets developers stay in their normal workflow without sacrificing reviewability for teams.

The internal-alpha workflow is:

```text
Task → Analyzer → Implementer → Tester → Adversarial → Human approval → Draft PR
```

The analyzer emits a typed execution plan using capability profiles such as `coding`, `fast_judge`, and `adversarial_reasoner`. Provider-specific model names are resolved later by adapters and are not embedded in workflow definitions.

## Local agent CLIs

CadenceAI is being built to use existing authenticated coding-agent commands rather than requiring model API keys. The agent package currently includes:

- Codex CLI diagnostics and noninteractive execution with model, reasoning, sandbox, JSONL, and schema controls.
- Claude Code diagnostics and noninteractive execution with model, effort, permissions, allowed tools, and schema controls.
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

- Send the first message to run the analyzer through the capability router.
- Type `/doctor` to inspect installed versions and authentication for Codex and Claude.
- Press `Ctrl+L` to focus the cadence sidebar, use the arrow keys to select a stage, and press Enter to expand its details and streamed events.
- Type `/stages` to focus the same navigator or `/exit` to close the session.

Sessions are append-only JSONL files under `.cadence/sessions/` in the target project. The directory is local and ignored by Git.

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
