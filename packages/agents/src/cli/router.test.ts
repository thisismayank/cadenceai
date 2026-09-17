import assert from "node:assert/strict";
import test from "node:test";
import { ModelRouter } from "./router.ts";
import type { CliAgentAdapter, CliDiagnostic, CliRunInput, CliRunResult, ModelPolicy } from "./types.ts";

class FakeAdapter implements CliAgentAdapter {
  calls: CliRunInput[] = [];
  readonly name: string;
  private readonly diagnostic: CliDiagnostic;
  constructor(
    name: string,
    diagnostic: CliDiagnostic,
  ) {
    this.name = name;
    this.diagnostic = diagnostic;
  }

  async diagnose(): Promise<CliDiagnostic> {
    return this.diagnostic;
  }

  async execute(input: CliRunInput): Promise<CliRunResult> {
    this.calls.push(input);
    return {
      cli: this.name,
      model: input.model,
      effort: input.effort,
      rawOutput: "{}",
      status: "success",
      summary: "ok",
      artifacts: [],
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 },
    };
  }
}

const policy: ModelPolicy = {
  fast_classifier: [
    { cli: "codex", model: "cheap", effort: "low" },
    { cli: "claude", model: "fallback", effort: "medium" },
  ],
  balanced_reasoner: [],
  flagship_coder: [],
  flagship_reasoner: [],
  critical_escalation: [],
};

test("router falls back when the preferred CLI is not authenticated", async () => {
  const codex = new FakeAdapter("codex", {
    command: "codex",
    installed: true,
    authenticated: false,
    detail: "logged out",
  });
  const claude = new FakeAdapter("claude", {
    command: "claude",
    installed: true,
    authenticated: true,
  });
  const router = new ModelRouter([codex, claude], policy);
  const result = await router.execute("fast_classifier", {
    prompt: "classify",
    cwd: "/tmp",
    permission: "read-only",
  });

  assert.equal(result.cli, "claude");
  assert.equal(result.model, "fallback");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.failedCandidates.length, 1);
  assert.equal(codex.calls.length, 0);
  assert.equal(claude.calls.length, 1);
});
