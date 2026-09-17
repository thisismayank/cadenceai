import type { CadenceConfig, PipelineStageConfig } from "./config.ts";
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

export function formatExecutionPreflight(plan: EngineeringExecutionPlan): string {
  return [
    `${plan.mode.toUpperCase()} · ${plan.risk.toUpperCase()}-RISK ENGINEERING`,
    "",
    `Expected model calls: ${plan.totalModelCalls}`,
    ...(plan.connectedCalls ? [`  ${plan.connectedCalls} × connected context`] : []),
    `  ${plan.modelCalls} × engineering stages`,
    `Deterministic stages: ${plan.stages.filter((stage) => stage.modelProfile === "shell").map((stage) => stage.name).join(", ") || "none"}`,
    `Cadence: ${plan.stages.map((stage) => stage.name).join(" → ")}`,
    "",
    ...plan.notes.map((note) => `• ${note}`),
    "",
    "Press Enter to continue, choose /budget economy|balanced|thorough, or type /cancel.",
  ].join("\n");
}
