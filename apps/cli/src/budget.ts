import { workflowPipeline, type CadenceConfig, type PipelineStageConfig, type ReadOnlyWorkflowKind } from "./config.ts";
import type { RiskLevel, TaskEnvelope } from "./task.ts";

export type BudgetMode = "economy" | "balanced" | "thorough";

export type EngineeringExecutionPlan = {
  mode: BudgetMode;
  risk: RiskLevel;
  stageIds: string[];
  stages: PipelineStageConfig[];
  connectedCalls: number;
  modelCalls: number;
  totalModelCalls: number;
  notes: string[];
};

export type ReviewExecutionPlan = {
  stageIds: string[];
  stages: PipelineStageConfig[];
  modelCalls: number;
};

export type QaExecutionPlan = ReviewExecutionPlan;
export type WorkflowExecutionPlan = ReviewExecutionPlan;

const STAGE_POLICY: Record<BudgetMode, Record<RiskLevel, string[] | "configured">> = {
  economy: {
    low: ["implement", "verify", "human_review"],
    medium: ["implement", "verify", "human_review"],
    high: ["analyze", "implement", "verify", "adversarial", "human_review"],
  },
  balanced: {
    low: ["implement", "verify", "human_review"],
    medium: ["analyze", "investigate", "implement", "verify", "human_review"],
    high: "configured",
  },
  thorough: {
    low: "configured",
    medium: "configured",
    high: "configured",
  },
};

export function planEngineeringExecution(
  envelope: TaskEnvelope,
  config: CadenceConfig,
  mode: BudgetMode,
): EngineeringExecutionPlan {
  const pipeline = config.pipelines.engineering;
  const policy = STAGE_POLICY[mode][envelope.risk];
  const configured = pipeline.riskStages[envelope.risk];
  const desired = policy === "configured" ? configured : policy;
  const stageIds = desired.filter((id) => Boolean(pipeline.stages[id]));
  const stages = stageIds.map((id) => pipeline.stages[id]!);
  const modelCalls = stages.filter((stage) => stage.modelProfile !== "shell" && stage.modelProfile !== "human").length;
  const connectedCalls = envelope.needsConnectedTools ? 1 : 0;
  const notes: string[] = [];
  if (!stageIds.includes("analyze")) notes.push("Uses local intent and risk classification; no analyzer model call.");
  if (!stageIds.includes("test_design")) notes.push("The implementer owns the test-first contract in this mode.");
  if (!stageIds.includes("adversarial")) notes.push("Independent adversarial review is skipped unless the task is escalated.");
  if (envelope.risk === "high" && mode === "economy") notes.push("High-risk work keeps analyzer and adversarial calls even in Economy mode.");
  return {
    mode,
    risk: envelope.risk,
    stageIds,
    stages,
    connectedCalls,
    modelCalls,
    totalModelCalls: connectedCalls + modelCalls,
    notes,
  };
}

export function formatExecutionPreflight(plan: EngineeringExecutionPlan, maxModelCalls: number | null = null): string {
  return [
    `${plan.mode.toUpperCase()} · ${plan.risk.toUpperCase()}-RISK ENGINEERING`,
    "",
    `Expected model calls: ${plan.totalModelCalls}`,
    `Per-task limit: ${maxModelCalls ?? "off"}`,
    ...(plan.connectedCalls ? [`  ${plan.connectedCalls} × connected context`] : []),
    `  ${plan.modelCalls} × engineering stages`,
    `Deterministic stages: ${plan.stages.filter((stage) => stage.modelProfile === "shell").map((stage) => stage.name).join(", ") || "none"}`,
    `Cadence: ${plan.stages.map((stage) => stage.name).join(" → ")}`,
    "Git safety: clean working tree confirmed; CadenceAI will check again before execution.",
    "",
    ...plan.notes.map((note) => `• ${note}`),
    "",
    "Press Enter to continue, choose /budget economy|balanced|thorough, or type /cancel.",
  ].join("\n");
}

export function planReviewExecution(config: CadenceConfig): ReviewExecutionPlan {
  const pipeline = config.pipelines.pullRequestReview;
  const stageIds = pipeline.order.filter((id) => Boolean(pipeline.stages[id]));
  const stages = stageIds.map((id) => pipeline.stages[id]!);
  return {
    stageIds,
    stages,
    modelCalls: stages.filter((stage) => stage.modelProfile !== "human" && stage.modelProfile !== "shell").length,
  };
}

