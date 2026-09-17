# Agent Engineering Control Plane

## V1 Product & Technical Specification

### Working Name

**CadenceAI**
Temporary project name. Do not optimize branding during V1.

---

# 1. Product Vision

Build a control plane for autonomous software engineering.

Instead of a developer interacting directly with one coding agent, the developer provides a high-level engineering goal.

The system then:

**Goal → Plan → Investigate → Implement → Verify → Review → Human Approval → PR**

Each stage is performed by an independent agent operating inside an isolated environment.

The product is not intended to replace Codex, Claude Code, Amp, Devin, OpenHands, or future coding agents.

It orchestrates them.

The long-term product thesis is:

> Coding intelligence becomes abundant. Verification, coordination, risk management, and engineering judgment become the scarce resources.

The system should therefore optimize for:

* parallelism
* agent independence
* reproducibility
* isolation
* verification
* human visibility
* risk-aware automation

---

# 2. Core User Experience

A developer connects a GitHub repository.

They create a task:

> Fix duplicate notification delivery. Retries must remain safe and the public API cannot change.

The system creates an execution.

The user sees:

```text
TASK #42

Fix duplicate notification delivery

Planning             ✓ Complete
Investigation        ✓ Complete
Implementation       ✓ Complete
Tests                ✓ Passed
Code Review          ⚠ 1 concern
Adversarial Review   ✓ Passed
Human Approval       ● Waiting
PR                    ○ Not created
```

Clicking a stage reveals:

* agent instructions
* files inspected
* findings
* produced artifacts
* logs
* token/model usage
* runtime
* cost
* git diff where applicable

The final approval screen should answer only the important questions:

```text
WHAT WAS REQUESTED?

Prevent duplicate notification delivery
without changing the public API.

WHAT CHANGED?

6 files modified
184 additions
73 deletions

VALIDATION

Unit tests             184 / 184
Integration tests       38 / 38
Lint                      Passed
Typecheck                 Passed

REVIEWS

Correctness              Passed
Architecture             Passed
Security                 Passed
Adversarial Review       Passed

CONCERNS

1 low-risk issue:
Retry interval remains hardcoded.

OVERALL CONFIDENCE

93%

[View Diff]

[Reject] [Request Changes] [Approve PR]
```

---

# 3. V1 Scope

V1 should implement exactly this pipeline:

```text
GitHub Issue / User Prompt
           ↓
        Planner
           ↓
      Investigator
           ↓
      Implementer
           ↓
        Tester
           ↓
        Reviewer
           ↓
  Adversarial Reviewer
           ↓
      Human Approval
           ↓
        GitHub PR
```

Do NOT build arbitrary multi-agent graphs in the first version.

Internally the architecture should support DAGs later, but expose one opinionated workflow initially.

---

# 4. Explicit Non-Goals for V1

Do not build:

* an IDE
* a code editor
* your own foundation model
* your own Git hosting
* fully autonomous production deployment
* autonomous merging of high-risk changes
* dozens of specialized agents
* voice interfaces
* mobile apps
* custom model training
* complicated enterprise RBAC
* Kubernetes unless actually required
* microservices unless required
* your own VM orchestration platform if an existing sandbox provider can handle it

Prefer a modular monolith.

---

# 5. Primary Objects

The main domain objects are:

```text
Workspace
Repository
Task
Execution
Stage
AgentRun
Sandbox
Artifact
Finding
Review
Approval
PullRequest
Policy
ModelConfiguration
```

The central object is an **Execution**.

A Task describes what needs to happen.

An Execution represents one attempt to complete the Task.

---

# 6. Core Architecture

Use approximately:

```text
                 ┌─────────────────────┐
                 │      Web App        │
                 │  Next.js / React    │
                 └─────────┬───────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │     API Server      │
                 │                     │
                 │ Auth                │
                 │ Tasks               │
                 │ Executions          │
                 │ Repositories        │
                 │ Approvals           │
                 └─────────┬───────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │ Workflow Engine     │
                 │                     │
                 │ State transitions   │
                 │ Retries             │
                 │ Dependencies        │
                 │ Cancellation        │
                 └─────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        Agent Runner   Sandbox       GitHub
                      Provider        Adapter
              │
              ▼
        Model Providers

        Claude / Codex /
        future providers
```

