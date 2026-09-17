import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliAgentAdapter, CliDiagnostic, CliRunInput, CliRunResult } from "./types";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.ts";
import { AGENT_RESULT_JSON_SCHEMA, buildPrompt, parseAgentResult } from "./schema.ts";

export class CodexCliAdapter implements CliAgentAdapter {
  readonly name = "codex";
  private readonly runner: ProcessRunner;
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
        "--ephemeral", "--output-schema", schemaPath,
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
}
