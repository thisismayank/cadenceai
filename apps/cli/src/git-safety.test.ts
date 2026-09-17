import assert from "node:assert/strict";
import test from "node:test";
import { formatGitChanges, formatGitSafetyBlock, inspectGitWorktree } from "./git-safety.ts";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "@cadenceai/agents";

class GitRunner implements ProcessRunner {
  constructor(private readonly status: string, private readonly repository = true) {}
  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.args[0] === "rev-parse") {
      return { exitCode: this.repository ? 0 : 128, stdout: this.repository ? "true\n" : "", stderr: "", durationMs: 1 };
    }
    return { exitCode: 0, stdout: this.status, stderr: "", durationMs: 1 };
  }
}

test("Git safety ignores CadenceAI session state but blocks user changes", async () => {
  const state = await inspectGitWorktree("/tmp", new GitRunner("?? .cadence/sessions/a.jsonl\n M src/app.ts\n?? src/new.ts\n"));
  assert.equal(state.clean, false);
  assert.deepEqual(state.changes, [" M src/app.ts", "?? src/new.ts"]);
  assert.match(formatGitSafetyBlock(state), /commit or stash/i);
});

test("Git safety requires a repository", async () => {
  const state = await inspectGitWorktree("/tmp", new GitRunner("", false));
  assert.equal(state.isGitRepository, false);
  assert.match(formatGitSafetyBlock(state), /requires a Git repository/i);
});

test("final change report includes normal Git review guidance", () => {
  const output = formatGitChanges({ isGitRepository: true, clean: false, changes: [" M src/app.ts", "?? src/new.ts"] });
  assert.match(output, /Changed files/);
  assert.match(output, /git status --short && git diff/);
  assert.match(output, /did not commit/i);
});
