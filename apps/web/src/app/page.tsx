import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { executions, repositories, tasks } from "@cadenceai/db";
import { getDb } from "@/lib/db";
import { ensureSingleUserWorkspace } from "@/lib/seed";

export const dynamic = "force-dynamic";

type ExecutionRow = {
  id: string;
  status: string;
  createdAt: Date;
  taskId: string;
  taskTitle: string;
  confidenceScore: number | null;
};

async function loadDashboard() {
  const { workspaceId } = await ensureSingleUserWorkspace();
  const db = getDb();

  const repoRows = await db
    .select()
    .from(repositories)
    .where(eq(repositories.workspaceId, workspaceId));

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId))
    .orderBy(desc(tasks.createdAt))
    .limit(20);

  const executionRows: ExecutionRow[] = (
    await db
      .select({
        id: executions.id,
        status: executions.status,
        createdAt: executions.createdAt,
        taskId: executions.taskId,
        taskTitle: tasks.title,
        confidenceScore: executions.confidenceScore,
      })
      .from(executions)
      .innerJoin(tasks, eq(tasks.id, executions.taskId))
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(desc(executions.createdAt))
      .limit(20)
  ).map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt),
  }));

  return { repos: repoRows, tasks: taskRows, executions: executionRows };
}

function statusBadge(status: string) {
  const color =
    status === "COMPLETED"
      ? "bg-emerald-500/10 text-emerald-300"
      : status === "FAILED" || status === "CANCELLED" || status === "BLOCKED"
        ? "bg-red-500/10 text-red-300"
        : status === "AWAITING_HUMAN_APPROVAL"
          ? "bg-yellow-500/10 text-yellow-200"
          : "bg-sky-500/10 text-sky-200";
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${color}`}>{status}</span>
  );
}

export default async function DashboardPage() {
  const { repos, tasks, executions } = await loadDashboard();

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-xl font-semibold">Repositories</h1>
          <Link
            href="/repositories/new"
            className="text-sm text-[color:var(--accent)] hover:underline"
          >
            Add repository →
          </Link>
        </div>
        {repos.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">
            Connect a repository to create tasks.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)] border border-[color:var(--border)] rounded">
            {repos.map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                <span className="font-mono text-sm">
                  {r.githubOwner}/{r.githubName}
                </span>
                <span className="text-xs text-[color:var(--muted)]">
                  default: {r.defaultBranch}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-xl font-semibold">Tasks</h1>
          <Link
            href="/tasks/new"
            className="text-sm text-[color:var(--accent)] hover:underline"
          >
            New task →
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">No tasks yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)] border border-[color:var(--border)] rounded">
            {tasks.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <Link
                  href={`/tasks/${t.id}`}
                  className="font-medium hover:underline"
                >
                  {t.title}
                </Link>
                <p className="text-sm text-[color:var(--muted)] line-clamp-1">
                  {t.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h1 className="text-xl font-semibold mb-3">Executions</h1>
        {executions.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">No executions yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)] border border-[color:var(--border)] rounded">
            {executions.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center gap-3">
                <Link
                  href={`/executions/${e.id}`}
                  className="font-medium hover:underline flex-1"
                >
                  {e.taskTitle}
                </Link>
                {statusBadge(e.status)}
                {e.confidenceScore !== null && (
                  <span className="text-xs font-mono text-[color:var(--muted)]">
                    {e.confidenceScore}/100
                  </span>
                )}
                <span className="text-xs text-[color:var(--muted)]">
                  {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