Recommended stack:

### Frontend

* Next.js
* TypeScript
* React
* Tailwind
* shadcn/ui

### Backend

Use TypeScript unless there is a strong implementation reason not to.

Possible structure:

```text
apps/
    web/
    api/
    worker/

packages/
    db/
    agents/
    workflows/
    github/
    sandboxes/
    policies/
    schemas/
    shared/
```

### Database

PostgreSQL.

Use an ORM such as Prisma or Drizzle.

### Queue / Workflow

V1 may use:

* PostgreSQL-backed job queue

or:

* Redis + BullMQ

Keep the workflow abstraction isolated so Temporal can replace it later if execution complexity warrants it.

Do not introduce Temporal in the first implementation unless necessary.

---

# 7. Execution State Machine

Every execution must have an explicit state.

```text
CREATED
    ↓
PLANNING
    ↓
INVESTIGATING
    ↓
AWAITING_PLAN_APPROVAL   optional
    ↓
IMPLEMENTING
    ↓
TESTING
    ↓
REVIEWING
    ↓
ADVERSARIAL_REVIEW
    ↓
AWAITING_HUMAN_APPROVAL
    ↓
CREATING_PR
    ↓
COMPLETED
```

Failure states:

```text
FAILED
CANCELLED
BLOCKED
```

A stage can individually have:

```text
PENDING
RUNNING
SUCCEEDED
FAILED
SKIPPED
CANCELLED
```

Transitions must happen through the workflow engine.

Never infer workflow state solely from UI state.

---

# 8. Agent Abstraction

Create a provider-independent interface.

Conceptually:

```ts
interface AgentProvider {
  execute(input: AgentExecutionInput): Promise<AgentExecutionResult>
}
```

Input:

```ts
type AgentExecutionInput = {
  role: AgentRole
  task: string
  instructions: string
  repositoryContext: RepositoryContext
  sandboxId: string
  model: ModelConfig
  allowedTools: ToolPermission[]
  priorArtifacts?: ArtifactReference[]
}
```

Output:

```ts
type AgentExecutionResult = {
  status: "success" | "failure"
  summary: string
  artifacts: Artifact[]
  findings: Finding[]
  usage: UsageMetrics
  rawLogsReference: string
}
```

Do not allow workflow code to directly depend on Claude, Codex, or any particular agent.

Implement adapters.

Example:

```text
AgentProvider
├── ClaudeProvider
├── CodexProvider
└── MockProvider
```

`MockProvider` is mandatory so workflow tests do not require paid model calls.

---

# 9. Agent Roles

## 9.1 Planner

Input:

* user's goal
* repository metadata
* repository instructions
* optional GitHub issue

Planner responsibilities:

* understand requested outcome
* identify likely affected systems
* identify unknowns
* generate acceptance criteria
* classify risk
* produce an investigation plan
* produce implementation steps

Planner does NOT modify code.

Output schema:

```json
{
  "summary": "...",
  "acceptanceCriteria": [],
  "investigationQuestions": [],
  "implementationPlan": [],
  "affectedAreas": [],
  "risk": "low | medium | high | critical",
  "requiresHumanPlanApproval": false
}
```

Use structured output.

---

## 9.2 Investigator

Investigator receives:

* original goal
* planner output
* repository

It may:

* search code
* inspect history
* run existing tests
* trace call paths
* inspect configuration
* reproduce bugs

It does NOT modify committed source code.

Output:

```json
{
  "findings": [],
  "rootCause": "...",
  "recommendedApproach": "...",
  "filesLikelyAffected": [],
  "risks": [],
  "openQuestions": []
}
```

---

# 10. Implementer

The implementer receives:

* original task
* acceptance criteria
* plan
* investigation report

Important principle:

The implementer receives useful upstream artifacts but should not receive irrelevant agent conversation history.

It starts in its own isolated sandbox.

Responsibilities:

1. checkout repository
2. create branch
3. implement change
4. add/update tests
5. run relevant tests
6. commit changes
7. produce implementation summary

