import { eq } from "drizzle-orm";
import { repositories } from "@cadenceai/db";
import { getDb } from "@/lib/db";
import { ensureSingleUserWorkspace } from "@/lib/seed";
import { createTaskAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const { workspaceId } = await ensureSingleUserWorkspace();
  const db = getDb();
  const repos = await db
    .select()
    .from(repositories)
    .where(eq(repositories.workspaceId, workspaceId));

  if (repos.length === 0) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-xl font-semibold">New task</h1>
        <p className="text-sm text-[color:var(--muted)]">
          No repositories connected yet.{" "}
          <a href="/repositories/new" className="text-[color:var(--accent)] underline">
            Add one first
          </a>.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">New task</h1>
      <form action={createTaskAction} className="space-y-4">
        <label className="block text-sm">
          <span className="text-[color:var(--muted)]">Repository</span>
          <select
            name="repositoryId"
            required
            className="mt-1 w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2"
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id} className="bg-[color:var(--background)]">
                {r.githubOwner}/{r.githubName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[color:var(--muted)]">Title</span>
          <input
            name="title"
            required
            placeholder="Fix duplicate notification delivery"
            className="mt-1 w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[color:var(--muted)]">Description</span>
          <textarea
            name="description"
            required
            rows={6}
            placeholder="What needs to change and why. Include reproduction steps if relevant."
            className="mt-1 w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[color:var(--muted)]">
            Acceptance criteria (one per line)
          </span>
          <textarea
            name="acceptanceCriteria"
            rows={4}
            placeholder={"Retries must remain safe\nPublic API cannot change"}
            className="mt-1 w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-[color:var(--accent)] text-white text-sm px-4 py-2"
        >
          Create task
        </button>
      </form>
    </div>
  );
}
