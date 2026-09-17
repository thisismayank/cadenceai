import { spawn } from "node:child_process";

export type ProcessRequest = {
  command: string;
  args: string[];
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeout = request.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, request.timeoutMs)
        : undefined;

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        request.onStdout?.(chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        request.onStderr?.(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (timeout) clearTimeout(timeout);
        if (timedOut) {
          reject(new Error(`${request.command} timed out after ${request.timeoutMs}ms`));
          return;
        }
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
        });
      });
      child.stdin.end(request.stdin ?? "");
    });
  }
}