Output:

```json
{
  "summary": "...",
  "filesChanged": [],
  "testsAdded": [],
  "testsExecuted": [],
  "knownLimitations": []
}
```

---

# 11. Sandbox Model

Every implementation attempt receives its own sandbox.

Conceptually:

```text
Execution
   │
   ├─ planner sandbox
   ├─ investigator sandbox
   └─ implementation sandbox
```

V1 can reuse read-only contexts where safe.

Every implementation sandbox should contain:

```text
Ubuntu
Git
Repository
Runtime dependencies
Agent runtime
Project secrets allowed by policy
Network policy
Resource limits
```

Each sandbox needs:

```text
sandbox_id
execution_id
provider
status
created_at
destroyed_at
git_commit_base
branch
```

Sandboxes should be disposable.

Never depend on state surviving outside recorded artifacts.

---

# 12. Secrets and Environment Access

This is critical.

Agents must not automatically receive every company secret.

Create scoped permissions.

Example:

```text
DATABASE_DEV_READ
DATABASE_DEV_WRITE
DATABASE_STAGING_READ
DATABASE_STAGING_WRITE

AWS_READ
AWS_WRITE

GITHUB_READ
GITHUB_WRITE

PRODUCTION_ACCESS
```

A Task gets a permission profile.

Example:

```text
UI change

GitHub read/write
No DB
No AWS
No production
```

Database bug:

```text
GitHub read/write
Development DB read
Staging DB read

No production write
```

V1 should NEVER expose production write credentials to agents.

---

# 13. Tester Agent

The tester must operate independently from the implementer.

Inputs:

* original requirements
* acceptance criteria
* resulting repository state

Do not provide the implementer's full reasoning.

Tester responsibilities:

* inspect changed behavior
* run existing tests
* determine relevant tests
* generate additional tests where useful
* find regressions
* verify acceptance criteria

Output:

```json
{
  "status": "pass | fail | uncertain",
  "testsRun": [],
  "testsPassed": 0,
  "testsFailed": 0,
  "acceptanceCriteria": [
    {
      "criterion": "...",
      "status": "verified",
      "evidence": "..."
    }
  ],
  "failures": []
}
```

---

# 14. Reviewer Agent

Reviewer receives:

* task
* acceptance criteria
* git diff
* relevant repository context

Do NOT provide implementer chain-of-thought or justification.

Review dimensions:

```text
Correctness
Maintainability
Architecture
Backward compatibility
Error handling
Concurrency
Performance
Security
Test quality
```

Output should contain findings.

Every finding:

```ts
type ReviewFinding = {
  severity: "info" | "low" | "medium" | "high" | "critical"
  category: string
  file?: string
  line?: number
  description: string
  evidence: string
  recommendation?: string
}
```

---

# 15. Adversarial Reviewer

This is one of the key differentiators.

Prompt concept:

> Assume this implementation is wrong. Your job is to find the strongest evidence that it should not be merged.

The adversarial reviewer should attempt to find:

* unhandled edge cases
* race conditions
* hidden assumptions
* incorrect acceptance criteria
* missing tests
* regressions
* performance problems
* dangerous migrations
* security vulnerabilities

This stage should have no loyalty to the previous solution.

Its objective is falsification.

---

# 16. Evidence-Based Verification

Avoid meaningless model-generated confidence scores.

Confidence must eventually derive from evidence.

V1 may calculate a heuristic score such as:

```text
Tests                     30 points
Acceptance criteria       25
Reviewer findings         20
Adversarial review        15
Static checks             10
```

Example:

```text
Tests all passed                +30
5/5 acceptance criteria         +25
No high severity findings       +20
Adversarial review passed       +15
Lint + typecheck                +10

Confidence = 100
```

Penalties:

```text
critical finding       -100
high finding            -40
medium finding          -15
failed test             -30
unverified criterion    -15
```

Do not present an LLM saying "93% confident" as objective confidence.

Every displayed score must link to evidence.

---

# 17. Risk Engine

Risk should be first-class.

Task risk:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Example heuristics:

### Low

