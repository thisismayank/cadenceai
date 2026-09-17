import type { CliAgentAdapter, CliDiagnostic, CliRunInput, CliRunResult } from "./types";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.ts";
import { AGENT_RESULT_JSON_SCHEMA, buildPrompt, parseAgentResult } from "./schema.ts";

export class ClaudeCliAdapter implements CliAgentAdapter {
  readonly name = "claude";
  private readonly runner: ProcessRunner;
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
    const envelopes = process.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
      type?: string;
      structured_output?: unknown;
      result?: unknown;
    });
    const envelope = [...envelopes].reverse().find((event) => event.type === "result") ?? envelopes.at(-1) ?? {};
    const resultValue = envelope.structured_output ?? envelope.result ?? envelope;
    const decoded = typeof resultValue === "string" ? JSON.parse(resultValue) : resultValue;
    const result = parseAgentResult(decoded);
    return { ...result, cli: this.name, model: input.model, effort: input.effort, rawOutput: process.stdout };
  }
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
