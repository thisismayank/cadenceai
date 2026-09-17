import { randomUUID } from "node:crypto";
import type { CliAgentAdapter, CliChatInput, CliChatResult, CliDiagnostic, CliRunInput, CliRunResult } from "./types";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.ts";
import { AGENT_RESULT_JSON_SCHEMA, buildPrompt, parseAgentResult } from "./schema.ts";

export class ClaudeCliAdapter implements CliAgentAdapter {
  readonly name = "claude";
  readonly cacheDiagnostics = true;
  private readonly runner: ProcessRunner;
  private readonly conversationSessions = new Map<string, string>();
  constructor(runner: ProcessRunner = new NodeProcessRunner()) {
    this.runner = runner;
  }

  async diagnose(): Promise<CliDiagnostic> {
    try {
      const [version, auth] = await Promise.all([
        this.runner.run({ command: "claude", args: ["--version"], timeoutMs: 5_000 }),
        this.runner.run({ command: "claude", args: ["auth", "status"], timeoutMs: 5_000 }),
      ]);
      const authDetail = safeClaudeAuthDetail(auth.stdout);
      return {
        command: "claude",
        installed: version.exitCode === 0,
        authenticated: auth.exitCode === 0,
        version: version.stdout.trim() || version.stderr.trim(),
        detail: authDetail || auth.stderr.trim(),
      };
    } catch (error) {
      return { command: "claude", installed: false, authenticated: false, detail: String(error) };
    }
  }

  async execute(input: CliRunInput): Promise<CliRunResult> {
    const args = [
      "--print", "--model", input.model, "--effort", input.effort,
      "--permission-mode", input.permission === "read-only" ? "plan" : "acceptEdits",
      "--output-format", "stream-json", "--verbose",
      "--json-schema", JSON.stringify(AGENT_RESULT_JSON_SCHEMA),
      "--no-session-persistence",
    ];
    if (input.allowedTools?.length) args.push("--allowedTools", input.allowedTools.join(","));
    const process = await this.runner.run({
      command: "claude", args, cwd: input.cwd,
      stdin: buildPrompt(input.prompt), timeoutMs: input.timeoutMs ?? 30 * 60_000,
      onStdout: (data) => input.onEvent?.({ stream: "stdout", data }),
      onStderr: (data) => input.onEvent?.({ stream: "stderr", data }),
    });
    if (process.exitCode !== 0) throw new Error(`claude failed: ${process.stderr.trim()}`);
    const envelopes = parseJsonLines(process.stdout);
    const envelope = [...envelopes].reverse().find((event) => event.type === "result") ?? envelopes.at(-1) ?? {};
    const resultValue = envelope.structured_output ?? envelope.result ?? envelope;
    const decoded = typeof resultValue === "string" ? JSON.parse(resultValue) : resultValue;
    const result = parseAgentResult(decoded);
    return { ...result, cli: this.name, model: findClaudeModel(envelopes) ?? input.model, effort: input.effort, rawOutput: process.stdout };
  }

  async chat(input: CliChatInput): Promise<CliChatResult> {
    const toolArgs = input.toolAccess === "read-only"
      ? [
          "--permission-mode", input.allowedTools?.length ? "dontAsk" : "plan",
          ...(input.allowedTools?.length ? ["--allowedTools", input.allowedTools.join(",")] : []),
        ]
      : ["--tools", ""];
    const conversationKey = input.toolAccess !== "read-only" && input.conversationId
      ? `${input.conversationId}:${input.model}`
      : undefined;
    const existingSession = conversationKey ? this.conversationSessions.get(conversationKey) : undefined;
    let sessionId = existingSession ?? (conversationKey ? randomUUID() : undefined);
    const invoke = async (resume: boolean) => {
      let lineBuffer = "";
      const result = await this.runner.run({
        command: "claude",
        args: [
          "--print", "--model", input.model, "--effort", input.effort,
          ...toolArgs, "--disable-slash-commands",
          "--output-format", "stream-json", "--verbose", "--include-partial-messages",
          ...(sessionId ? (resume ? ["--resume", sessionId] : ["--session-id", sessionId]) : ["--no-session-persistence"]),
        ],
        cwd: input.cwd,
        stdin: resume ? (input.continuationPrompt ?? input.prompt) : input.prompt,
        timeoutMs: input.timeoutMs ?? 2 * 60_000,
        onStdout: (data) => {
          input.onEvent?.({ stream: "stdout", data });
          lineBuffer = emitClaudeText(`${lineBuffer}${data}`, input.onText);
        },
        onStderr: (data) => input.onEvent?.({ stream: "stderr", data }),
      });
      emitClaudeText(`${lineBuffer}\n`, input.onText);
      return result;
    };
    let process = await invoke(Boolean(existingSession));
    if (process.exitCode !== 0 && existingSession && conversationKey) {
      this.conversationSessions.delete(conversationKey);
      sessionId = randomUUID();
      process = await invoke(false);
    }
    if (process.exitCode !== 0) throw new Error(`claude failed: ${process.stderr.trim()}`);
    if (conversationKey && sessionId) this.conversationSessions.set(conversationKey, sessionId);
    const envelopes = parseJsonLines(process.stdout);
    const envelope = [...envelopes].reverse().find((event) => event.type === "result") ?? envelopes.at(-1);
    const text = typeof envelope?.result === "string" ? envelope.result.trim() : "";
    if (!text) throw new Error("claude returned an empty response");
    const actualModel = findClaudeModel(envelopes) ?? input.model;
    return { cli: this.name, model: actualModel, effort: input.effort, text, rawOutput: process.stdout };
  }
}

function emitClaudeText(buffer: string, onText?: (text: string) => void): string {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  if (!onText) return remainder;
  for (const line of lines.filter(Boolean)) {
    try {
      const envelope = JSON.parse(line) as {
        type?: string;
        event?: { type?: string; delta?: { type?: string; text?: string } };
      };
      const delta = envelope.event?.delta;
      if (envelope.type === "stream_event" && envelope.event?.type === "content_block_delta" && delta?.type === "text_delta" && delta.text) {
        onText(delta.text);
      }
    } catch {
      // Keep the final structured response path authoritative if a partial line is malformed.
    }
  }
  return remainder;
}

type ClaudeEnvelope = {
  type?: string;
  result?: unknown;
  structured_output?: unknown;
  model?: string;
  message?: { model?: string };
  modelUsage?: Record<string, unknown>;
};

function parseJsonLines(output: string): ClaudeEnvelope[] {
  return output.split("\n").filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line) as ClaudeEnvelope];
    } catch {
      return [];
    }
  });
}

function findClaudeModel(envelopes: ClaudeEnvelope[]): string | undefined {
  for (const envelope of envelopes) {
    if (envelope.message?.model) return envelope.message.model;
    if (envelope.model) return envelope.model;
    const usageModel = envelope.modelUsage ? Object.keys(envelope.modelUsage)[0] : undefined;
    if (usageModel) return usageModel;
  }
  return undefined;
}

function safeClaudeAuthDetail(output: string): string {
  try {
    const value = JSON.parse(output) as {
      authMethod?: string;
      apiProvider?: string;
      subscriptionType?: string;
    };
    return [value.authMethod, value.apiProvider, value.subscriptionType]
      .filter(Boolean)
      .join(" · ");
  } catch {
    return output.trim().split("\n")[0] ?? "";
  }
}