* documentation
* comments
* simple tests
* styling

### Medium

* UI behavior
* isolated backend feature
* non-critical API modifications

### High

* authentication
* payments
* migrations
* concurrency
* infrastructure
* permissions
* customer data

### Critical

* production database destructive operations
* secrets
* access-control infrastructure
* irreversible migrations
* billing ledger logic

Policies:

```text
LOW
1 reviewer
human approval optional eventually

MEDIUM
reviewer
tester
human approval

HIGH
tester
reviewer
adversarial reviewer
mandatory human approval

CRITICAL
additional review
mandatory human approval
restricted environment
never autonomous merge
```

V1 should require human approval for all PR creation.

---

# 18. Policy Engine

Represent policies in data rather than hardcode everything.

Example:

```yaml
risk: high

implementation:
  modelTier: strong

testing:
  required: true

reviews:
  correctness: true
  adversarial: true

humanApproval:
  required: true

permissions:
  productionWrite: false
```

Eventually organizations should be able to define these.

---

# 19. Model Routing

Create model tiers rather than coupling workflows to model names.

```text
CHEAP
STANDARD
STRONG
PREMIUM
```

Example policy:

```text
Planner        STANDARD
Investigator   CHEAP
Implementer    STRONG
Tester         STANDARD
Reviewer       STRONG
```

The provider configuration maps tiers to actual models.

Example:

```yaml
cheap:
  provider: providerA
  model: model-x

strong:
  provider: providerB
  model: model-y
```

Changing models should not require changing workflows.

---

# 20. Repository Context

On repository connection, analyze and store:

```text
languages
frameworks
package managers
test commands
lint commands
typecheck commands
build commands
directory structure
repository instructions
```

Support repository-level configuration.

Example file:

```text
.agent-engineering.yml
```

Example:

```yaml
commands:
  install: pnpm install
  test: pnpm test
  lint: pnpm lint
  typecheck: pnpm typecheck

protectedPaths:
  - migrations/
  - auth/
  - billing/

instructions:
  - Never modify generated files directly.
  - All API changes require backwards compatibility.
```

Repository instructions should be injected into every relevant agent.

---

# 21. Database Model

Approximate schema:

```text
users
workspaces
workspace_members

repositories
repository_installations

tasks

executions
execution_stages

agent_runs
agent_messages
agent_usage

sandboxes

artifacts
findings
reviews

approvals

pull_requests

policies

model_configs
```

Important fields:

### tasks

```text
id
workspace_id
repository_id
title
description
source
source_reference
created_by
created_at
```

### executions

```text
id
task_id
status
risk_level
base_branch
base_commit
started_at
completed_at
created_at
```

### agent_runs

```text
id
execution_id
stage_id
role
provider
model
status
sandbox_id
started_at
completed_at

input_tokens
output_tokens
estimated_cost
```

### artifacts

```text
id
agent_run_id
type
name
content
metadata
created_at
```

Artifact types:

```text
PLAN
INVESTIGATION
IMPLEMENTATION_SUMMARY
TEST_REPORT
REVIEW_REPORT
DIFF
LOG
SCREENSHOT
OTHER
```

---

# 22. API Design

Example endpoints:

```text
POST   /api/repositories/connect

GET    /api/repositories
GET    /api/repositories/:id

POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:id

POST   /api/tasks/:id/executions

GET    /api/executions/:id
POST   /api/executions/:id/cancel

GET    /api/executions/:id/stages
GET    /api/executions/:id/artifacts
GET    /api/executions/:id/findings

POST   /api/executions/:id/approve
POST   /api/executions/:id/reject
POST   /api/executions/:id/request-changes

POST   /api/executions/:id/create-pr
```

Use server-sent events or WebSockets for live execution updates.

SSE is likely sufficient for V1.

---

# 23. Workflow Implementation

Define stages as reusable functions.

Conceptually:

