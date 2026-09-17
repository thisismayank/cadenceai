import { and, desc, eq } from "drizzle-orm";
import {
  agentRuns,
  artifacts,
  executions,
  executionStages,
  findings as findingsTable,
  pullRequests,
  repositories,
  sandboxes,
  tasks,
} from "@cadenceai/db";
import type { Database } from "@cadenceai/db";
import {
  ARTIFACT_CONTENT_SCHEMA,
  STAGE_TO_EXECUTION_STATUS,
  TestReport,
  V1_STAGE_ORDER,
  assertTransition,
  computeConfidence,
  type ExecutionStatus,
  type Finding,
  type StageKind,
} from "@cadenceai/schemas";
import type { AgentArtifact, AgentExecutionResult, AgentProvider } from "@cadenceai/agents";
import type { SandboxHandle, SandboxProvider } from "@cadenceai/sandboxes";
import { inngest } from "../client";
import type { WorkflowDeps } from "../deps";

const AGENT_STAGES: StageKind[] = [
  "ANALYZER",
  "IMPLEMENTER",
  "TESTER",
  "ADVERSARIAL",
];

export function createRunExecutionFunction(deps: WorkflowDeps) {
  return inngest.createFunction(
    { id: "run-execution", name: "Run execution", concurrency: 4 },
    { event: "execution/created" },
    async ({ event, step, logger }) => {
      const { executionId } = event.data;
      logger.info("Starting execution", { executionId });

      const context = await step.run("load-context", () =>
        loadExecutionContext(deps.db, executionId),
      );

      await step.run("transition-created-to-analyzing", () =>
        transitionExecution(deps.db, executionId, "CREATED", "ANALYZING", {
          startedAt: new Date(),
        }),
      );

      await step.run("create-stage-rows", () =>
        createStageRows(deps.db, executionId),
      );

      const sandboxHandle = await step.run("create-sandbox", () =>
        provisionSandbox(deps.db, deps.sandboxProvider, executionId, context.baseCommit),
      );

      try {
        for (const kind of AGENT_STAGES) {
          const nextStatus = STAGE_TO_EXECUTION_STATUS[kind];
          const priorStatus = await step.run(`current-status-before-${kind}`, () =>
            getExecutionStatus(deps.db, executionId),
          );
          if (priorStatus !== nextStatus) {
            await step.run(`transition-to-${nextStatus}`, () =>
              transitionExecution(deps.db, executionId, priorStatus, nextStatus),
            );
          }

          await step.run(`run-${kind.toLowerCase()}`, () =>
            runStage(deps, {
              executionId,
              kind,
              task: context.taskDescription,
              acceptanceCriteria: context.acceptanceCriteria,
              sandboxHandle,
            }),
          );
        }

        const testReport = await step.run("load-test-report", () =>
          loadLatestArtifactAs(deps.db, executionId, "TEST_REPORT"),
        );
        const findings = await step.run("load-findings", () =>
          loadFindings(deps.db, executionId),
        );

        await step.run("compute-confidence", async () => {
          const parsedTestReport = testReport
            ? TestReport.parse(testReport)
            : undefined;
          const report = computeConfidence({
            testReport: parsedTestReport,
            findings: findings as Finding[],
          });
          await deps.db
            .update(executions)
            .set({ confidenceScore: report.score })
            .where(eq(executions.id, executionId));
        });

        await step.run("transition-to-awaiting-approval", () =>
          transitionExecution(
            deps.db,
            executionId,
            "ADVERSARIAL_REVIEW",
            "AWAITING_HUMAN_APPROVAL",
          ),
        );

        const decisionEvent = await step.waitForEvent("wait-for-approval", {
          event: "execution/decision",
          match: "data.executionId",
          timeout: "7d",
        });

        if (!decisionEvent) {
          await step.run("timeout-cancel", () =>
            transitionExecution(
              deps.db,
              executionId,
              "AWAITING_HUMAN_APPROVAL",
              "CANCELLED",
              { completedAt: new Date() },
            ),
          );
          return { status: "timed-out" as const };
        }

        if (decisionEvent.data.decision !== "APPROVE") {
          await step.run("transition-to-cancelled", () =>
            transitionExecution(
              deps.db,
              executionId,
              "AWAITING_HUMAN_APPROVAL",
              "CANCELLED",
              { completedAt: new Date() },
            ),
          );
          return { status: "not-approved" as const };
        }

        await step.run("transition-to-creating-pr", () =>
          transitionExecution(
            deps.db,
            executionId,
            "AWAITING_HUMAN_APPROVAL",
            "CREATING_PR",
          ),
        );

        // Phase 0: mock a PR record. Phase 1 replaces with real GitHub call.
        await step.run("mock-create-pr", () =>
          createMockPullRequest(deps.db, executionId),
        );

        await step.run("transition-to-completed", () =>
          transitionExecution(deps.db, executionId, "CREATING_PR", "COMPLETED", {
            completedAt: new Date(),
          }),
        );

        return { status: "completed" as const };
      } finally {
        await step.run("destroy-sandbox", () =>
          teardownSandbox(deps.db, deps.sandboxProvider, sandboxHandle),
        );
      }
    },
  );
}

