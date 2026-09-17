# CadenceAI V1 — Resolved Decision Tree

Companion to `SPEC.md`. Every load-bearing V1 decision, in dependency order, with the alternative that was rejected.

Grilling session: 2026-08-28.

---

## 1. Who is the user of V1?

**Decision: single user (Mayank).**

- No workspaces, no invites, no billing, no per-user isolation.
- `workspace_id` columns exist in the schema and are hardcoded to `1` — keeps migrations painless when multi-tenancy comes back.
- GitHub PAT (not App). Localhost or private Vercel deployment.

**Rejected:** multi-tenant SaaS from day 1 (months of GitHub App onboarding, invite flow, billing before you learn anything about the differentiated part).

**Why it matters:** collapses the entire auth + permissions surface. Everything else gets simpler.

---

## 2. V1 pipeline shape

**Decision: 4 stages, not 7.**

```
Task → Implementer → Tester → Adversarial → Human Approval → PR
```

Skip Planner, Investigator, and (friendly) Reviewer for V1. The Adversarial Reviewer is a superset of a friendly reviewer; the Implementer already plans and investigates internally when it's Claude Code.

**Rejected:** the spec's full 7-stage pipeline. Rationale: the product thesis is "verification is scarce." The minimum test of that thesis is Implementer + Tester + Adversarial. Building four more agents before you know the adversarial reviewer catches real bugs is prospective waste.

**Add back when:** the adversarial reviewer produces high-signal findings on real bugs. Then Planner (routing/scoping), Investigator (parallel research), and Reviewer (non-adversarial dimensions) earn their place.

---

## 3. Sandbox provider

**Decision: E2B behind a `SandboxProvider` interface.**

- Implementations shipped in V1: `E2BSandbox`, `MockSandbox` (for tests).
- Fresh sandbox per stage (structural context isolation — enforces §31).
- Custom E2B template preinstalls: node, git, gh CLI, Claude Code CLI, common test runners.

**Rejected:**
- Local Docker (a week of plumbing before first agent run; laptop must be on)
- Fly Machines (more surface than needed)
- Modal (Python-first)
- Roll-your-own (explicit anti-goal, §42)

**Why it matters:** time-to-first-agent-run is the metric. E2B gets you there in a day.

---

## 4. How agents actually run inside the sandbox

**Decision:**
- **Implementer**: spawn `claude -p ...` CLI inside the E2B sandbox. Full toolset.
- **Adversarial**: spawn `claude -p ...` CLI inside a fresh E2B sandbox with `--allowed-tools "Read,Grep,Glob"`. Structurally cannot write.
- **Tester**: no CLI. Control plane calls `sandbox.commands.run("pnpm test && pnpm lint && pnpm typecheck")`, captures results, then makes a single Anthropic API call with `tool_choice: {type: "tool", name: "submit_test_report"}` to judge acceptance criteria. Guaranteed structured output.

