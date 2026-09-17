import { z } from "zod";

export const ExecutionStatus = z.enum([
  "CREATED",
  "ANALYZING",
  "IMPLEMENTING",
  "TESTING",
  "ADVERSARIAL_REVIEW",
  "AWAITING_HUMAN_APPROVAL",
  "CREATING_PR",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

export const StageKind = z.enum([
  "ANALYZER",
  "IMPLEMENTER",
  "TESTER",
  "ADVERSARIAL",
  "HUMAN_APPROVAL",
  "CREATE_PR",
]);
export type StageKind = z.infer<typeof StageKind>;

export const StageStatus = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
]);
export type StageStatus = z.infer<typeof StageStatus>;

export const RiskLevel = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const V1_STAGE_ORDER: readonly StageKind[] = [
  "ANALYZER",
  "IMPLEMENTER",
  "TESTER",
  "ADVERSARIAL",
  "HUMAN_APPROVAL",
  "CREATE_PR",
] as const;

export const STAGE_TO_EXECUTION_STATUS: Record<StageKind, ExecutionStatus> = {
  ANALYZER: "ANALYZING",
  IMPLEMENTER: "IMPLEMENTING",
  TESTER: "TESTING",
  ADVERSARIAL: "ADVERSARIAL_REVIEW",
  HUMAN_APPROVAL: "AWAITING_HUMAN_APPROVAL",
  CREATE_PR: "CREATING_PR",
};

const EXECUTION_TRANSITIONS: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  CREATED: ["ANALYZING", "CANCELLED", "FAILED"],
  ANALYZING: ["IMPLEMENTING", "FAILED", "CANCELLED"],
  IMPLEMENTING: ["TESTING", "FAILED", "CANCELLED"],
  TESTING: ["ADVERSARIAL_REVIEW", "FAILED", "CANCELLED"],
  ADVERSARIAL_REVIEW: ["AWAITING_HUMAN_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  AWAITING_HUMAN_APPROVAL: ["CREATING_PR", "CANCELLED"],
  CREATING_PR: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  BLOCKED: ["CANCELLED"],
};

export function canTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
): boolean {
  return EXECUTION_TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid execution transition: ${from} -> ${to}`);
  }
}

const STAGE_TRANSITIONS: Record<StageStatus, readonly StageStatus[]> = {
  PENDING: ["RUNNING", "SKIPPED", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  SKIPPED: [],
  CANCELLED: [],
};

export function canTransitionStage(
  from: StageStatus,
  to: StageStatus,
): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}

export function assertStageTransition(
  from: StageStatus,
  to: StageStatus,
): void {
  if (!canTransitionStage(from, to)) {
    throw new Error(`Invalid stage transition: ${from} -> ${to}`);
  }
}
