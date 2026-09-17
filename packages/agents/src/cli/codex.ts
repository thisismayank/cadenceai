import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliAgentAdapter, CliChatInput, CliChatResult, CliDiagnostic, CliRunInput, CliRunResult } from "./types";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.ts";
import { AGENT_RESULT_JSON_SCHEMA, buildPrompt, parseAgentResult } from "./schema.ts";

export class CodexCliAdapter implements CliAgentAdapter {
  readonly name = "codex";
  readonly cacheDiagnostics = true;
  private readonly runner: ProcessRunner;
  private readonly conversationSessions = new Map<string, string>();
  constructor(runner: ProcessRunner = new NodeProcessRunner()) {
    this.runner = runner;
  }

  async diagnose(): Promise<CliDiagnostic> {
    try {
      const [version, auth] = await Promise.all([
        this.runner.run({ command: "codex", args: ["--version"], timeoutMs: 5_000 }),
        this.runner.run({ command: "codex", args: ["login", "status"], timeoutMs: 5_000 }),
      ]);
      return {
        command: "codex",
        installed: version.exitCode === 0,
        authenticated: auth.exitCode === 0,
        version: version.stdout.trim() || version.stderr.trim(),
        detail: auth.stdout.trim() || auth.stderr.trim(),
      };
    } catch (error) {
      return { command: "codex", installed: false, authenticated: false, detail: String(error) };
    }
  }

  async execute(input: CliRunInput): Promise<CliRunResult> {
    const tempDir = await mkdtemp(join(tmpdir(), "cadenceai-codex-"));
    const schemaPath = join(tempDir, "result.schema.json");
    const outputPath = join(tempDir, "result.json");
    try {
      await writeFile(schemaPath, JSON.stringify(AGENT_RESULT_JSON_SCHEMA));
      const args = [
        "exec", "--model", input.model,
        "--config", `model_reasoning_effort=${JSON.stringify(input.effort)}`,
        "--sandbox", input.permission === "read-only" ? "read-only" : "workspace-write",
        "--ephemeral", "--ignore-user-config", "--output-schema", schemaPath,
        "--output-last-message", outputPath, "--json", "-",
      ];
      const process = await this.runner.run({
        command: "codex", args, cwd: input.cwd,
        stdin: buildPrompt(input.prompt), timeoutMs: input.timeoutMs ?? 30 * 60_000,
        onStdout: (data) => input.onEvent?.({ stream: "stdout", data }),
        onStderr: (data) => input.onEvent?.({ stream: "stderr", data }),
      });
      if (process.exitCode !== 0) throw new Error(`codex failed: ${process.stderr.trim()}`);
      const rawResult = await readFile(outputPath, "utf8");
      const result = parseAgentResult(JSON.parse(rawResult));
      return { ...result, cli: this.name, model: input.model, effort: input.effort, rawOutput: process.stdout };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async chat(input: CliChatInput): Promise<CliChatResult> {
    const tempDir = await mkdtemp(join(tmpdir(), "cadenceai-codex-chat-"));
    const outputPath = join(tempDir, "response.txt");
    try {
      const conversationKey = input.toolAccess !== "read-only" && input.conversationId
        ? `${input.conversationId}:${input.model}`
        : undefined;
      const existingSession = conversationKey ? this.conversationSessions.get(conversationKey) : undefined;
      const invoke = async (sessionId?: string) => {
        let lineBuffer = "";
        const commonArgs = [
          "--model", input.model,
          "--config", `model_reasoning_effort=${JSON.stringify(input.effort)}`,
          ...(input.toolAccess === "read-only" ? [] : ["--ignore-user-config", "--ignore-rules"]),
          "--output-last-message", outputPath, "--json",
        ];
        const args = sessionId
          ? ["exec", "resume", ...commonArgs, sessionId, "-"]
          : [
              "exec", ...commonArgs,
              "--sandbox", "read-only",
              ...(conversationKey ? [] : ["--ephemeral"]),
              "-",
            ];
        const result = await this.runner.run({
          command: "codex", args, cwd: input.cwd,
          stdin: sessionId ? (input.continuationPrompt ?? input.prompt) : input.prompt,
          timeoutMs: input.timeoutMs ?? 2 * 60_000,
          onStdout: (data) => {
            input.onEvent?.({ stream: "stdout", data });
            lineBuffer = emitCodexText(`${lineBuffer}${data}`, input.onText);
          },
          onStderr: (data) => input.onEvent?.({ stream: "stderr", data }),
        });
        emitCodexText(`${lineBuffer}\n`, input.onText);
        return result;
      };
      let process = await invoke(existingSession);
      if (process.exitCode !== 0 && existingSession && conversationKey) {
        this.conversationSessions.delete(conversationKey);
        process = await invoke();
      }
      if (process.exitCode !== 0) throw new Error(`codex failed: ${process.stderr.trim()}`);
      const sessionId = findCodexSessionId(process.stdout);
      if (conversationKey && sessionId) this.conversationSessions.set(conversationKey, sessionId);
      const text = (await readFile(outputPath, "utf8")).trim();
      if (!text) throw new Error("codex returned an empty response");
      return { cli: this.name, model: input.model, effort: input.effort, text, rawOutput: process.stdout };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function emitCodexText(buffer: string, onText?: (text: string) => void): string {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  if (!onText) return remainder;
  for (const line of lines.filter(Boolean)) {
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) onText(event.item.text);
    } catch {
      // JSONL chunks may end between events; the final response is still returned normally.
    }
  }
  return remainder;
}

function findCodexSessionId(output: string): string | undefined {
  for (const line of output.split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as { type?: string; thread_id?: string; threadId?: string };
      if (event.type === "thread.started") return event.thread_id ?? event.threadId;
    } catch {
      // Ignore non-JSON diagnostic lines.
    }
  }
  return undefined;
}
