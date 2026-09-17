import assert from "node:assert/strict";
import test from "node:test";
import type { ChatRoutingResult } from "@cadenceai/agents";
import { DEFAULT_CONFIG } from "./config.ts";
import { qualityAssureTicket, type QaAssistant, type QaContextResolver } from "./qa.ts";
import { createTaskEnvelope } from "./task.ts";

test("ticket QA collects connected evidence once and runs five tool-free assessment stages", async () => {
  const envelope = createTaskEnvelope("Assess ELM-2851 requirements and validate its implementation", DEFAULT_CONFIG);
  const contextCalls: Parameters<QaContextResolver>[] = [];
  const resolveContext: QaContextResolver = async (...args) => {
    contextCalls.push(args);
    return {
      sources: [
        { provider: "linear", reference: "ELM-2851", retrievedAt: "2026-09-17T00:00:00.000Z" },
        { provider: "github", reference: "https://github.com/acme/app/pull/42", retrievedAt: "2026-09-17T00:00:00.000Z" },
      ],
      content: "Acceptance criterion AC-1. PR 42 changes src/example.ts. CI unit-tests passed.",
      runner: "claude",
      model: "sonnet",
    };
  };
  const calls: Parameters<QaAssistant>[0][] = [];
  const assistant: QaAssistant = async (request) => {
    calls.push(request);
    return {
      requestedProfile: request.profile,
      candidate: request.candidates[0]!,
      fallbackUsed: false,
      failedCandidates: [],
      cli: request.candidates[0]!.cli,
      model: request.candidates[0]!.model,
      effort: request.candidates[0]!.effort,
      text: calls.length === 5 ? "Verdict: Conditional Pass" : `assessment ${calls.length}`,
      rawOutput: "",
    } satisfies ChatRoutingResult;
  };
  const updates: string[] = [];

  const result = await qualityAssureTicket(envelope, "/tmp", DEFAULT_CONFIG, (update) => {
    updates.push(`${update.stage.name}:${update.status}`);
  }, { assistant, resolveContext });

  assert.equal(contextCalls.length, 1);
  assert.equal(contextCalls[0]?.[0].intent, "qa");
  assert.equal(calls.length, 5);
  assert.equal(calls.every((call) => call.toolAccess === "none"), true);
  assert.match(calls[0]?.prompt ?? "", /Acceptance criterion AC-1/);
  assert.match(calls[2]?.prompt ?? "", /Never claim a local test was run/i);
  assert.match(calls[4]?.prompt ?? "", /Conditional Pass/);
  assert.equal(result.runs.length, 6);
  assert.equal(result.report, "Verdict: Conditional Pass");
  assert.equal(updates.at(-1), "QA report:complete");
});

test("ticket QA reports collection failure at the first stage", async () => {
  const envelope = createTaskEnvelope("QA ELM-2851", DEFAULT_CONFIG);
  const updates: string[] = [];
  const resolveContext: QaContextResolver = async () => {
    throw new Error("Linear unavailable");
  };

  await assert.rejects(
    qualityAssureTicket(envelope, "/tmp", DEFAULT_CONFIG, (update) => {
      updates.push(`${update.stage.name}:${update.status}`);
    }, { resolveContext }),
    /Linear unavailable/,
  );
  assert.deepEqual(updates, ["Collect evidence:running", "Collect evidence:failed"]);
});
