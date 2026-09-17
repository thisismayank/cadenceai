import { z } from "zod";
import { RiskLevel } from "./state-machine";

export const TaskSource = z.enum(["USER", "GITHUB_ISSUE"]);
export type TaskSource = z.infer<typeof TaskSource>;

export const CreateTaskInput = z.object({
  repositoryId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(10_000),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  source: TaskSource.default("USER"),
  sourceReference: z.string().max(500).optional(),
  riskHint: RiskLevel.optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;
