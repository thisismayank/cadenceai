import assert from "node:assert/strict";
import test from "node:test";
import { clearProviderCooldowns, getProviderCooldowns, ModelRouter } from "./router.ts";
import type { CliAgentAdapter, CliChatInput, CliChatResult, CliDiagnostic, CliRunInput, CliRunResult, ModelPolicy } from "./types.ts";

class FakeAdapter implements CliAgentAdapter {
  calls: CliRunInput[] = [];
  diagnosticCalls = 0;
  cacheDiagnostics?: boolean;
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
    this.diagnosticCalls += 1;
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

  async chat(input: CliChatInput): Promise<CliChatResult> {
    return {
      cli: this.name,
      model: input.model,
      effort: input.effort,
      text: "hello",
      rawOutput: "hello",
    };
  }
}

const policy: ModelPolicy = {
  conversation: [
    { cli: "claude", model: "chat", effort: "low" },
  ],
  connected_research: [],
  pull_request_review: [],
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

test("router caches diagnostics for real-style adapters", async () => {
  const claude = new FakeAdapter("diagnostic-cache-test", {
    command: "diagnostic-cache-test",
    installed: true,
    authenticated: true,
  });
  claude.cacheDiagnostics = true;
  const cachedPolicy = {
    ...policy,
    conversation: [{ cli: "diagnostic-cache-test", model: "chat", effort: "low" as const }],
  };
  const router = new ModelRouter([claude], cachedPolicy);
  await router.chat("conversation", { prompt: "one", cwd: "/tmp" });
  await router.chat("conversation", { prompt: "two", cwd: "/tmp" });
  assert.equal(claude.diagnosticCalls, 1);
});

test("chat routes through the conversation profile", async () => {
  const claude = new FakeAdapter("claude", {
    command: "claude",
    installed: true,
    authenticated: true,
  });
  const router = new ModelRouter([claude], policy);
  const result = await router.chat("conversation", {
    prompt: "hello",
    cwd: "/tmp",
  });
  assert.equal(result.text, "hello");
  assert.equal(result.model, "chat");
});

test("quota failures cool down a provider and fall back without retrying it", async () => {
  clearProviderCooldowns();
  class QuotaAdapter extends FakeAdapter {
    override async chat(): Promise<CliChatResult> {
      throw new Error("weekly usage limit reached; try again in 2 hours");
    }
  }
  const limited = new QuotaAdapter("quota-limited", { command: "quota-limited", installed: true, authenticated: true });
  const fallback = new FakeAdapter("quota-fallback", { command: "quota-fallback", installed: true, authenticated: true });
  const quotaPolicy = {
    ...policy,
    conversation: [
      { cli: "quota-limited", model: "large", effort: "low" as const },
      { cli: "quota-fallback", model: "small", effort: "low" as const },
    ],
  };
  const router = new ModelRouter([limited, fallback], quotaPolicy);
  const first = await router.chat("conversation", { prompt: "one", cwd: "/tmp" });
  const second = await router.chat("conversation", { prompt: "two", cwd: "/tmp" });
  assert.equal(first.cli, "quota-fallback");
  assert.equal(second.failedCandidates[0]?.error.includes("cooling down"), true);
  assert.equal(getProviderCooldowns().some((cooldown) => cooldown.cli === "quota-limited"), true);
  clearProviderCooldowns();
});
