import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { executions, repositories, tasks } from "@cadenceai/db";
import { getDb } from "@/lib/db";
import { startExecutionAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function TaskDetailPage({ params }: Params) {
  const { id } = await params;
  const db = getDb();

  const rows = await db
    .select({ task: tasks, repository: repositories })
    .from(tasks)
    .innerJoin(repositories, eq(repositories.id, tasks.repositoryId))
    .where(eq(tasks.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const execRows = await db
    .select()
    .from(executions)
    .where(eq(executions.taskId, id))
    .orderBy(desc(executions.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-[color:var(--muted)] font-mono">
          {row.repository.githubOwner}/{row.repository.githubName}
        </p>
        <h1 className="text-2xl font-semibold mt-1">{row.task.title}</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm">{row.task.description}</p>
        {row.task.acceptanceCriteria.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide">
              Acceptance criteria
            </h2>
            <ul className="list-disc pl-5 text-sm mt-1 space-y-1">
              {row.task.acceptanceCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <section className="border border-[color:var(--border)] rounded p-4">
        <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide mb-3">
          Start a new execution
        </h2>
        <form action={startExecutionAction} className="flex items-center gap-3">
          <input type="hidden" name="taskId" value={id} />
          <input
            name="baseBranch"
            defaultValue={row.repository.defaultBranch}
            className="bg-transparent border border-[color:var(--border)] rounded px-3 py-1.5 text-sm font-mono"
          />
          <select
            name="riskLevel"
            defaultValue="MEDIUM"
            className="bg-transparent border border-[color:var(--border)] rounded px-3 py-1.5 text-sm"
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <button
            type="submit"
            className="rounded bg-[color:var(--accent)] text-white text-sm px-4 py-1.5"
          >
            Run
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide mb-2">
          Executions
        </h2>
        {execRows.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">No executions yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)] border border-[color:var(--border)] rounded">
            {execRows.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center gap-3">
                <Link
                  href={`/executions/${e.id}`}
                  className="font-mono text-xs hover:underline flex-1"
                >
                  {e.id.slice(0, 8)}
                </Link>
                <span className="text-xs">{e.status}</span>
                {e.confidenceScore !== null && (
                  <span className="text-xs font-mono text-[color:var(--muted)]">
                    {e.confidenceScore}/100
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