```ts
async function executeWorkflow(executionId: string) {
  const plan = await runPlanner(executionId)

  const investigation =
    await runInvestigator(executionId, plan)

  const implementation =
    await runImplementer(
      executionId,
      plan,
      investigation
    )

  const tests =
    await runTester(
      executionId,
      implementation
    )

  const review =
    await runReviewer(
      executionId,
      implementation
    )

  const adversarial =
    await runAdversarialReview(
      executionId,
      implementation
    )

  await awaitHumanApproval(executionId)

  await createPullRequest(executionId)
}
```

But the actual implementation must persist every state transition.

A process crash must not lose workflow progress.

---

# 24. Human Approval

Approval page should emphasize evidence over raw agent logs.

Show:

```text
Task
Risk
Plan
Files changed
Diff
Tests
Acceptance criteria
Review findings
Adversarial findings
Cost
Runtime
```

Actions:

```text
Approve
Request Changes
Reject
```

Request Changes should create another implementation iteration.

Do not overwrite the first attempt.

Represent:

```text
Execution
    ├── Implementation Attempt 1
    └── Implementation Attempt 2
```

Historical attempts remain inspectable.

---

# 25. GitHub Integration

V1 should support:

* GitHub App authentication
* repository selection
* reading repository
* fetching branches
* creating branches
* pushing commits
* creating PRs
* reading GitHub issues
* linking tasks to issues
* posting execution summary to PR

Possible UX:

```text
GitHub Issue #394

[Run with CadenceAI]
```

Generated PR description:

```markdown
## Goal

Fix duplicate notification delivery.

## Implementation

...

## Verification

✓ Unit tests
✓ Integration tests
✓ Acceptance criteria verified

## Agent Reviews

Correctness: Passed
Architecture: Passed
Adversarial: Passed

## CadenceAI Execution

Execution #abc123
```

---

# 26. UI

Primary screens:

## Dashboard

```text
Tasks
Running executions
Awaiting approval
Recently completed
Failed
```

## Task Page

Shows:

```text
goal
repository
risk
executions
```

## Execution Page

Main timeline:

```text
● Plan
│
● Investigate
│
● Implement
│
● Test
│
● Review
│
● Adversarial Review
│
● Human Approval
```

Click stage to inspect artifact.

## Approval Page

Optimized for deciding whether code should merge.

## Settings

```text
Repositories
Models
Policies
Secrets
GitHub
Usage
```

---

# 27. Execution Graph

Although V1 uses a linear flow, model executions internally as a DAG.

```ts
type WorkflowNode = {
  id: string
  type: string
  dependencies: string[]
  status: StageStatus
}
```

This enables V2:

```text
                 Planner
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
 Investigator A Investigator B Investigator C
       │            │            │
       └────────────┼────────────┘
                    ▼
                 Synthesis
                    │
                    ▼
               Implementer
```

Do not expose arbitrary workflow construction in V1.

---

# 28. Observability

Record every run.

Metrics:

```text
execution duration
stage duration
model usage
estimated cost
sandbox runtime
success/failure
review findings
test results
iterations
human approval/rejection
```

Eventually this data becomes extremely valuable.

Questions the system should someday answer:

```text
Which models produce the fewest rejected PRs?

Which workflow works best for migrations?

Do three investigators materially improve success rate?

Which reviewer catches the most real bugs?

What types of changes generate regressions?
```

---

# 29. Security Requirements

Mandatory:

* encrypt secrets at rest
* never include secrets in agent logs
* redact known secret patterns
* sandbox agent execution
* network access configurable
* explicit environment permissions
* log all credential access
* no production-write access in V1
* repository access scoped through GitHub App
* execution environments destroyed when complete
* audit trail for approvals

Agent-generated shell commands should execute only inside sandbox environments.

Never execute agent commands directly on the control-plane host.

---

# 30. Prompt Architecture

Prompts must live in versioned files.

Example:

```text
prompts/
    planner/
        v1.md

    investigator/
        v1.md

    implementer/
        v1.md

    tester/
        v1.md

    reviewer/
        v1.md

    adversarial-reviewer/
        v1.md
```

Store `prompt_version` with each AgentRun.

This allows evaluating prompt changes over time.

---

# 31. Structured Agent Communication

Do not let stages communicate primarily through giant conversation transcripts.

Agents communicate through typed artifacts.

Example:

