import assert from "node:assert/strict";
import test from "node:test";
import { stagesFromAnalysis } from "./analyzer.ts";
import type { RoutingResult } from "@cadenceai/agents";

test("analysis artifacts become the seven-stage test-first cadence", () => {
  const result: RoutingResult = {
    requestedProfile: "fast_classifier",
    candidate: { cli: "codex", model: "small", effort: "low" },
    fallbackUsed: false,
    failedCandidates: [],
    cli: "codex",
    model: "small",
    effort: "low",
    rawOutput: "",
    status: "success",
    summary: "Plan ready",
    artifacts: [{
      type: "EXECUTION_PLAN",
      name: "plan",
      content: {
        summary: "Fix retries safely",
        stages: [
          { role: "INVESTIGATOR", rationale: "Find retry paths", modelProfile: "balanced_reasoner" },
          { role: "TEST_DESIGNER", rationale: "Write regression tests", modelProfile: "flagship_reasoner" },
          { role: "IMPLEMENTER", rationale: "Apply the fix", modelProfile: "flagship_coder" },
          { role: "VERIFIER", rationale: "Run checks", modelProfile: "fast_classifier" },
          { role: "ADVERSARIAL", rationale: "Challenge assumptions", modelProfile: "flagship_reasoner" },
        ],
      },
    }],
    findings: [],
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 },
  };

  const stages = stagesFromAnalysis(result);
  assert.deepEqual(stages.map((stage) => stage.name), [
    "Analyze",
    "Investigator",
    "Test Designer",
    "Implementer",
    "Verifier",
    "Adversarial",
    "Human review",
  ]);
});
