import assert from "node:assert/strict";
import test from "node:test";
import { formatExecutionPreflight, formatQaPreflight, formatReviewPreflight, formatWorkflowPreflight, modelCallLimitViolation, planEngineeringExecution, planQaExecution, planReviewExecution, planWorkflowExecution } from "./budget.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { createTaskEnvelope } from "./task.ts";

test("economy uses one model call for an ordinary implementation", () => {
  const envelope = createTaskEnvelope("fix this typo", DEFAULT_CONFIG, "engineering");
  const plan = planEngineeringExecution(envelope, DEFAULT_CONFIG, "economy");
  assert.equal(plan.risk, "low");
  assert.equal(plan.totalModelCalls, 1);
  assert.deepEqual(plan.stageIds, ["implement", "verify", "human_review"]);
  assert.match(formatExecutionPreflight(plan, 6), /Expected model calls: 1/);
  assert.match(formatExecutionPreflight(plan, 6), /Per-task limit: 6/);
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
  assert.match(formatReviewPreflight(plan, "PR #42", 6), /high-call operation/i);
  assert.equal(modelCallLimitViolation(6, 6), null);
  assert.match(modelCallLimitViolation(7, 6) ?? "", /above your configured limit/i);
});

test("ticket QA fits the Starter call ceiling and explains its evidence boundary", () => {
  const plan = planQaExecution(DEFAULT_CONFIG);
  assert.equal(plan.modelCalls, 6);
  assert.equal(modelCallLimitViolation(plan.modelCalls, 6), null);
  const preflight = formatQaPreflight(plan, ["ELM-2851"], 6);
  assert.match(preflight, /Expected model calls: 6/);
  assert.match(preflight, /linked pull-request diffs/i);
  assert.match(preflight, /missing local execution evidence.*unverified/i);
});

test("new workflows expose predictable Starter-aware call counts", () => {
  const expected = { refine: 3, release: 6, plan: 6, crossrepo: 6, handoff: 1 } as const;
  for (const [kind, calls] of Object.entries(expected) as Array<[keyof typeof expected, number]>) {
    const plan = planWorkflowExecution(DEFAULT_CONFIG, kind);
    assert.equal(plan.modelCalls, calls, kind);
    assert.equal(modelCallLimitViolation(calls, 6), null, kind);
    assert.match(formatWorkflowPreflight(kind, plan, "example", 6), new RegExp(`Expected model calls: ${calls}`));
  }
  assert.match(formatWorkflowPreflight("crossrepo", planWorkflowExecution(DEFAULT_CONFIG, "crossrepo"), "repos", 6), /No repository will be modified/i);
});
