import assert from "node:assert/strict";
import test from "node:test";
import { formatExecutionPreflight, formatReviewPreflight, planEngineeringExecution, planReviewExecution } from "./budget.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { createTaskEnvelope } from "./task.ts";

test("economy uses one model call for an ordinary implementation", () => {
  const envelope = createTaskEnvelope("fix this typo", DEFAULT_CONFIG, "engineering");
  const plan = planEngineeringExecution(envelope, DEFAULT_CONFIG, "economy");
  assert.equal(plan.risk, "low");
  assert.equal(plan.totalModelCalls, 1);
  assert.deepEqual(plan.stageIds, ["implement", "verify", "human_review"]);
  assert.match(formatExecutionPreflight(plan), /Expected model calls: 1/);
  assert.match(formatExecutionPreflight(plan), /clean working tree confirmed/i);
  assert.match(formatExecutionPreflight(plan), /Press Enter to continue/);
});

test("balanced medium-risk work spends three engineering calls", () => {
  const envelope = createTaskEnvelope("implement caching for this service", DEFAULT_CONFIG, "engineering");
  const plan = planEngineeringExecution(envelope, DEFAULT_CONFIG, "balanced");
  assert.equal(plan.risk, "medium");
  assert.equal(plan.modelCalls, 3);
  assert.deepEqual(plan.stageIds, ["analyze", "investigate", "implement", "verify", "human_review"]);
});

test("high-risk economy mode retains independent scrutiny", () => {
  const envelope = createTaskEnvelope("implement an authentication migration", DEFAULT_CONFIG, "engineering");
  const plan = planEngineeringExecution(envelope, DEFAULT_CONFIG, "economy");
  assert.equal(plan.risk, "high");
  assert.deepEqual(plan.stageIds, ["analyze", "implement", "verify", "adversarial", "human_review"]);
  assert.equal(plan.modelCalls, 3);
});

test("pull-request review preflight reports the configured thorough call count", () => {
  const plan = planReviewExecution(DEFAULT_CONFIG);
  assert.equal(plan.modelCalls, 6);
  assert.match(formatReviewPreflight(plan, "PR #42"), /Expected model calls: 6/);
  assert.match(formatReviewPreflight(plan, "PR #42"), /always uses.*thorough/i);
});
