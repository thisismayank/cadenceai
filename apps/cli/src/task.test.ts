import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "./config.ts";
import { createTaskEnvelope } from "./task.ts";

test("task envelope separates intent, context, and risk", () => {
  const explore = createTaskEnvelope("Fetch ENG-123 and summarize it", DEFAULT_CONFIG);
  assert.equal(explore.intent, "explore");
  assert.deepEqual(explore.linearTickets, ["ENG-123"]);
  assert.equal(explore.needsConnectedTools, true);

  const build = createTaskEnvelope("Implement ENG-123 authentication changes", DEFAULT_CONFIG);
  assert.equal(build.intent, "engineering");
  assert.equal(build.risk, "high");

  const review = createTaskEnvelope("Review https://github.com/acme/app/pull/42", DEFAULT_CONFIG);
  assert.equal(review.intent, "review");
  assert.deepEqual(review.pullRequests, ["https://github.com/acme/app/pull/42"]);

  const lowercaseTicket = createTaskEnvelope("summarize eng-456", DEFAULT_CONFIG);
  assert.deepEqual(lowercaseTicket.linearTickets, ["ENG-456"]);
});

test("ordinary questions remain direct conversation", () => {
  const envelope = createTaskEnvelope("Can this integrate with Linear?", DEFAULT_CONFIG);
  assert.equal(envelope.intent, "chat");
  assert.equal(envelope.needsConnectedTools, false);
});

test("ticket assessment and QA requests use the quality-assurance pipeline", () => {
  for (const request of [
    "QA ELM-2851 and find gaps in its linked PRs",
    "Assess the requirements of ELM-2851 and validate the implementation",
    "Check acceptance criteria and test gaps for ELM-2851",
  ]) {
    const envelope = createTaskEnvelope(request, DEFAULT_CONFIG);
    assert.equal(envelope.intent, "qa");
    assert.deepEqual(envelope.linearTickets, ["ELM-2851"]);
    assert.equal(envelope.needsConnectedTools, true);
  }
});

test("conversation signals carry ticket and risk context into referential engineering", () => {
  const envelope = createTaskEnvelope(
    "Okay, implement that",
    DEFAULT_CONFIG,
    undefined,
    "We discussed authentication changes for ELM-2834.",
  );
  assert.equal(envelope.intent, "engineering");
  assert.equal(envelope.risk, "high");
  assert.deepEqual(envelope.linearTickets, ["ELM-2834"]);
  assert.equal(envelope.needsConnectedTools, true);
});

test("specialized workflow requests route locally without a classifier call", () => {
  const cases = [
    ["Refine ELM-10 so it is ready for development", "refine"],
    ["Run a go/no-go release readiness assessment for ELM-10", "release"],
    ["Plan a new onboarding experience", "plan"],
    ["Design this change across multiple repositories", "crossrepo"],
    ["Create a handoff for this session", "handoff"],
  ] as const;
  for (const [request, intent] of cases) {
    assert.equal(createTaskEnvelope(request, DEFAULT_CONFIG).intent, intent, request);
  }
  assert.equal(createTaskEnvelope(cases[0][0], DEFAULT_CONFIG).needsConnectedTools, true);
  assert.equal(createTaskEnvelope(cases[1][0], DEFAULT_CONFIG).needsConnectedTools, true);
  assert.equal(createTaskEnvelope(cases[2][0], DEFAULT_CONFIG).needsConnectedTools, false);
  assert.equal(createTaskEnvelope(cases[3][0], DEFAULT_CONFIG).needsConnectedTools, true);
  assert.equal(createTaskEnvelope(cases[4][0], DEFAULT_CONFIG).needsConnectedTools, false);
  assert.equal(createTaskEnvelope("Plan an architecture change in this repository", DEFAULT_CONFIG).needsConnectedTools, true);
});
