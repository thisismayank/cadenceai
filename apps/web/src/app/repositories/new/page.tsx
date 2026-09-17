import { createRepositoryAction } from "@/lib/actions";

export default function NewRepositoryPage() {
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold">Add a repository</h1>
      <p className="text-sm text-[color:var(--muted)]">
        Phase 0 just records the identifier. No GitHub token is stored yet.
      </p>
      <form action={createRepositoryAction} className="space-y-4">
        <label className="block text-sm">
          <span className="text-[color:var(--muted)]">GitHub owner</span>
          <input
            name="owner"
            required
            placeholder="thisismayank"
            className="mt-1 w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[color:var(--muted)]">Repository name</span>
          <input
            name="name"
            required
            placeholder="rainier-companion"
            className="mt-1 w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[color:var(--muted)]">Default branch</span>
          <input
            name="defaultBranch"
            defaultValue="main"
            className="mt-1 w-full bg-transparent border border-[color:var(--border)] rounded px-3 py-2 font-mono"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-[color:var(--accent)] text-white text-sm px-4 py-2"
        >
          Add repository
        </button>
      </form>
    </div>
  );
}
