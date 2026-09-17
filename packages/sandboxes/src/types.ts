export type SandboxCreateInput = {
  executionId: string;
  templateId?: string;
  timeoutMs?: number;
  envs?: Record<string, string>;
};

export type SandboxHandle = {
  id: string;
  providerSandboxId: string;
  provider: string;
};

export type SandboxCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export type SandboxCommandOptions = {
  cwd?: string;
  envs?: Record<string, string>;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export interface SandboxProvider {
  readonly name: string;

  create(input: SandboxCreateInput): Promise<SandboxHandle>;

  run(
    handle: SandboxHandle,
    command: string,
    options?: SandboxCommandOptions,
  ): Promise<SandboxCommandResult>;

  writeFile(handle: SandboxHandle, path: string, content: string): Promise<void>;

  readFile(handle: SandboxHandle, path: string): Promise<string>;

  destroy(handle: SandboxHandle): Promise<void>;
}