**Rejected:**
- Custom harness for Implementer (spec §1 anti-goal — you're not building Claude Code)
- Claude Code CLI for Tester (wastes tokens on an agent loop for deterministic work)
- Codex CLI in V1 (doubles integration surface, no evidence you need provider diversity yet)

**Why it matters:** each stage is a fresh process in a fresh sandbox. Zero cross-stage context pollution, and Adversarial cannot scribble.

---

## 5. Workflow engine

**Decision: Inngest.**

- Each stage = an Inngest step in a `runExecution` function.
- Human approval = a first-class `step.waitForEvent("execution/approved", ...)` — no polling, no cron.
- Retries, timeouts, dead-letter all built-in.
- Vercel-native: Inngest cloud pings your Vercel function endpoints when a step fires.

**Rejected:**
- pg-boss / graphile-worker on Postgres (fine, but Inngest wins on DX for durable workflows with waits)
- Temporal (spec §6 explicitly gates it — too much operational surface)
- BullMQ (doesn't natively model multi-step workflows; you'd write the coordinator)

**Why it matters:** zero worker infra to run. The whole control plane is Vercel functions.

---

## 6. Secrets and permission surface

**Decision: two secrets, no policy engine.**

- `GITHUB_TOKEN`: fine-grained PAT scoped to the specific repo, `contents:write` + `pull-requests:write` only.
- `ANTHROPIC_API_KEY`: dedicated key so spend is trackable per project.
- AES-256-GCM at rest with a control-plane master key.
- Regex-based log redaction on artifact/log write (Anthropic key format, GitHub token format → `[REDACTED]`).
- Injected as env vars via E2B's `envs` param at sandbox start.

**Rejected:**
- The full spec §12 taxonomy (DATABASE_DEV_READ, AWS_WRITE, etc.) — enterprise-y, no single-user need.
- Per-task permission profiles.
- Protected-paths enforcement (Claude Code doesn't respect it; add a post-diff blocklist check if it becomes needed).
- Classic `repo`-scope PAT (wider blast radius).
- GitHub App (installation flow overhead for single-user V1).

**Why it matters:** compresses §12 + §18 into two env vars. Policy engine tables still exist as empty schema so migrations don't churn later.

---

## 7. Typed artifacts — storage and extraction

**Decision: loose JSONB with Zod validation at write; per-stage extraction strategy.**

**Storage:**
- One `artifacts` table: `id`, `agent_run_id`, `type`, `content JSONB`, `metadata`, `created_at`.
- Zod schema per artifact type, validated on insert.
- Schema evolution = ALTER the Zod file, not the DB.

**Extraction:**
- **Implementer / Adversarial (CLI stages):** prompt ends with *"Write your report as JSON matching `<schema>` to `/artifacts/summary.json` before exiting."* Harness reads file, Zod validates, retries stage up to 2× if schema fails.
- **Tester (single API call):** Anthropic `tool_use` with forced tool. 100% structured guarantee.
- **DIFF artifact:** captured deterministically by `sandbox.commands.run("git diff --patch-with-stat main...HEAD")` after CLI exits. Never LLM-produced.

**Rejected:**
- Strict per-type tables (painful schema evolution when you're still discovering fields)
- No validation (silent drift, breaks the UI)
- Markdown blobs (breaks the "evidence-based confidence" story)

**Why it matters:** structured stage handoffs (§31) enforced structurally. Diff is ground truth, not model output.

---

## 8. Infra bundle

**Decision:**
- **DB**: Neon (serverless Postgres, free tier).
- **Deployment**: everything on Vercel — web + API routes + Inngest handler.
- **Auth**: none in V1; localhost-only. Add a hardcoded session cookie (`X-CadenceAI-Session` header vs `process.env.CADENCEAI_SESSION`) if you want to demo to someone remotely.

Total V1 accounts: **Neon + Vercel + E2B + Inngest + Anthropic + GitHub.** All have free tiers usable for V1.

**Rejected:**
- Supabase (bundles auth you don't need)
- Railway (fine, but you don't need it if Vercel handles workers-as-functions)
- Local Postgres (you have to run and back up)
- Real auth (Clerk/NextAuth) — days of work for a single user

---

## 9. Confidence score

**Decision: TS-computed deterministic score, no LLM confidence anywhere.**

**Rubric (4-stage V1):**

| Signal | Points | Source |
|---|---|---|
| All tests passed | 35 | Tester |
| All acceptance criteria verified with evidence | 30 | Tester |
| Zero critical/high adversarial findings | 25 | Adversarial |
| Lint + typecheck pass | 10 | Tester |
| **Total** | **100** | |

**Penalties:**
- Critical adversarial finding → score = **0** (approval blocked — human cannot override in V1)
- High: −40 · Medium: −15 · Low: −5
- Failed test: −30
- Unverified acceptance criterion: −15

**Guardrails:**
- Score is computed by TypeScript from artifact contents. Not generated by any model.
- Every points-change on the approval page links to the specific finding / test / criterion.
- A criterion is "verified" only if the Tester's artifact includes machine-checkable evidence (test file, log excerpt, commit ref). Empty-evidence = unverified.

**Rejected:**
- No score (loses the anchor of the whole approval UX)
- LLM-tuned weights (backdoor for model-generated confidence)

**Why it matters:** this is the differentiated user-facing surface. Getting it "objective and transparent" separates CadenceAI from "run an agent and hope."

---

## 10. First bug CadenceAI fixes

**Decision: deferred until infra is standing.**

**But:** V1 cannot ship without a real target. Constraints when it's time to pick:

1. Symptom describable in one sentence.
2. Fix probably 1–2 files.
3. Existing test file it should touch (or should have caught it).
4. Does not touch Timescale schema or secrets (save for Phase 4).
5. You have a mental model of the right fix — so you can *judge* CadenceAI's output, not take it on faith.

**Rainier-companion is the intended target** unless a better candidate appears.

---

# Locked V1 Stack Summary

| Layer | Choice |
|---|---|
| User | Single (Mayank) |
| Pipeline | Task → Impl → Test → Adv → Approve → PR |
| Sandbox | E2B (interface: `SandboxProvider`) |
| Implementer runner | `claude` CLI in sandbox |
| Adversarial runner | `claude` CLI in sandbox, read-only tools |
| Tester runner | Shell + one Anthropic `tool_use` call |
| Workflow engine | Inngest |
| Secrets | GitHub PAT (fine-grained) + Anthropic key |
| Artifacts | JSONB + Zod, file-drop extraction, deterministic diff |
| DB | Neon |
| Deployment | Vercel (everything) |
| Auth | None / localhost |
| Confidence | TS-computed, 35/30/25/10 rubric |
| First bug | TBD — rainier-companion default |

---

# What V1 Explicitly Does NOT Include

- Planner agent
- Investigator agent
- Non-adversarial Reviewer
- Risk engine (LOW/MEDIUM/HIGH/CRITICAL)
- Policy engine (schema exists, no enforcement)
- Multi-tenant / workspaces / RBAC
- Cost tracking beyond raw Anthropic usage headers
- Multiple implementation candidates (§37)
- Agent debate (§37)
- Background engineering (§37)
- Codex or non-Claude provider adapters
- Parallel investigators (§36 Phase 5)
- Concurrent executions (schema supports it, UI shows one at a time)
- Model tier routing (§19)
- `.agent-engineering.yml` repo config file
- Protected-paths enforcement
- Cancellation UI (state exists, no button)
- Cost caps per execution

If you find yourself building any of these in V1, stop and check this list.

---

# Open Questions for Phase 1 Implementation

Not blockers, but decide before implementing the affected code:

1. **Task input UX** — freeform prose only, or a template with an "acceptance criteria" field the user fills in? (If the latter, less pressure on the Implementer to derive them.)
2. **Streaming Claude Code output to UI** — SSE from Vercel functions works but Vercel serverless timeouts (10s hobby / 300s pro) may bite. Consider running the Claude Code streaming reader in the Inngest step, writing chunks to Postgres, and streaming from Postgres to the UI.
3. **Cancellation** — Inngest supports canceling a run. But the E2B sandbox needs a separate `sandbox.kill()`. Wire this together in a single "cancel execution" endpoint.
4. **Retry granularity** — one stage failed vs one Zod validation failed vs one sandbox timeout. Different retry semantics per failure class (§34). Enumerate the failure taxonomy before writing retry code.
5. **Human approval trigger** — button on web UI is obvious. Also expose approval via a GitHub check comment (`/cadenceai approve`)? Defer.
6. **MockProvider / MockSandbox for tests** — mandatory per §8. Write these before the E2B adapter so the workflow tests never need real API calls.
7. **Repository context caching** — the "run this in the sandbox" template needs to know how to install deps and run tests. Detect on first repo connect, store on `repositories` table, reuse.

---

# Phase 1 Acceptance Criteria (Revised from §40)

Original §40 targeted 1 agent, no verification. Since we're building the 4-stage pipeline in V1, revised criteria:

1. Mayank can connect a GitHub repo via PAT.
2. Mayank can create a task in natural language.
3. Task creates an Execution record; UI shows a stage timeline.
4. Executor provisions an E2B sandbox with the repo cloned at a recorded commit SHA.
5. Implementer stage runs `claude` CLI, streams logs to UI, produces DIFF + ImplementationSummary artifacts.
6. Tester stage runs test/lint/typecheck in the sandbox, calls Anthropic `tool_use` to judge criteria, produces TestReport.
7. Adversarial stage runs `claude` CLI (read-only) in a fresh sandbox, produces ReviewReport with `Finding[]`.
8. Approval page shows: task, diff, test results, adversarial findings, TS-computed score with per-signal breakdown.
9. Mayank clicks Approve → new branch pushed → PR created via GitHub API.
10. All artifacts remain inspectable after completion.
11. Failed executions expose the error, the failing stage, and (if relevant) the schema-validation failure.
12. `AgentProvider` and `SandboxProvider` interfaces have `Mock*` implementations that pass the workflow test suite without touching E2B or Anthropic.
13. A real bug in rainier-companion (or equivalent) is fixed end-to-end by CadenceAI, PR reviewed by Mayank, merged.

Criterion 13 is the actual definition of done. Everything else is instrumentation.
