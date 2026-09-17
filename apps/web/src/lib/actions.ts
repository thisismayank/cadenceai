"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  approvals,
  executions,
  repositories,
  tasks,
} from "@cadenceai/db";
import {
  ApprovalDecision,
  CreateExecutionInput,
  CreateTaskInput,
} from "@cadenceai/schemas";
import { getDb } from "./db";
import { ensureSingleUserWorkspace } from "./seed";
import { inngest } from "./providers";

function splitCriteria(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function createRepositoryAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ensureSingleUserWorkspace();
  const owner = String(formData.get("owner") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const defaultBranch = String(formData.get("defaultBranch") ?? "main").trim() || "main";
  if (!owner || !name) {
    throw new Error("owner and name are required");
  }
  const db = getDb();
  await db.insert(repositories).values({
    workspaceId,
    githubOwner: owner,
    githubName: name,
    defaultBranch,
  });
  revalidatePath("/");
  redirect("/");
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const { workspaceId, userId } = await ensureSingleUserWorkspace();
  const input = CreateTaskInput.parse({
    repositoryId: String(formData.get("repositoryId") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    acceptanceCriteria: splitCriteria(formData.get("acceptanceCriteria") as string | null),
    source: "USER",
  });
  const db = getDb();
  const inserted = await db
    .insert(tasks)
    .values({
      workspaceId,
      repositoryId: input.repositoryId,
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      source: input.source,
      createdBy: userId,
    })
    .returning({ id: tasks.id });
  const taskId = inserted[0]!.id;
  revalidatePath("/");
  redirect(`/tasks/${taskId}`);
}

export async function startExecutionAction(formData: FormData): Promise<void> {
  const input = CreateExecutionInput.parse({
    taskId: String(formData.get("taskId") ?? ""),
    baseBranch: String(formData.get("baseBranch") ?? "main"),
    riskLevel: (formData.get("riskLevel") as string) || "MEDIUM",
  });
  const db = getDb();
  const inserted = await db
    .insert(executions)
    .values({
      taskId: input.taskId,
      baseBranch: input.baseBranch,
      riskLevel: input.riskLevel,
      status: "CREATED",
    })
    .returning({ id: executions.id });
  const executionId = inserted[0]!.id;

  await inngest.send({
    name: "execution/created",
    data: { executionId },
  });

  revalidatePath(`/tasks/${input.taskId}`);
  redirect(`/executions/${executionId}`);
}

export async function submitDecisionAction(formData: FormData): Promise<void> {
  const { userId } = await ensureSingleUserWorkspace();
  const executionId = String(formData.get("executionId") ?? "");
  const decision = ApprovalDecision.parse(String(formData.get("decision") ?? ""));
  const note = (formData.get("note") as string | null)?.trim() || undefined;

  const db = getDb();
  const rows = await db
    .select({ id: executions.id, status: executions.status })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);
  if (!rows[0]) throw new Error("Execution not found");
  if (rows[0].status !== "AWAITING_HUMAN_APPROVAL") {
    throw new Error(
      `Execution ${executionId} cannot accept a decision in status ${rows[0].status}`,
    );
  }

  await db.insert(approvals).values({
    executionId,
    decidedBy: userId,
    decision,
    note,
  });

  await inngest.send({
    name: "execution/decision",
    data: { executionId, decision, note, decidedBy: userId },
  });

  revalidatePath(`/executions/${executionId}`);
}
