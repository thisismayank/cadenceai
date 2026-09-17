import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readUsageSummary, recordRoutingUsage } from "./usage.ts";

test("usage ledger summarizes successful local model activity", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadence-usage-"));
  try {
    await recordRoutingUsage(cwd, "conversation", {
      cli: "claude", model: "sonnet", effort: "low", text: "ok", rawOutput: "ok",
      requestedProfile: "conversation", candidate: { cli: "claude", model: "sonnet", effort: "low" },
      fallbackUsed: false, failedCandidates: [],
    });
    const summary = await readUsageSummary(cwd);
    assert.match(summary, /claude\s+1 successful call/);
    assert.match(summary, /claude\/sonnet · 1/);
    assert.match(summary, /not the provider's authoritative quota balance/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
