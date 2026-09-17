import { z } from "zod";

export const ArtifactType = z.enum([
  "EXECUTION_PLAN",
  "IMPLEMENTATION_SUMMARY",
  "TEST_REPORT",
  "REVIEW_REPORT",
  "DIFF",
  "LOG",
  "OTHER",
]);
export type ArtifactType = z.infer<typeof ArtifactType>;

export const FindingSeverity = z.enum([
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);
export type FindingSeverity = z.infer<typeof FindingSeverity>;

export const Finding = z.object({
  severity: FindingSeverity,
  category: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  description: z.string().min(1),
  evidence: z.string().min(1),
  recommendation: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const ModelCapabilityProfile = z.enum([
  "fast_classifier",
  "balanced_reasoner",
  "flagship_coder",
  "flagship_reasoner",
  "critical_escalation",
  "deep_research",
  "coding",
  "fast_judge",
  "adversarial_reasoner",
  "final_synthesizer",
]);
export type ModelCapabilityProfile = z.infer<typeof ModelCapabilityProfile>;

export const PlannedStage = z.object({
  id: z.string().min(1),
  role: z.enum([
    "ANALYZER",
    "INVESTIGATOR",
    "TEST_DESIGNER",
    "IMPLEMENTER",
    "VERIFIER",
    "ADVERSARIAL",
    "HUMAN_REVIEW",
  ]),
  dependsOn: z.array(z.string().min(1)).default([]),
  modelProfile: ModelCapabilityProfile,
  reasoningEffort: z.enum(["low", "medium", "high"]),
  rationale: z.string().min(1),
  required: z.boolean().default(true),
});
export type PlannedStage = z.infer<typeof PlannedStage>;

export const ExecutionPlan = z.object({
  intent: z.enum(["software_change", "investigation", "question"]),
  complexity: z.enum(["low", "medium", "high"]),
  risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  summary: z.string().min(1),
  ambiguities: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  stages: z.array(PlannedStage).min(1),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlan>;

export const ImplementationSummary = z.object({
  narrative: z.string().min(1),
  filesChanged: z.array(z.string()),
  testsAdded: z.array(z.string()).default([]),
  testsExecuted: z.array(z.string()).default([]),
  knownLimitations: z.array(z.string()).default([]),
});
export type ImplementationSummary = z.infer<typeof ImplementationSummary>;

export const CriterionVerification = z.object({
  criterion: z.string().min(1),
  status: z.enum(["verified", "unverified", "failed"]),
  evidence: z.string(),
});
export type CriterionVerification = z.infer<typeof CriterionVerification>;

export const TestReport = z.object({
  status: z.enum(["pass", "fail", "uncertain"]),
  testsRun: z.array(z.string()).default([]),
  testsPassed: z.number().int().nonnegative(),
  testsFailed: z.number().int().nonnegative(),
  lintPassed: z.boolean(),
  typecheckPassed: z.boolean(),
  acceptanceCriteria: z.array(CriterionVerification).default([]),
  failures: z.array(z.string()).default([]),
});
export type TestReport = z.infer<typeof TestReport>;

export const ReviewReport = z.object({
  findings: z.array(Finding).default([]),
  overallVerdict: z.enum(["safe_to_merge", "concerns", "block"]),
  summary: z.string().min(1),
});
export type ReviewReport = z.infer<typeof ReviewReport>;

export const DiffArtifact = z.object({
  patch: z.string(),
  filesChanged: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  baseCommit: z.string(),
  headCommit: z.string(),
});
export type DiffArtifact = z.infer<typeof DiffArtifact>;

export const ARTIFACT_CONTENT_SCHEMA = {
  EXECUTION_PLAN: ExecutionPlan,
  IMPLEMENTATION_SUMMARY: ImplementationSummary,
  TEST_REPORT: TestReport,
  REVIEW_REPORT: ReviewReport,
  DIFF: DiffArtifact,
  LOG: z.object({ raw: z.string() }),
  OTHER: z.record(z.string(), z.unknown()),
} as const;

export function validateArtifactContent<T extends ArtifactType>(
  type: T,
  content: unknown,
): z.infer<(typeof ARTIFACT_CONTENT_SCHEMA)[T]> {
  const schema = ARTIFACT_CONTENT_SCHEMA[type];
  return schema.parse(content) as z.infer<(typeof ARTIFACT_CONTENT_SCHEMA)[T]>;
}
