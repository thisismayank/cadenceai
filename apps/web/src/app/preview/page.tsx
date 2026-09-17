const stages = [
  { name: "Analyze", detail: "Task classified · medium complexity · medium risk", model: "Codex · Luna · low", status: "complete", time: "4s" },
  { name: "Investigate", detail: "Located retry path and idempotency boundary", model: "Codex · Terra · medium", status: "complete", time: "31s" },
  { name: "Design tests", detail: "3 regression cases written in an isolated worktree", model: "Claude · Sonnet · high", status: "complete", time: "46s" },
  { name: "Implement", detail: "Idempotency key persisted before delivery", model: "Codex · Sol · high", status: "running", time: "1m 12s" },
  { name: "Verify", detail: "Waiting for implementation", model: "Shell · deterministic", status: "waiting", time: "—" },
  { name: "Adversarial", detail: "Waiting for verified candidate", model: "Claude · Sonnet · high", status: "waiting", time: "—" },
];

const statusStyle = {
  complete: "bg-emerald-400",
  running: "bg-sky-400 animate-pulse",
  waiting: "bg-zinc-700",
} as const;

export default function PreviewPage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
            <span className="rounded-full border border-[color:var(--border)] px-2 py-1">RUN 8F2A</span>
            <span>rainier-companion</span>
            <span>·</span>
            <span>main</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight">
            Prevent duplicate notification delivery without changing the public API
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[color:var(--muted)]">
            CadenceAI selected six stages, two coding-agent CLIs, and an independent test-first path.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-sm text-zinc-300">Cancel</button>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">Open worktree</button>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-4">
        {[
          ["Status", "Implementing"],
          ["Elapsed", "2m 33s"],
          ["CLI usage", "Codex 2 · Claude 1"],
          ["Context", "18.4k tokens"],
        ].map(([label, value]) => (
          <div key={label} className="bg-[#111114] p-4">
            <p className="text-[11px] uppercase tracking-widest text-[color:var(--muted)]">{label}</p>
            <p className="mt-2 font-mono text-sm">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.45fr_.75fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Execution cadence</h2>
            <span className="text-xs text-[color:var(--muted)]">4 of 6 active or complete</span>
          </div>
          <ol className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[#111114]">
            {stages.map((stage, index) => (
              <li key={stage.name} className="grid grid-cols-[28px_1fr_auto] gap-3 border-b border-[color:var(--border)] p-4 last:border-0">
                <div className="relative flex justify-center pt-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusStyle[stage.status as keyof typeof statusStyle]}`} />
                  {index < stages.length - 1 && <span className="absolute left-1/2 top-4 h-[calc(100%+20px)] w-px -translate-x-1/2 bg-[color:var(--border)]" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{stage.name}</h3>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-400">{stage.model}</span>
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{stage.detail}</p>
                </div>
                <span className="font-mono text-xs text-[color:var(--muted)]">{stage.time}</span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[color:var(--border)] bg-[#111114] p-5">
            <p className="text-[11px] uppercase tracking-widest text-[color:var(--muted)]">Executable contract</p>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-semibold">3</span>
              <span className="text-sm text-[color:var(--muted)]">tests designed first</span>
            </div>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-2"><span className="text-emerald-400">✓</span> Duplicate retry reproduces on base commit</li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span> Concurrent delivery remains idempotent</li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span> Public response shape is unchanged</li>
            </ul>
          </section>

          <section className="rounded-xl border border-[color:var(--border)] bg-[#111114] p-5">
            <p className="text-[11px] uppercase tracking-widest text-[color:var(--muted)]">Live activity</p>
            <div className="mt-4 space-y-3 font-mono text-xs text-zinc-400">
              <p><span className="text-zinc-600">14:32:08</span> codex inspected delivery.ts</p>
              <p><span className="text-zinc-600">14:32:16</span> patch applied to retry.ts</p>
              <p><span className="text-zinc-600">14:32:19</span> targeted test running</p>
              <p className="text-sky-300"><span className="text-zinc-600">14:32:21</span> implementation in progress…</p>
            </div>
          </section>

          <details className="rounded-xl border border-[color:var(--border)] bg-[#111114] p-5">
            <summary className="cursor-pointer text-sm font-medium">Why these models?</summary>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              Luna handled inexpensive classification, Terra explored the unfamiliar code path, Sol received the write-capable implementation stage, and Claude independently designed the regression contract.
            </p>
          </details>
        </aside>
      </div>

      <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100/80">
        Interface preview — representative data only. No coding-agent command is running from this screen yet.
      </p>
    </div>
  );
}
