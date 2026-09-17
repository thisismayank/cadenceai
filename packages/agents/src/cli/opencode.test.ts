import assert from "node:assert/strict";
import test from "node:test";
import { extractOpenCodeSessionId, extractOpenCodeText, OpenCodeCliAdapter } from "./opencode.ts";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "./process-runner.ts";

class OpenCodeRunner implements ProcessRunner {
  request?: ProcessRequest;
  requests: ProcessRequest[] = [];
  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.request = request;
    this.requests.push(request);
    return {
      exitCode: 0,
      stdout: JSON.stringify({ type: "text", sessionID: "ses_123", part: { type: "text", text: "OpenCode answer" } }),
      stderr: "",
      durationMs: 1,
    };
  }
}

test("OpenCode JSON events yield assistant text", () => {
  assert.equal(extractOpenCodeText(JSON.stringify({ type: "text", part: { type: "text", text: "hello" } })), "hello");
});

test("OpenCode session IDs are extracted from JSON events", () => {
  assert.equal(extractOpenCodeSessionId(JSON.stringify({ type: "text", sessionID: "ses_123" })), "ses_123");
});

test("OpenCode adapter passes provider/model selection to its runner", async () => {
  const runner = new OpenCodeRunner();
  const result = await new OpenCodeCliAdapter(runner).chat({
    prompt: "hello",
    cwd: "/tmp",
    model: "deepseek/deepseek-r1",
    effort: "low",
  });
  assert.equal(result.text, "OpenCode answer");
  assert.equal(runner.request?.args.includes("deepseek/deepseek-r1"), true);
});

test("OpenCode resumes direct conversation sessions", async () => {
  const runner = new OpenCodeRunner();
  const adapter = new OpenCodeCliAdapter(runner);
  const base = {
    cwd: "/tmp",
    model: "deepseek/deepseek-r1",
    effort: "low" as const,
    conversationId: "cadence-session",
  };
  await adapter.chat({ ...base, prompt: "full first prompt", continuationPrompt: "first" });
  await adapter.chat({ ...base, prompt: "full second prompt", continuationPrompt: "next turn" });
  assert.equal(runner.requests[1]?.args.includes("--session"), true);
  assert.equal(runner.requests[1]?.args.includes("ses_123"), true);
  assert.equal(runner.requests[1]?.args.at(-1), "next turn");
});