export function formatReviewPreflight(plan: ReviewExecutionPlan, target: string, maxModelCalls: number | null = null): string {
  return [
    "THOROUGH · PULL-REQUEST REVIEW",
    "",
    `Target: ${target}`,
    `Expected model calls: ${plan.modelCalls}`,
    `Per-task limit: ${maxModelCalls ?? "off"}`,
    `Cadence: ${plan.stages.map((stage) => stage.name).join(" → ")}`,
    "",
    "PR review is read-only and currently always uses the configured thorough cadence; the active engineering budget does not reduce it.",
    ...(plan.modelCalls >= 4 ? ["Plan note: this is a high-call operation intended for changes that warrant independent scrutiny."] : []),
    "Press Enter to continue or type /cancel.",
  ].join("\n");
}

export function planQaExecution(config: CadenceConfig): QaExecutionPlan {
  const pipeline = config.pipelines.qualityAssurance;
  const stageIds = pipeline.order.filter((id) => Boolean(pipeline.stages[id]));
  const stages = stageIds.map((id) => pipeline.stages[id]!);
  return {
    stageIds,
    stages,
    modelCalls: stages.filter((stage) => stage.modelProfile !== "human" && stage.modelProfile !== "shell").length,
  };
}

export function formatQaPreflight(plan: QaExecutionPlan, targets: string[], maxModelCalls: number | null = null): string {
  return [
    "THOROUGH · TICKET QA",
    "",
    `Target: ${targets.join(", ") || "ticket and linked implementation"}`,
    `Expected model calls: ${plan.modelCalls}`,
    `Per-task limit: ${maxModelCalls ?? "off"}`,
    `Cadence: ${plan.stages.map((stage) => stage.name).join(" → ")}`,
    "",
    "QA is read-only. It retrieves ticket requirements, linked pull-request diffs, and CI/check evidence without changing files or external systems.",
    "Verification uses reported repository and pull-request evidence. Missing local execution evidence is reported as unverified, never guessed.",
    "Press Enter to continue or type /cancel.",
  ].join("\n");
}

export function planWorkflowExecution(config: CadenceConfig, kind: ReadOnlyWorkflowKind): WorkflowExecutionPlan {
  const pipeline = workflowPipeline(config, kind);
  const stageIds = pipeline.order.filter((id) => Boolean(pipeline.stages[id]));
  const stages = stageIds.map((id) => pipeline.stages[id]!);
  return {
    stageIds,
    stages,
    modelCalls: stages.filter((stage) => stage.modelProfile !== "human" && stage.modelProfile !== "shell").length,
  };
}

export function formatWorkflowPreflight(
  kind: ReadOnlyWorkflowKind,
  plan: WorkflowExecutionPlan,
  target: string,
  maxModelCalls: number | null = null,
): string {
  const metadata: Record<ReadOnlyWorkflowKind, { title: string; note: string }> = {
    refine: {
      title: "TICKET REFINEMENT",
      note: "Produces a proposed ready-for-development brief. It does not edit the source ticket.",
    },
    release: {
      title: "RELEASE READINESS",
      note: "Produces a read-only go/no-go assessment. Missing scope or verification evidence remains explicit.",
    },
    plan: {
      title: "CHALLENGED PLANNING",
      note: "Product, UX, engineering, commercial, and adversarial perspectives challenge one another before synthesis.",
    },
    crossrepo: {
      title: "CROSS-REPOSITORY PLAN",
      note: "Discovery is read-only. No repository will be modified, checked out, installed, built, or committed.",
    },
    handoff: {
      title: "SESSION HANDOFF",
      note: "Creates a local Markdown continuation brief under .cadence/handoffs without changing project files.",
    },
  };
  const details = metadata[kind];
  return [
    `THOROUGH · ${details.title}`,
    "",
    `Target: ${target}`,
    `Expected model calls: ${plan.modelCalls}`,
    `Per-task limit: ${maxModelCalls ?? "off"}`,
    `Cadence: ${plan.stages.map((stage) => stage.name).join(" → ")}`,
    "",
    details.note,
    "Press Enter to continue or type /cancel.",
  ].join("\n");
}

export function modelCallLimitViolation(calls: number, maxModelCalls: number | null): string | null {
  if (maxModelCalls === null || calls <= maxModelCalls) return null;
  return `This operation expects ${calls} model calls, above your configured limit of ${maxModelCalls}. Use /limit <number> to raise it, choose a leaner engineering budget, or cancel.`;
}
