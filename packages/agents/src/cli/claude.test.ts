import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeCliAdapter } from "./claude.ts";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "./process-runner.ts";

class DiagnosticRunner implements ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.args[0] === "--version") {
      return { exitCode: 0, stdout: "2.1.153 (Claude Code)\n", stderr: "", durationMs: 1 };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        loggedIn: true,
        authMethod: "claude.ai",
        apiProvider: "firstParty",
        email: "private@example.com",
        orgId: "secret-org",
        subscriptionType: "max",
      }),
      stderr: "",
      durationMs: 1,
    };
  }
}

class ChatRunner implements ProcessRunner {
  request?: ProcessRequest;
  requests: ProcessRequest[] = [];
  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.request = request;
    this.requests.push(request);
    return {
      exitCode: 0,
      stdout: [
        JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-4-6" } }),
        JSON.stringify({ type: "result", result: "A direct answer." }),
      ].join("\n"),
      stderr: "",
      durationMs: 1,
    };
  }
}

class StreamingChatRunner extends ChatRunner {
  override async run(request: ProcessRequest): Promise<ProcessResult> {
    this.request = request;
    this.requests.push(request);
    const lines = [
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "A " } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "direct answer." } } }),
      JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-4-6" } }),
      JSON.stringify({ type: "result", result: "A direct answer." }),
    ];
    request.onStdout?.(`${lines[0]}\n${lines[1]?.slice(0, 30)}`);
    request.onStdout?.(`${lines[1]?.slice(30)}\n${lines[2]}\n${lines[3]}`);
    return { exitCode: 0, stdout: lines.join("\n"), stderr: "", durationMs: 1 };
  }
}

test("Claude diagnostics omit account identifiers", async () => {
  const result = await new ClaudeCliAdapter(new DiagnosticRunner()).diagnose();
  assert.equal(result.detail, "claude.ai · firstParty · max");
  assert.equal(result.detail?.includes("private@example.com"), false);
  assert.equal(result.detail?.includes("secret-org"), false);
});

test("Claude chat disables tools and reports the resolved model", async () => {
  const runner = new ChatRunner();
  const result = await new ClaudeCliAdapter(runner).chat({
    prompt: "question",
    cwd: "/tmp",
    model: "sonnet",
    effort: "low",
  });
  assert.equal(result.text, "A direct answer.");
  assert.equal(result.model, "claude-sonnet-4-6");
  const toolIndex = runner.request?.args.indexOf("--tools") ?? -1;
  assert.notEqual(toolIndex, -1);
  assert.equal(runner.request?.args[toolIndex + 1], "");
});

test("Claude connected chat uses plan mode instead of disabling tools", async () => {
  const runner = new ChatRunner();
  await new ClaudeCliAdapter(runner).chat({
    prompt: "fetch a ticket",
    cwd: "/tmp",
    model: "sonnet",
    effort: "low",
    toolAccess: "read-only",
  });
  assert.equal(runner.request?.args.includes("plan"), true);
  assert.equal(runner.request?.args.includes("--tools"), false);
});

test("Claude pre-authorizes an explicit connected-tool allowlist without prompting", async () => {
  const runner = new ChatRunner();
  await new ClaudeCliAdapter(runner).chat({
    prompt: "fetch a ticket",
    cwd: "/tmp",
    model: "sonnet",
    effort: "low",
    toolAccess: "read-only",
    allowedTools: ["mcp__linear__get_issue"],
  });
  assert.equal(runner.request?.args.includes("dontAsk"), true);
  const allowedIndex = runner.request?.args.indexOf("--allowedTools") ?? -1;
  assert.equal(runner.request?.args[allowedIndex + 1], "mcp__linear__get_issue");
});

test("Claude reuses a warm direct-chat session and sends only the continuation", async () => {
  const runner = new ChatRunner();
  const adapter = new ClaudeCliAdapter(runner);
  const base = {
    cwd: "/tmp",
    model: "sonnet",
    effort: "low" as const,
    conversationId: "cadence-session",
  };
  await adapter.chat({ ...base, prompt: "full first prompt", continuationPrompt: "first continuation" });
  await adapter.chat({ ...base, prompt: "full second prompt", continuationPrompt: "only the next turn" });

  assert.equal(runner.requests.length, 2);
  assert.equal(runner.requests[0]?.args.includes("--session-id"), true);
  assert.equal(runner.requests[1]?.args.includes("--resume"), true);
  assert.equal(runner.requests[1]?.stdin, "only the next turn");
  assert.equal(runner.requests[1]?.args.includes("--no-session-persistence"), false);
});

test("Claude streams text deltas while retaining the final authoritative response", async () => {
  const chunks: string[] = [];
  const result = await new ClaudeCliAdapter(new StreamingChatRunner()).chat({
    prompt: "question",
    cwd: "/tmp",
    model: "sonnet",
    effort: "low",
    onText: (text) => chunks.push(text),
  });
  assert.equal(chunks.join(""), "A direct answer.");
  assert.equal(result.text, "A direct answer.");
});
