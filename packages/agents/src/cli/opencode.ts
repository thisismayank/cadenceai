import type { CliAgentAdapter, CliChatInput, CliChatResult, CliDiagnostic, CliRunInput, CliRunResult } from "./types";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.ts";
import { buildPrompt, parseAgentResult } from "./schema.ts";

export class OpenCodeCliAdapter implements CliAgentAdapter {
  readonly name = "opencode";
  readonly cacheDiagnostics = true;
  private readonly runner: ProcessRunner;
  private readonly conversationSessions = new Map<string, string>();

  constructor(runner: ProcessRunner = new NodeProcessRunner()) {
    this.runner = runner;
  }

  async diagnose(): Promise<CliDiagnostic> {
    try {
      const [version, auth] = await Promise.all([
        this.runner.run({ command: "opencode", args: ["--version"], timeoutMs: 5_000 }),
        this.runner.run({ command: "opencode", args: ["auth", "list"], timeoutMs: 5_000 }),
      ]);
      return {
        command: "opencode",
        installed: version.exitCode === 0,
        authenticated: auth.exitCode === 0,
        version: version.stdout.trim() || version.stderr.trim(),
        detail: auth.exitCode === 0 ? "provider credentials managed by OpenCode" : "run `opencode auth login`",
      };
    } catch (error) {
      return { command: "opencode", installed: false, authenticated: false, detail: String(error) };
    }
  }

  async chat(input: CliChatInput): Promise<CliChatResult> {
    const conversationKey = input.toolAccess !== "read-only" && input.conversationId
      ? `${input.conversationId}:${input.model}`
      : undefined;
    const existingSession = conversationKey ? this.conversationSessions.get(conversationKey) : undefined;
    let process = await this.run(
      existingSession ? (input.continuationPrompt ?? input.prompt) : input.prompt,
      input,
      "plan",
      existingSession,
    );
    if (process.exitCode !== 0 && existingSession && conversationKey) {
      this.conversationSessions.delete(conversationKey);
      process = await this.run(input.prompt, input, "plan");
    }
    if (process.exitCode !== 0) throw new Error(`opencode failed: ${process.stderr.trim() || `exit ${process.exitCode}`}`);
    const sessionId = extractOpenCodeSessionId(process.stdout);
    if (conversationKey && sessionId) this.conversationSessions.set(conversationKey, sessionId);
    const text = extractOpenCodeText(process.stdout);
    if (!text) throw new Error("opencode returned an empty response");
    return { cli: this.name, model: input.model, effort: input.effort, text, rawOutput: process.stdout };
  }

  async execute(input: CliRunInput): Promise<CliRunResult> {
    const process = await this.run(buildPrompt(input.prompt), {
      ...input,
      toolAccess: "read-only",
    }, input.permission === "workspace-write" ? "build" : "plan");
    if (process.exitCode !== 0) throw new Error(`opencode failed: ${process.stderr.trim() || `exit ${process.exitCode}`}`);
    const text = extractOpenCodeText(process.stdout);
    const decoded = JSON.parse(extractJsonObject(text));
    return {
      ...parseAgentResult(decoded),
      cli: this.name,
      model: input.model,
      effort: input.effort,
      rawOutput: process.stdout,
    };
  }

  private async run(prompt: string, input: CliChatInput, agent: "plan" | "build", sessionId?: string) {
    let lineBuffer = "";
    const process = await this.runner.run({
      command: "opencode",
      args: [
        "run", "--model", input.model,
        "--agent", agent, "--format", "json", "--dir", input.cwd,
        ...(sessionId ? ["--session", sessionId] : []),
        prompt,
      ],
      cwd: input.cwd,
      timeoutMs: input.timeoutMs ?? 5 * 60_000,
      onStdout: (data) => {
        input.onEvent?.({ stream: "stdout", data });
        const parsed = emitOpenCodeText(`${lineBuffer}${data}`, input.onText);
        lineBuffer = parsed.remainder;
      },
      onStderr: (data) => input.onEvent?.({ stream: "stderr", data }),
    });
    emitOpenCodeText(`${lineBuffer}\n`, input.onText);
    return process;
  }
}

function emitOpenCodeText(buffer: string, onText?: (text: string) => void): { remainder: string } {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  if (onText) {
    const text = extractOpenCodeText(lines.join("\n"));
    if (text) onText(text);
  }
  return { remainder };
}

export function extractOpenCodeSessionId(output: string): string | undefined {
  for (const line of output.split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const direct = event.sessionID ?? event.sessionId ?? event.session_id;
      if (typeof direct === "string") return direct;
      const part = event.part as Record<string, unknown> | undefined;
      const nested = part?.sessionID ?? part?.sessionId ?? part?.session_id;
      if (typeof nested === "string") return nested;
    } catch {
      // Ignore plain provider output.
    }
  }
  return undefined;
}

export function extractOpenCodeText(output: string): string {
  const parts: string[] = [];
  for (const line of output.split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      collectText(event, parts);
    } catch {
      // OpenCode may include a plain final line depending on provider/plugin.
      if (!line.startsWith("{")) parts.push(line);
    }
  }
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join("\n").trim();
}

function collectText(value: unknown, output: string[]): void {
  if (!value || typeof value !== "object") return;
  const item = value as Record<string, unknown>;
  if (typeof item.text === "string" && (item.type === "text" || item.type === "message")) output.push(item.text);
  if (item.part) collectText(item.part, output);
  if (item.message) collectText(item.message, output);
  if (Array.isArray(item.content)) item.content.forEach((part) => collectText(part, output));
}

function extractJsonObject(value: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(value)?.[1];
  if (fenced) return fenced.trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("opencode did not return a JSON object");
  return value.slice(start, end + 1);
}
