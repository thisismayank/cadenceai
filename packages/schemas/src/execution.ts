import { z } from "zod";
import { RiskLevel } from "./state-machine";

export const CreateExecutionInput = z.object({
  taskId: z.string().uuid(),
  baseBranch: z.string().default("main"),
  riskLevel: RiskLevel.default("MEDIUM"),
});
export type CreateExecutionInput = z.infer<typeof CreateExecutionInput>;

export const ApprovalDecision = z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const ApprovalInput = z.object({
  decision: ApprovalDecision,
  note: z.string().max(2000).optional(),
});
export type ApprovalInput = z.infer<typeof ApprovalInput>;
