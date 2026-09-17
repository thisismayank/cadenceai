import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type SessionEvent =
  | { type: "session_started"; at: string; sessionId: string; cwd: string }
  | { type: "user_message"; at: string; text: string }
  | { type: "assistant_message"; at: string; text: string }
  | { type: "stage_changed"; at: string; stage: string; status: StageStatus; detail?: string; model?: string }
  | { type: "agent_stream"; at: string; stage: string; stream: "stdout" | "stderr"; data: string }
  | { type: "diagnostic"; at: string; cli: string; installed: boolean; authenticated: boolean; version?: string; detail?: string }
  | { type: "error"; at: string; message: string };

export type StageStatus = "waiting" | "running" | "complete" | "failed";

const now = () => new Date().toISOString();

export class SessionStore {
  readonly directory: string;
  private constructor(
    readonly sessionId: string,
    readonly projectDirectory: string,
  ) {
    this.directory = join(projectDirectory, ".cadence", "sessions");
  }

  static async create(projectDirectory: string): Promise<SessionStore> {
    const store = new SessionStore(`${Date.now()}-${randomUUID().slice(0, 8)}`, projectDirectory);
    await mkdir(store.directory, { recursive: true });
    await store.append({ type: "session_started", at: now(), sessionId: store.sessionId, cwd: projectDirectory });
    return store;
  }

  static async hasHistory(projectDirectory: string): Promise<boolean> {
    const directory = join(projectDirectory, ".cadence", "sessions");
    try {
      return (await readdir(directory)).some((file) => file.endsWith(".jsonl"));
    } catch {
      return false;
    }
  }

  static async resumeLatest(projectDirectory: string): Promise<SessionStore | null> {
    const directory = join(projectDirectory, ".cadence", "sessions");
    try {
      const files = (await readdir(directory)).filter((file) => file.endsWith(".jsonl")).sort().reverse();
      const latest = files[0];
      return latest ? new SessionStore(latest.slice(0, -6), projectDirectory) : null;
    } catch {
      return null;
    }
  }

  get path(): string {
    return join(this.directory, `${this.sessionId}.jsonl`);
  }

  async append(event: SessionEvent): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = await open(this.path, "a");
    try {
      await file.write(`${JSON.stringify(event)}\n`);
    } finally {
      await file.close();
    }
  }

  async read(): Promise<SessionEvent[]> {
    try {
      const contents = await readFile(this.path, "utf8");
      return contents.split("\n").filter(Boolean).map((line) => JSON.parse(line) as SessionEvent);
    } catch {
      return [];
    }
  }
}

export function eventNow<T extends Omit<SessionEvent, "at">>(event: T): T & { at: string } {
  return { ...event, at: now() };
}
