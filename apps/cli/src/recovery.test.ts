import assert from "node:assert/strict";
import test from "node:test";
import { formatFailureRecovery } from "./recovery.ts";

test("quota recovery preserves the request and offers lower-cost alternatives", () => {
  const output = formatFailureRecovery("weekly usage limit reached", [{
    cli: "codex",
    expiresAt: Date.now() + 60_000,
    reason: "weekly usage limit reached",
  }]);
  assert.match(output, /configured fallbacks/i);
  assert.match(output, /\/retry/);
  assert.match(output, /\/budget economy/);
});

test("model availability errors point to model selection and configuration", () => {
  const output = formatFailureRecovery("unknown model", []);
  assert.match(output, /\/models/);
  assert.match(output, /\/model auto/);
  assert.match(output, /.cadenceai.json/);
});