```text
Planner
   ↓
PlanArtifact

Investigator
   ↓
InvestigationArtifact

Implementer
   ↓
GitDiff + ImplementationArtifact

Tester
   ↓
TestReport

Reviewer
   ↓
ReviewReport
```

This prevents context pollution and makes execution inspectable.

---

# 32. Cost Controls

Every execution should track:

```text
tokens
model cost
sandbox cost
total cost
```

Workspace settings:

```text
max cost / execution
max concurrent executions
max agent runs / task
```

Example:

```text
Maximum execution spend: $20

Current:

Planner          $0.23
Investigation    $0.31
Implementation   $2.84
Testing          $0.48
Review           $0.72

Total            $4.58
```

---

# 33. Concurrency

V1:

```text
1 execution
1 investigator
1 implementer
1 tester
1 reviewer
1 adversarial reviewer
```

But infrastructure must allow many independent executions.

Example:

```text
Ticket A ─── execution
Ticket B ─── execution
Ticket C ─── execution
Ticket D ─── execution
```

Each uses isolated sandboxes.

---

# 34. Failure Handling

Agent run failures must be retryable.

Example:

```text
Implementer
   ↓
timeout
   ↓
retry same agent
   ↓
failure
   ↓
execution BLOCKED
```

Retry policy should differentiate:

```text
infrastructure failure
model failure
agent failure
test failure
policy violation
```

A test failure is not necessarily an infrastructure failure and should not blindly restart the stage.

---

# 35. Auditability

An execution must be reproducible enough to answer:

```text
Who requested this?

What commit did it start from?

Which models ran?

What instructions did they receive?

What tools could they access?

Which commands ran?

What changes were produced?

Which tests ran?

Which reviewers approved it?

Who authorized the PR?
```

This is foundational to the product.

---

# 36. V1 Milestones

## Phase 0 — Skeleton

Build:

* monorepo
* authentication
* Postgres
* basic dashboard
* Task CRUD
* Execution CRUD
* state-machine primitives

No agents yet.

---

## Phase 1 — One Agent End-to-End

Implement:

```text
Task
 ↓
Agent
 ↓
Sandbox
 ↓
Git diff
 ↓
Human approval
 ↓
PR
```

This validates:

* sandbox creation
* repository checkout
* model integration
* GitHub integration
* logs
* artifacts

Do not proceed until this works reliably.

---

## Phase 2 — Structured Workflow

Add:

```text
Planner
Investigator
Implementer
Tester
Reviewer
```

Build typed artifacts between stages.

---

## Phase 3 — Adversarial Verification

Add:

* adversarial reviewer
* acceptance-criteria verification
* finding severities
* evidence-based confidence
* approval dashboard

This should become the first genuinely differentiated version.

---

## Phase 4 — Risk Engine

Add:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Risk controls:

* models
* reviewer count
* permissions
* required checks
* human gates

---

## Phase 5 — Parallel Investigation

Move from:

```text
Investigator
```

to:

```text
Investigator A
Investigator B
Investigator C
      ↓
Synthesizer
```

Investigators should receive different mandates.

Example:

```text
A → understand current architecture
B → attempt root cause analysis
C → challenge assumptions and propose alternatives
```

---

# 37. V2

Potential features:

### Multiple implementation candidates

```text
Plan
 ├─ Implementation A
 ├─ Implementation B
 └─ Implementation C
          ↓
      Evaluator
          ↓
   Winning candidate
```

### Agent debate

```text
Proposal A
   ↓
Critique B
   ↓
Response A
   ↓
Judge
```

### Background engineering

Users create standing goals:

```text
Find flaky tests.

Find dead code.

Find N+1 queries.

Find missing indexes.

Find opportunities to simplify this module.
```

Agents continuously investigate.

No code modification occurs without workflow approval.

---

# 38. V3 — Autonomous Engineering Organization

The eventual model:

```text
                  HUMAN
                    │
             Product Goal
                    │
                    ▼
             Orchestrator
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
   Research     Maintenance    Features
       │            │            │
       ▼            ▼            ▼
 Agent Teams     Agent Teams    Agent Teams
       │            │            │
       └────────────┼────────────┘
                    ▼
               Verification
                    │
                    ▼
               Human Gates
```

