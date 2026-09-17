import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { CodexCliAdapter } from "./codex.ts";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "./process-runner.ts";

class CodexChatRunner implements ProcessRunner {
  requests: ProcessRequest[] = [];

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    const outputIndex = request.args.indexOf("--output-last-message");
    const outputPath = request.args[outputIndex + 1];
    assert.ok(outputPath);
    await writeFile(outputPath, "Codex answer");
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Codex answer" } }),
    ];
    request.onStdout?.(`${lines[0]}\n${lines[1]?.slice(0, 20)}`);
    request.onStdout?.(`${lines[1]?.slice(20)}\n`);
    return { exitCode: 0, stdout: lines.join("\n"), stderr: "", durationMs: 1 };
  }
}

test("Codex streams complete JSONL messages and resumes direct chat", async () => {
  const runner = new CodexChatRunner();
  const adapter = new CodexCliAdapter(runner);
  const chunks: string[] = [];
  const base = {
    cwd: "/tmp",
    model: "gpt-5.6-terra",
    effort: "low" as const,
    conversationId: "cadence-session",
    onText: (text: string) => chunks.push(text),
  };
  await adapter.chat({ ...base, prompt: "full first prompt", continuationPrompt: "first" });
  await adapter.chat({ ...base, prompt: "full second prompt", continuationPrompt: "next turn" });

  assert.equal(chunks.join(""), "Codex answerCodex answer");
  assert.equal(runner.requests[0]?.args.includes("--ephemeral"), false);
  assert.deepEqual(runner.requests[1]?.args.slice(0, 2), ["exec", "resume"]);
  assert.equal(runner.requests[1]?.args.includes("thread-123"), true);
  assert.equal(runner.requests[1]?.stdin, "next turn");
});
