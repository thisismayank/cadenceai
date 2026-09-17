import assert from "node:assert/strict";
import test from "node:test";
import { classifyIntent } from "./intent.ts";

test("ordinary questions stay in chat", () => {
  assert.equal(classifyIntent("can this have mcp connection to linear?"), "chat");
  assert.equal(classifyIntent("what is the difference between MCP and an API?"), "chat");
  assert.equal(classifyIntent("why did we choose a seven-stage pipeline?"), "chat");
});

test("clear engineering actions start the pipeline", () => {
  assert.equal(classifyIntent("add an MCP connection to Linear"), "pipeline");
  assert.equal(classifyIntent("Can you fix the login bug and add a regression test?"), "pipeline");
  assert.equal(classifyIntent("We should refactor this service"), "pipeline");
  assert.equal(classifyIntent("Let's build this app"), "pipeline");
  assert.equal(classifyIntent("go ahead and implement it"), "pipeline");
});

test("referential go-ahead messages promote the conversation to engineering", () => {
  assert.equal(classifyIntent("Okay, implement that"), "pipeline");
  assert.equal(classifyIntent("ship it"), "pipeline");
});

test("mode overrides auto classification", () => {
  assert.equal(classifyIntent("what is MCP?", "pipeline"), "pipeline");
  assert.equal(classifyIntent("implement OAuth", "chat"), "chat");
});
