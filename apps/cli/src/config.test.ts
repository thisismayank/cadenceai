import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializeProjectConfig, loadCadenceConfig, pipelineStages, qaStages, resolveChatCandidates } from "./config.ts";

test("project configuration overrides defaults without replacing unrelated settings", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadence-config-"));
  try {
    await writeFile(join(cwd, ".cadenceai.json"), JSON.stringify({
      version: 1,
      chat: { defaultModel: "claude-opus" },
      pipelines: { engineering: { riskStages: { low: ["analyze", "verify"] } } },
    }));
    const { config } = await loadCadenceConfig(cwd, join(cwd, "missing-global.json"));
    assert.equal(config.chat.defaultModel, "claude-opus");
    assert.equal(config.budget.defaultMode, "balanced");
    assert.equal(config.guardrails.maxModelCallsPerTask, null);
    assert.equal(config.profiles.conversation.length, 2);
    assert.deepEqual(pipelineStages(config, "low").map((stage) => stage.name), ["Analyze", "Verify"]);
    assert.deepEqual(qaStages(config).map((stage) => stage.name), [
      "Collect evidence", "Requirements", "Implementation", "Verification gaps", "Adversarial", "QA report", "Human decision",
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("configuration validates the per-task model-call guardrail", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadence-limit-"));
  try {
    await writeFile(join(cwd, ".cadenceai.json"), JSON.stringify({
      version: 1,
      guardrails: { maxModelCallsPerTask: 6 },
    }));
    const { config } = await loadCadenceConfig(cwd, join(cwd, "missing-global.json"));
    assert.equal(config.guardrails.maxModelCallsPerTask, 6);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("model aliases and direct runner/model references resolve", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadence-model-"));
  try {
    const { config } = await loadCadenceConfig(cwd, join(cwd, "missing-global.json"));
    assert.equal(resolveChatCandidates(config, "claude-sonnet")[0]?.model, "sonnet");
    assert.equal(resolveChatCandidates(config, "codex/custom-model")[0]?.model, "custom-model");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("project config initialization is non-destructive", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadence-init-"));
  try {
    await initializeProjectConfig(cwd);
    await assert.rejects(initializeProjectConfig(cwd), /EEXIST/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
