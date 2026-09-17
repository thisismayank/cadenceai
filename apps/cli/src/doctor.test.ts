import assert from "node:assert/strict";
import test from "node:test";
import { formatActionableDiagnostics } from "./doctor.ts";

test("doctor provides install and login remediation without credentials", () => {
  const report = formatActionableDiagnostics([
    { command: "codex", installed: false, authenticated: false },
    { command: "claude", installed: true, authenticated: false, version: "2.1.0", detail: "not logged in" },
    { command: "opencode", installed: true, authenticated: true, version: "2.0.0" },
  ]);
  assert.match(report, /npm install -g @openai\/codex/);
  assert.match(report, /claude auth login/);
  assert.match(report, /opencode 2\.0\.0 — ready/);
  assert.match(report, /never asks for or stores API keys/i);
});
