import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import {
  agentRuns,
  artifacts as artifactsTable,
  executions,
  executionStages,
  findings as findingsTable,
  pullRequests,
  tasks,
} from "@cadenceai/db";
import { getDb } from "@/lib/db";
import { submitDecisionAction } from "@/lib/actions";
import { ExecutionPlan } from "@cadenceai/schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function ExecutionDetailPage({ params }: Params) {
  const { id } = await params;
  const db = getDb();

  const rows = await db
    .select({ execution: executions, task: tasks })
    .from(executions)
    .innerJoin(tasks, eq(tasks.id, executions.taskId))
    .where(eq(executions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const stages = await db
    .select()
    .from(executionStages)
    .where(eq(executionStages.executionId, id))
    .orderBy(asc(executionStages.orderIndex));

  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.executionId, id));

  const artifactRows = await db
    .select()
    .from(artifactsTable)
    .where(eq(artifactsTable.executionId, id));

  const findingRows = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.executionId, id));

  const prRows = await db
    .select()
    .from(pullRequests)
    .where(eq(pullRequests.executionId, id));

  const awaitingApproval = row.execution.status === "AWAITING_HUMAN_APPROVAL";
  const planArtifact = artifactRows.find((artifact) => artifact.type === "EXECUTION_PLAN");
  const parsedPlan = planArtifact
    ? ExecutionPlan.safeParse(planArtifact.content)
    : null;
  const plan = parsedPlan?.success ? parsedPlan.data : null;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs text-[color:var(--muted)] font-mono">
          execution {row.execution.id}
        </p>
        <h1 className="text-2xl font-semibold mt-1">{row.task.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm">
          <span className="font-mono">{row.execution.status}</span>
          {row.execution.confidenceScore !== null && (
            <span className="font-mono text-[color:var(--muted)]">
              confidence {row.execution.confidenceScore}/100
            </span>
          )}
          <span className="font-mono text-[color:var(--muted)]">
            risk {row.execution.riskLevel}
          </span>
        </div>
      </header>

      {plan && (
        <section>
          <div className="flex items-end justify-between gap-4 mb-3">
            <div>
              <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide">
                Analyzer plan
              </h2>
              <p className="text-sm mt-1">{plan.summary}</p>
            </div>
            <div className="text-xs font-mono text-[color:var(--muted)] text-right shrink-0">
              <div>{plan.intent.replaceAll("_", " ")}</div>
              <div>{plan.complexity} complexity · {plan.risk} risk</div>
            </div>
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {plan.stages.map((stage, index) => (
              <li
                key={stage.id}
                className="relative border border-[color:var(--border)] rounded p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-[color:var(--muted)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide rounded bg-white/5 px-2 py-1">
                    {stage.reasoningEffort} reasoning
                  </span>
                </div>
                <h3 className="font-semibold mt-3">{stage.role}</h3>
                <p className="font-mono text-xs text-[color:var(--accent)] mt-1">
                  {stage.modelProfile}
                </p>
                <p className="text-xs text-[color:var(--muted)] mt-3">
                  {stage.rationale}
                </p>
                {stage.dependsOn.length > 0 && (
                  <p className="text-[10px] text-[color:var(--muted)] mt-3 font-mono">
                    after {stage.dependsOn.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {plan.ambiguities.length > 0 && (
            <div className="mt-3 border border-yellow-500/30 bg-yellow-500/5 rounded p-3">
              <p className="text-xs uppercase tracking-wide text-yellow-200">
                Unresolved ambiguities
              </p>
              <ul className="text-sm mt-2 list-disc pl-5">
                {plan.ambiguities.map((ambiguity) => (
                  <li key={ambiguity}>{ambiguity}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide mb-3">
          Stages
        </h2>
        <ol className="space-y-2">
          {stages.map((s) => {
            const run = runs.find((r) => r.stageId === s.id);
            return (
              <li
                key={s.id}
                className="border border-[color:var(--border)] rounded p-3 flex items-center gap-3"
              >
                <span className="font-mono text-xs w-6 text-right">
                  {s.orderIndex + 1}
                </span>
                <span className="font-medium">{s.kind}</span>
                <span className="text-xs text-[color:var(--muted)]">
                  {s.status}
                </span>
                {run && (
                  <span className="text-xs text-[color:var(--muted)] font-mono ml-auto">
                    {run.provider} · {run.inputTokens}in/{run.outputTokens}out
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {artifactRows.length > 0 && (
        <section>
          <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide mb-3">
            Artifacts
          </h2>
          <ul className="space-y-3">
            {artifactRows.filter((a) => a.type !== "EXECUTION_PLAN").map((a) => (
              <li
                key={a.id}
                className="border border-[color:var(--border)] rounded p-3"
              >
                <div className="flex items-center gap-3 mb-2 text-xs">
                  <span className="font-mono">{a.type}</span>
                  <span className="text-[color:var(--muted)]">{a.name}</span>
                </div>
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(a.content, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      )}

      {findingRows.length > 0 && (
        <section>
          <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide mb-3">
            Findings
          </h2>
          <ul className="space-y-2">
            {findingRows.map((f) => (
              <li
                key={f.id}
                className="border border-[color:var(--border)] rounded p-3"
              >
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono uppercase">{f.severity}</span>
                  <span className="text-[color:var(--muted)]">{f.category}</span>
                  {f.file && (
                    <span className="text-[color:var(--muted)] font-mono">
                      {f.file}
                      {f.line !== null ? `:${f.line}` : ""}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">{f.description}</p>
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  {f.evidence}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prRows.length > 0 && (
        <section>
          <h2 className="text-sm text-[color:var(--muted)] uppercase tracking-wide mb-3">
            Pull request
          </h2>
          {prRows.map((pr) => (
            <a
              key={pr.id}
              href={pr.githubUrl ?? "#"}
              className="text-sm text-[color:var(--accent)] hover:underline"
            >
              {pr.githubUrl ?? `${pr.branch} (mock)`}
            </a>
          ))}
        </section>
      )}

      {awaitingApproval && (
        <section className="border border-yellow-500/30 bg-yellow-500/5 rounded p-4">
          <h2 className="text-sm uppercase tracking-wide mb-3 text-yellow-200">
            Human approval required
          </h2>
          <form action={submitDecisionAction} className="space-y-3">
            <input type="hidden" name="executionId" value={id} />
            <textarea
              name="note"
              rows={2}
              placeholder="Optional note"
              className="w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                name="decision"
                value="APPROVE"
                className="rounded bg-emerald-500/80 text-white text-sm px-4 py-2"
              >
                Approve
              </button>
              <button
                type="submit"
                name="decision"
                value="REQUEST_CHANGES"
                className="rounded bg-sky-500/80 text-white text-sm px-4 py-2"
              >
                Request changes
              </button>
              <button
                type="submit"
                name="decision"
                value="REJECT"
                className="rounded bg-red-500/80 text-white text-sm px-4 py-2"
              >
                Reject
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