// ---- Helpers ----------------------------------------------------------------

type ExecutionContext = {
  taskDescription: string;
  acceptanceCriteria: string[];
  repositoryId: string;
  baseCommit: string;
};

async function loadExecutionContext(
  db: Database,
  executionId: string,
): Promise<ExecutionContext> {
  const rows = await db
    .select({
      execution: executions,
      task: tasks,
      repository: repositories,
    })
    .from(executions)
    .innerJoin(tasks, eq(tasks.id, executions.taskId))
    .innerJoin(repositories, eq(repositories.id, tasks.repositoryId))
    .where(eq(executions.id, executionId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error(`Execution not found: ${executionId}`);
  return {
    taskDescription: `${row.task.title}\n\n${row.task.description}`,
    acceptanceCriteria: row.task.acceptanceCriteria ?? [],
    repositoryId: row.repository.id,
    baseCommit: row.execution.baseCommit ?? "HEAD",
  };
}

async function getExecutionStatus(
  db: Database,
  executionId: string,
): Promise<ExecutionStatus> {
  const rows = await db
    .select({ status: executions.status })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Execution not found: ${executionId}`);
  return row.status as ExecutionStatus;
}

async function transitionExecution(
  db: Database,
  executionId: string,
  from: ExecutionStatus,
  to: ExecutionStatus,
  extras: { startedAt?: Date; completedAt?: Date } = {},
): Promise<void> {
  assertTransition(from, to);
  await db
    .update(executions)
    .set({ status: to, ...extras })
    .where(eq(executions.id, executionId));
}

async function createStageRows(db: Database, executionId: string): Promise<void> {
  const values = V1_STAGE_ORDER.map((kind, idx) => ({
    executionId,
    kind,
    status: "PENDING" as const,
    orderIndex: idx,
  }));
  await db.insert(executionStages).values(values);
}

async function provisionSandbox(
  db: Database,
  provider: SandboxProvider,
  executionId: string,
  baseCommit: string,
): Promise<SandboxHandle> {
  const handle = await provider.create({ executionId });
  await db.insert(sandboxes).values({
    executionId,
    provider: provider.name,
    providerSandboxId: handle.providerSandboxId,
    status: "RUNNING",
    baseCommit,
  });
  return handle;
}

async function teardownSandbox(
  db: Database,
  provider: SandboxProvider,
  handle: SandboxHandle,
): Promise<void> {
  await provider.destroy(handle);
  await db
    .update(sandboxes)
    .set({ status: "DESTROYED", destroyedAt: new Date() })
    .where(eq(sandboxes.providerSandboxId, handle.providerSandboxId));
}

type RunStageInput = {
  executionId: string;
  kind: StageKind;
  task: string;
  acceptanceCriteria: string[];
  sandboxHandle: SandboxHandle;
};

async function runStage(
  deps: WorkflowDeps,
  input: RunStageInput,
): Promise<{ agentRunId: string }> {
  const stageRow = await getStageRow(deps.db, input.executionId, input.kind);
  await deps.db
    .update(executionStages)
    .set({ status: "RUNNING", startedAt: new Date() })
    .where(eq(executionStages.id, stageRow.id));

  const agentRunRows = await deps.db
    .insert(agentRuns)
    .values({
      executionId: input.executionId,
      stageId: stageRow.id,
      role: input.kind,
      provider: deps.agentProvider.name,
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning({ id: agentRuns.id });
  const agentRunId = agentRunRows[0]!.id;

  let result: AgentExecutionResult;
  try {
    result = await deps.agentProvider.execute({
      role: input.kind,
      task: input.task,
      instructions: instructionsFor(input.kind),
      acceptanceCriteria: input.acceptanceCriteria,
      sandbox: deps.sandboxProvider,
      sandboxHandle: input.sandboxHandle,
    });
  } catch (err) {
    await deps.db
      .update(agentRuns)
      .set({ status: "FAILED", completedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));
    await deps.db
      .update(executionStages)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(executionStages.id, stageRow.id));
    throw err;
  }

  await persistAgentResult(deps.db, {
    executionId: input.executionId,
    stageId: stageRow.id,
    agentRunId,
    result,
  });

  return { agentRunId };
}

async function getStageRow(
  db: Database,
  executionId: string,
  kind: StageKind,
): Promise<{ id: string }> {
  const rows = await db
    .select({ id: executionStages.id })
    .from(executionStages)
    .where(
      and(
        eq(executionStages.executionId, executionId),
        eq(executionStages.kind, kind),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Missing stage ${kind} for execution ${executionId}`);
  return row;
}

async function persistAgentResult(
  db: Database,
  args: {
    executionId: string;
    stageId: string;
    agentRunId: string;
    result: AgentExecutionResult;
  },
): Promise<void> {
  const { executionId, stageId, agentRunId, result } = args;
  const now = new Date();

  await db
    .update(agentRuns)
    .set({
      status: result.status === "success" ? "SUCCEEDED" : "FAILED",
      completedAt: now,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      estimatedCostCents: result.usage.estimatedCostCents,
    })
    .where(eq(agentRuns.id, agentRunId));

  for (const artifact of result.artifacts) {
    await validateAndInsertArtifact(db, {
      executionId,
      agentRunId,
      artifact,
    });
  }

  if (result.findings.length > 0) {
    await db.insert(findingsTable).values(
      result.findings.map((f) => ({
        executionId,
        agentRunId,
        severity: f.severity,
        category: f.category,
        file: f.file,
        line: f.line,
        description: f.description,
        evidence: f.evidence,
        recommendation: f.recommendation,
      })),
    );
  }

  await db
    .update(executionStages)
    .set({
      status: result.status === "success" ? "SUCCEEDED" : "FAILED",
      completedAt: now,
      errorMessage: result.status === "failure" ? result.summary : null,
    })
    .where(eq(executionStages.id, stageId));
}

async function validateAndInsertArtifact(
  db: Database,
  args: { executionId: string; agentRunId: string; artifact: AgentArtifact },
): Promise<void> {
  const { executionId, agentRunId, artifact } = args;
  const schema = ARTIFACT_CONTENT_SCHEMA[artifact.type];
  const parsed = schema.parse(artifact.content);
  await db.insert(artifacts).values({
    executionId,
    agentRunId,
    type: artifact.type,
    name: artifact.name,
    content: parsed as Record<string, unknown>,
  });
}

async function loadLatestArtifactAs(
  db: Database,
  executionId: string,
  type: "TEST_REPORT",
): Promise<unknown | null> {
  const rows = await db
    .select({ content: artifacts.content })
    .from(artifacts)
    .where(
      and(eq(artifacts.executionId, executionId), eq(artifacts.type, type)),
    )
    .orderBy(desc(artifacts.createdAt))
    .limit(1);
  return rows[0]?.content ?? null;
}

async function loadFindings(db: Database, executionId: string): Promise<unknown[]> {
  const rows = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.executionId, executionId));
  return rows.map((r) => ({
    severity: r.severity,
    category: r.category,
    file: r.file ?? undefined,
    line: r.line ?? undefined,
    description: r.description,
    evidence: r.evidence,
    recommendation: r.recommendation ?? undefined,
  }));
}

