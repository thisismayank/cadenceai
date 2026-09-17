import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  pgEnum,
  index,
  boolean,
} from "drizzle-orm/pg-core";

// ---- Enums ------------------------------------------------------------------

export const executionStatusEnum = pgEnum("execution_status", [
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

export const stageKindEnum = pgEnum("stage_kind", [
  "ANALYZER",
  "IMPLEMENTER",
  "TESTER",
  "ADVERSARIAL",
  "HUMAN_APPROVAL",
  "CREATE_PR",
]);

export const stageStatusEnum = pgEnum("stage_status", [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const taskSourceEnum = pgEnum("task_source", ["USER", "GITHUB_ISSUE"]);

export const artifactTypeEnum = pgEnum("artifact_type", [
  "EXECUTION_PLAN",
  "IMPLEMENTATION_SUMMARY",
  "TEST_REPORT",
  "REVIEW_REPORT",
  "DIFF",
  "LOG",
  "OTHER",
]);

export const findingSeverityEnum = pgEnum("finding_severity", [
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
  "APPROVE",
  "REJECT",
  "REQUEST_CHANGES",
]);

// ---- Tables -----------------------------------------------------------------

// V1 is single-user. workspaces exists so the schema is multi-tenant-ready.
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    githubOwner: text("github_owner").notNull(),
    githubName: text("github_name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    // repositoryContext holds detected commands (install/test/lint/typecheck), languages, etc.
    detectedContext: jsonb("detected_context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    ownerNameIdx: index("repositories_owner_name_idx").on(t.githubOwner, t.githubName),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    source: taskSourceEnum("source").notNull().default("USER"),
    sourceReference: text("source_reference"),
    riskHint: riskLevelEnum("risk_hint"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    workspaceIdx: index("tasks_workspace_idx").on(t.workspaceId),
    repositoryIdx: index("tasks_repository_idx").on(t.repositoryId),
  }),
);

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: executionStatusEnum("status").notNull().default("CREATED"),
    riskLevel: riskLevelEnum("risk_level").notNull().default("MEDIUM"),
    baseBranch: text("base_branch").notNull().default("main"),
    baseCommit: text("base_commit"),
    // The Inngest run id, for cross-referencing to the workflow engine.
    inngestRunId: text("inngest_run_id"),
    // Populated when computed. Deterministic function of artifacts.
    confidenceScore: integer("confidence_score"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    taskIdx: index("executions_task_idx").on(t.taskId),
    statusIdx: index("executions_status_idx").on(t.status),
  }),
);

export const executionStages = pgTable(
  "execution_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    kind: stageKindEnum("kind").notNull(),
    status: stageStatusEnum("status").notNull().default("PENDING"),
    orderIndex: integer("order_index").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    executionIdx: index("execution_stages_execution_idx").on(t.executionId),
    statusIdx: index("execution_stages_status_idx").on(t.status),
  }),
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => executionStages.id, { onDelete: "cascade" }),
    role: stageKindEnum("role").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    sandboxId: uuid("sandbox_id"),
    status: stageStatusEnum("status").notNull().default("PENDING"),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    estimatedCostCents: integer("estimated_cost_cents").default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    executionIdx: index("agent_runs_execution_idx").on(t.executionId),
    stageIdx: index("agent_runs_stage_idx").on(t.stageId),
  }),
);

export const sandboxes = pgTable(
  "sandboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSandboxId: text("provider_sandbox_id"),
    status: text("status").notNull().default("PENDING"),
    baseCommit: text("base_commit"),
    branch: text("branch"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
  },
  (t) => ({
    executionIdx: index("sandboxes_execution_idx").on(t.executionId),
  }),
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    type: artifactTypeEnum("type").notNull(),
    name: text("name").notNull(),
    content: jsonb("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    executionIdx: index("artifacts_execution_idx").on(t.executionId),
    typeIdx: index("artifacts_type_idx").on(t.type),
  }),
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    severity: findingSeverityEnum("severity").notNull(),
    category: text("category").notNull(),
    file: text("file"),
    line: integer("line"),
    description: text("description").notNull(),
    evidence: text("evidence").notNull(),
    recommendation: text("recommendation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    executionIdx: index("findings_execution_idx").on(t.executionId),
    severityIdx: index("findings_severity_idx").on(t.severity),
  }),
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    decidedBy: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decision: approvalDecisionEnum("decision").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    executionIdx: index("approvals_execution_idx").on(t.executionId),
  }),
);

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubPrNumber: integer("github_pr_number"),
    githubUrl: text("github_url"),
    branch: text("branch").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    executionIdx: index("pull_requests_execution_idx").on(t.executionId),
  }),
);

// Encrypted at rest. AES-256-GCM with CADENCEAI_MASTER_KEY. content stores iv+ciphertext.
export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    workspaceKeyIdx: index("secrets_workspace_key_idx").on(t.workspaceId, t.key),
  }),
);

// Empty in V1 — schema exists so migrations don't churn later.
export const policies = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  riskLevel: riskLevelEnum("risk_level").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
