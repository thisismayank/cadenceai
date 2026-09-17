CREATE TYPE "public"."approval_decision" AS ENUM('APPROVE', 'REJECT', 'REQUEST_CHANGES');--> statement-breakpoint
CREATE TYPE "public"."artifact_type" AS ENUM('EXECUTION_PLAN', 'IMPLEMENTATION_SUMMARY', 'TEST_REPORT', 'REVIEW_REPORT', 'DIFF', 'LOG', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('CREATED', 'ANALYZING', 'IMPLEMENTING', 'TESTING', 'ADVERSARIAL_REVIEW', 'AWAITING_HUMAN_APPROVAL', 'CREATING_PR', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."stage_kind" AS ENUM('ANALYZER', 'IMPLEMENTER', 'TESTER', 'ADVERSARIAL', 'HUMAN_APPROVAL', 'CREATE_PR');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('USER', 'GITHUB_ISSUE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"role" "stage_kind" NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"sandbox_id" uuid,
	"status" "stage_status" DEFAULT 'PENDING' NOT NULL,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"estimated_cost_cents" integer DEFAULT 0,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"decided_by" uuid,
	"decision" "approval_decision" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"type" "artifact_type" NOT NULL,
	"name" text NOT NULL,
	"content" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"kind" "stage_kind" NOT NULL,
	"status" "stage_status" DEFAULT 'PENDING' NOT NULL,
	"order_index" integer NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"status" "execution_status" DEFAULT 'CREATED' NOT NULL,
	"risk_level" "risk_level" DEFAULT 'MEDIUM' NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"base_commit" text,
	"inngest_run_id" text,
	"confidence_score" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"severity" "finding_severity" NOT NULL,
	"category" text NOT NULL,
	"file" text,
	"line" integer,
	"description" text NOT NULL,
	"evidence" text NOT NULL,
	"recommendation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"github_pr_number" integer,
	"github_url" text,
	"branch" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"github_owner" text NOT NULL,
	"github_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"detected_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sandboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_sandbox_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"base_commit" text,
	"branch" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destroyed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" "task_source" DEFAULT 'USER' NOT NULL,
	"source_reference" text,
	"risk_hint" "risk_level",
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_stage_id_execution_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."execution_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "execution_stages" ADD CONSTRAINT "execution_stages_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "executions" ADD CONSTRAINT "executions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "findings" ADD CONSTRAINT "findings_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "findings" ADD CONSTRAINT "findings_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policies" ADD CONSTRAINT "policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repositories" ADD CONSTRAINT "repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sandboxes" ADD CONSTRAINT "sandboxes_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secrets" ADD CONSTRAINT "secrets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_execution_idx" ON "agent_runs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_stage_idx" ON "agent_runs" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_execution_idx" ON "approvals" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_execution_idx" ON "artifacts" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_type_idx" ON "artifacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_stages_execution_idx" ON "execution_stages" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_stages_status_idx" ON "execution_stages" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "executions_task_idx" ON "executions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "executions_status_idx" ON "executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_execution_idx" ON "findings" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_severity_idx" ON "findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pull_requests_execution_idx" ON "pull_requests" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repositories_owner_name_idx" ON "repositories" USING btree ("github_owner","github_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandboxes_execution_idx" ON "sandboxes" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "secrets_workspace_key_idx" ON "secrets" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_workspace_idx" ON "tasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_repository_idx" ON "tasks" USING btree ("repository_id");