async function createMockPullRequest(
  db: Database,
  executionId: string,
): Promise<void> {
  const rows = await db
    .select({
      executionId: executions.id,
      repositoryId: tasks.repositoryId,
    })
    .from(executions)
    .innerJoin(tasks, eq(tasks.id, executions.taskId))
    .where(eq(executions.id, executionId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error(`Execution not found: ${executionId}`);

  await db.insert(pullRequests).values({
    executionId,
    repositoryId: row.repositoryId,
    branch: `cadenceai/${executionId.slice(0, 8)}`,
    githubUrl: `https://example.com/cadenceai/mock/pr/${executionId.slice(0, 8)}`,
  });
}

function instructionsFor(kind: StageKind): string {
  switch (kind) {
    case "ANALYZER":
      return "Assess intent, complexity, risk, ambiguities, and acceptance criteria. Select stages by capability rather than vendor model name. Produce an EXECUTION_PLAN artifact.";
    case "IMPLEMENTER":
      return "Implement the task in the sandbox. Produce IMPLEMENTATION_SUMMARY and DIFF artifacts.";
    case "TESTER":
      return "Run tests, lint, and typecheck. Verify acceptance criteria. Produce a TEST_REPORT.";
    case "ADVERSARIAL":
      return "Assume this implementation is wrong. Produce a REVIEW_REPORT with Finding[].";
    default:
      return "";
  }
}
