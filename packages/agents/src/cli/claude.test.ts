import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeCliAdapter } from "./claude.ts";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "./process-runner.ts";

class DiagnosticRunner implements ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.args[0] === "--version") {
      return { exitCode: 0, stdout: "2.1.153 (Claude Code)\n", stderr: "", durationMs: 1 };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        loggedIn: true,
        authMethod: "claude.ai",
        apiProvider: "firstParty",
        email: "private@example.com",
        orgId: "secret-org",
        subscriptionType: "max",
      }),
      stderr: "",
      durationMs: 1,
    };
  }
}

test("Claude diagnostics omit account identifiers", async () => {
  const result = await new ClaudeCliAdapter(new DiagnosticRunner()).diagnose();
  assert.equal(result.detail, "claude.ai · firstParty · max");
  assert.equal(result.detail?.includes("private@example.com"), false);
  assert.equal(result.detail?.includes("secret-org"), false);
});
