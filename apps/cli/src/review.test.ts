import assert from "node:assert/strict";
import test from "node:test";
import type { ChatRoutingResult } from "@cadenceai/agents";
import { DEFAULT_CONFIG } from "./config.ts";
import { reviewPullRequest, type ReviewAssistant } from "./review.ts";

test("pull-request review executes configured stages and only inspection gets tools", async () => {
  const calls: Parameters<ReviewAssistant>[0][] = [];
  const assistant: ReviewAssistant = async (request) => {
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
  const updates: string[] = [];
  const result = await reviewPullRequest("review the current diff", "/tmp", DEFAULT_CONFIG, (update) => {
    updates.push(`${update.stage.name}:${update.status}`);
  }, assistant);

  assert.equal(calls.length, 6);
  assert.equal(calls[0]?.toolAccess, "read-only");
  assert.equal(calls.slice(1).every((call) => call.toolAccess === "none"), true);
  assert.equal(result.report, "result 6");
  assert.equal(updates.at(-1), "Review report:complete");
});
