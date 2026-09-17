import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { recommendedChatModel, saveSetupPreferences } from "./setup.ts";

test("setup recommends the only authenticated provider and otherwise keeps fallback routing", () => {
  assert.equal(recommendedChatModel([
    { command: "claude", installed: true, authenticated: true },
    { command: "codex", installed: false, authenticated: false },
  ]), "claude-sonnet");
  assert.equal(recommendedChatModel([
    { command: "claude", installed: true, authenticated: true },
    { command: "codex", installed: true, authenticated: true },
  ]), "auto");
});

test("Starter setup preserves unrelated settings and writes low-plan guardrails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cadence-setup-"));
  const path = join(directory, "config.json");
  try {
    await writeFile(path, JSON.stringify({ version: 1, risk: { highKeywords: ["custom-risk"] } }));
    await saveSetupPreferences(path, { preset: "starter", chatModel: "codex-terra" });
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
    assert.deepEqual(value.risk.highKeywords, ["custom-risk"]);
    assert.equal(value.budget.defaultMode, "economy");
    assert.equal(value.guardrails.maxModelCallsPerTask, 6);
    assert.equal(value.chat.defaultModel, "codex-terra");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
