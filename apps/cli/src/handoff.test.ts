import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handoffSessionContext, redactSensitiveText, saveHandoff } from "./handoff.ts";

test("handoffs are saved as local Markdown artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadence-handoff-"));
  try {
    const path = await saveHandoff(cwd, "# Continuation\n\nNext step", new Date("2026-09-17T04:00:00.000Z"));
    assert.equal(path, ".cadence/handoffs/2026-09-17T04-00-00-000Z.md");
    assert.equal(await readFile(join(cwd, path), "utf8"), "# Continuation\n\nNext step\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("handoff context excludes interface preflights and stays bounded", () => {
  const context = handoffSessionContext([
    { role: "you", text: "Plan the release" },
    { role: "cadence", text: "THOROUGH · RELEASE READINESS\nExpected model calls: 6" },
    { role: "cadence", text: "Decision: Conditional Go" },
  ]);
  assert.match(context, /Plan the release/);
  assert.match(context, /Conditional Go/);
  assert.doesNotMatch(context, /Expected model calls/);
});

test("durable handoffs redact common credential shapes", () => {
  const redacted = redactSensitiveText("token=abc123 password: hunter2 Authorization: Bearer secret-value sk-abcdefghijklmnop");
  assert.doesNotMatch(redacted, /abc123|hunter2|secret-value|sk-abcdefghijklmnop/);
  assert.match(redacted, /REDACTED/);
});
