import assert from "node:assert/strict";
import test from "node:test";
import type { ChatRoutingResult } from "@cadenceai/agents";
import { DEFAULT_CONFIG, type ReadOnlyWorkflowKind } from "./config.ts";
import { createTaskEnvelope } from "./task.ts";
import { runReadOnlyWorkflow, type WorkflowAssistant, type WorkflowContextResolver } from "./workflow.ts";

function fakeAssistant(calls: Parameters<WorkflowAssistant>[0][]): WorkflowAssistant {
  return async (request) => {
    calls.push(request);
    return {
      requestedProfile: request.profile,
      candidate: request.candidates[0]!,
      fallbackUsed: false,
      failedCandidates: [],
      cli: request.candidates[0]!.cli,
      model: request.candidates[0]!.model,
      effort: request.candidates[0]!.effort,
      text: `result ${calls.length}`,
      rawOutput: "",
    } satisfies ChatRoutingResult;
  };
}

const resolveContext: WorkflowContextResolver = async (envelope) => ({
  sources: envelope.linearTickets.map((reference) => ({ provider: "linear" as const, reference, retrievedAt: "2026-09-17T00:00:00.000Z" })),
  content: "primary evidence",
  runner: "claude",
  model: "sonnet",
});

test("connected workflows collect once and keep later stages tool-free", async () => {
  const cases: Array<{ kind: ReadOnlyWorkflowKind; request: string; assistantCalls: number; totalRuns: number }> = [
    { kind: "refine", request: "Refine ELM-10 for development", assistantCalls: 2, totalRuns: 3 },
    { kind: "release", request: "Assess release readiness for ELM-10", assistantCalls: 5, totalRuns: 6 },
    { kind: "crossrepo", request: "Plan a cross-repo change for services A and B", assistantCalls: 5, totalRuns: 6 },
  ];
  for (const item of cases) {
    const calls: Parameters<WorkflowAssistant>[0][] = [];
    const envelope = createTaskEnvelope(item.request, DEFAULT_CONFIG, item.kind);
    const result = await runReadOnlyWorkflow(item.kind, envelope, "/tmp", DEFAULT_CONFIG, () => undefined, {
      assistant: fakeAssistant(calls),
      resolveContext,
    });
    assert.equal(calls.length, item.assistantCalls, item.kind);
    assert.equal(calls.every((call) => call.toolAccess === "none"), true, item.kind);
    assert.equal(result.runs.length, item.totalRuns, item.kind);
    assert.match(calls[0]?.prompt ?? "", /primary evidence/i, item.kind);
  }
});

test("planning runs six challenged perspectives and carries session context", async () => {
  const calls: Parameters<WorkflowAssistant>[0][] = [];
  const envelope = createTaskEnvelope("Plan a better developer onboarding experience", DEFAULT_CONFIG, "plan");
  const result = await runReadOnlyWorkflow("plan", envelope, "/tmp", DEFAULT_CONFIG, () => undefined, {
    assistant: fakeAssistant(calls),
    seedContext: "User previously rejected mandatory API keys.",
  });
  assert.equal(calls.length, 6);
  assert.equal(result.runs.length, 6);
  assert.match(calls[0]?.prompt ?? "", /product lead/i);
  assert.match(calls[0]?.prompt ?? "", /rejected mandatory API keys/i);
  assert.match(calls[5]?.prompt ?? "", /decision-ready plan/i);
});

test("handoff is a single-call synthesis with no tools", async () => {
  const calls: Parameters<WorkflowAssistant>[0][] = [];
  const envelope = createTaskEnvelope("Create a handoff for this session", DEFAULT_CONFIG, "handoff");
  const result = await runReadOnlyWorkflow("handoff", envelope, "/tmp", DEFAULT_CONFIG, () => undefined, {
    assistant: fakeAssistant(calls),
    seedContext: "User: implement ticket QA\n\nCadenceAI: completed and validated",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.toolAccess, "none");
  assert.equal(result.report, "result 1");
  assert.match(calls[0]?.prompt ?? "", /exact next steps/i);
});
