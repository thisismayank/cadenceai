import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "./config.ts";
import {
  buildConnectedPrompt,
  clearConnectedAffinity,
  connectedCandidateOrder,
  connectedToolAllowlist,
  extractGitHubPullRequestUrls,
  rememberConnectedCandidate,
} from "./context.ts";
import { createTaskEnvelope } from "./task.ts";

test("connected prompt scopes tools to read-only retrieval and resists source instructions", () => {
  const envelope = createTaskEnvelope("Fetch ENG-123 and summarize its requirements", DEFAULT_CONFIG);
  const prompt = buildConnectedPrompt(envelope);
  assert.match(prompt, /Linear ticket ENG-123/);
  assert.match(prompt, /Never modify/i);
  assert.match(prompt, /untrusted data/i);
  assert.match(prompt, /configured MCP tools/i);
});

test("Linear resolution pre-authorizes only read-only ticket tools", () => {
  const envelope = createTaskEnvelope("Fetch ENG-123 and summarize it", DEFAULT_CONFIG);
  const tools = connectedToolAllowlist(envelope);
  assert.equal(tools.includes("mcp__linear__get_issue"), true);
  assert.equal(tools.includes("mcp__linear__list_comments"), true);
  assert.equal(tools.some((tool) => /create|update|delete/i.test(tool)), false);
});

test("connected resolution remembers the last successful model per capability", () => {
  clearConnectedAffinity();
  const envelope = createTaskEnvelope("Fetch ENG-123 and summarize it", DEFAULT_CONFIG);
  const fallback = DEFAULT_CONFIG.profiles.connected_research[1];
  assert.ok(fallback);
  rememberConnectedCandidate(envelope, fallback);
  assert.deepEqual(connectedCandidateOrder(envelope, DEFAULT_CONFIG)[0], fallback);
  clearConnectedAffinity();
});

test("ticket QA authorizes linked-PR and CI evidence collection read-only", () => {
  const envelope = createTaskEnvelope("Assess ENG-123 requirements and validate its implementation", DEFAULT_CONFIG);
  const tools = connectedToolAllowlist(envelope);
  const prompt = buildConnectedPrompt(envelope);
  assert.equal(envelope.intent, "qa");
  assert.equal(tools.includes("Bash(gh pr view *)"), true);
  assert.equal(tools.includes("Bash(gh pr diff *)"), true);
  assert.equal(tools.includes("Bash(gh pr checks *)"), true);
  assert.match(prompt, /discover every linked GitHub pull-request URL/i);
  assert.match(prompt, /distinguish remote CI evidence from tests run locally/i);
});

test("canonical pull-request URLs are extracted and deduplicated from connected evidence", () => {
  assert.deepEqual(extractGitHubPullRequestUrls([
    "See https://github.com/acme/app/pull/42.",
    "Duplicate: https://github.com/acme/app/pull/42",
    "Also https://github.com/acme/api/pull/9)",
  ].join("\n")), [
    "https://github.com/acme/app/pull/42",
    "https://github.com/acme/api/pull/9",
  ]);
});
