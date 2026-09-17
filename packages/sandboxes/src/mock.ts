import { randomUUID } from "node:crypto";
import type {
  SandboxCommandOptions,
  SandboxCommandResult,
  SandboxCreateInput,
  SandboxHandle,
  SandboxProvider,
} from "./types";

type MockState = {
  files: Map<string, string>;
};

export class MockSandboxProvider implements SandboxProvider {
  readonly name = "mock";
  private readonly sandboxes = new Map<string, MockState>();

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const id = `mock-${input.executionId}-${randomUUID().slice(0, 8)}`;
    this.sandboxes.set(id, { files: new Map() });
    return {
      id,
      providerSandboxId: id,
      provider: this.name,
    };
  }

  async run(
    handle: SandboxHandle,
    command: string,
    _options?: SandboxCommandOptions,
  ): Promise<SandboxCommandResult> {
    this.requireState(handle);
    return {
      stdout: `[mock sandbox] ran: ${command}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };
  }

  async writeFile(handle: SandboxHandle, path: string, content: string): Promise<void> {
    const state = this.requireState(handle);
    state.files.set(path, content);
  }

  async readFile(handle: SandboxHandle, path: string): Promise<string> {
    const state = this.requireState(handle);
    const content = state.files.get(path);
    if (content === undefined) {
      throw new Error(`mock sandbox: no file at ${path}`);
    }
    return content;
  }

  async destroy(handle: SandboxHandle): Promise<void> {
    this.sandboxes.delete(handle.id);
  }

  private requireState(handle: SandboxHandle): MockState {
    const state = this.sandboxes.get(handle.id);
    if (!state) throw new Error(`mock sandbox ${handle.id} not found`);
    return state;
  }
}