Developer activity changes from:

> write code

to:

> allocate goals, review evidence, make decisions.

---

# 39. Product Principles

When making implementation decisions, follow these principles.

### 1. Evidence over confidence

Never trust an agent because it claims something works.

Require evidence.

---

### 2. Independent verification

The entity producing code should not be solely responsible for determining whether that code is correct.

---

### 3. Isolation by default

Agents should operate in disposable environments.

---

### 4. Least privilege

Agents receive only the resources necessary for their task.

---

### 5. Humans approve consequences

Autonomy should scale inversely with risk.

---

### 6. Preserve artifacts

Plans, findings, implementations, tests, reviews, and decisions are durable product data.

---

### 7. Providers are replaceable

Models and agent harnesses will change rapidly.

Do not make them core domain abstractions.

---

### 8. Workflows are the product

The system's long-term intelligence is learning which engineering workflow produces reliable outcomes for each kind of problem.

---

# 40. First Build Assignment

Start by implementing only this vertical slice:

```text
User
 ↓
Connect GitHub repository
 ↓
Create task
 ↓
Start execution
 ↓
Create isolated sandbox
 ↓
Clone repository
 ↓
Run one coding agent
 ↓
Agent modifies repository
 ↓
Capture git diff
 ↓
Show diff in web UI
 ↓
Human clicks Approve
 ↓
Push branch
 ↓
Create GitHub PR
```

Acceptance criteria:

1. User can connect at least one GitHub repository.
2. User can create a natural-language engineering task.
3. An execution record is persisted.
4. A sandbox is provisioned.
5. Repository is checked out at a recorded commit SHA.
6. An agent can inspect and modify the repository.
7. Agent logs are streamed to the application.
8. Resulting git diff is persisted.
9. User can inspect the diff.
10. No change reaches GitHub before human approval.
11. Approving creates a branch and PR.
12. Execution history remains inspectable afterward.
13. Failed runs expose useful error information.
14. Model/provider implementation is behind an interface.
15. Sandbox implementation is behind an interface.

Do not implement planners, reviewers, parallel agents, risk scoring, or debate until this vertical slice works.

---

# 41. Suggested Initial Repository Structure

```text
cadenceai/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── db/
│   ├── agents/
│   ├── sandboxes/
│   ├── workflows/
│   ├── github/
│   ├── policies/
│   ├── prompts/
│   ├── schemas/
│   └── shared/
│
├── docs/
│   ├── architecture.md
│   ├── security.md
│   ├── workflow.md
│   └── decisions/
│
├── docker/
│
├── .env.example
├── package.json
└── README.md
```

---

# 42. Engineering Rules for the Coding Agent Building This

When implementing this project:

1. Keep the architecture modular but avoid premature microservices.
2. Prefer boring, understandable infrastructure.
3. Every database mutation must be typed.
4. Every workflow transition must be persisted.
5. External providers must sit behind interfaces.
6. All agent output crossing stage boundaries must use schemas.
7. Never execute agent-generated commands on the host machine.
8. Never expose production credentials to agent sandboxes.
9. Write tests for the workflow state machine.
10. Add database migrations for schema changes.
11. Document architectural decisions in `/docs/decisions`.
12. Do not introduce infrastructure that V1 does not require.
13. Mock expensive external providers in automated tests.
14. Favor complete vertical slices over partially implemented infrastructure layers.
15. After every milestone, update `README.md` with instructions for running the system locally.

---

# 43. Definition of Success for V1

V1 succeeds when I can:

1. open the application,
2. choose a repository,
3. write:

> Fix this bug and make sure the existing API behavior doesn't regress.

4. leave the execution running,
5. return later,
6. inspect:

```text
Plan
Investigation
Implementation
Tests
Independent Review
Adversarial Review
```

7. understand exactly why the system believes the implementation is safe,
8. inspect the diff,
9. approve it,
10. receive a ready-to-review GitHub PR.

The product should make supervising five autonomous engineering tasks feel safer and easier than supervising one coding agent manually.

That is the V1 product.
