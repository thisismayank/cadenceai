import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationContextForPipeline,
  createConversationContextSnapshot,
  formatConversationContextPreflight,
} from "./conversation-context.ts";

test("referential implementation requests freeze recent substantive turns", () => {
  const snapshot = createConversationContextSnapshot("Okay, implement that", [
    { role: "cadence", text: "Ask me anything, or describe something you want to build." },
    { role: "you", text: "Add caching to the product endpoint." },
    { role: "cadence", text: "Use an in-memory cache." },
    { role: "cadence", text: "Budget mode: economy." },
    { role: "you", text: "Use a 60-second TTL and no new dependency." },
  ]);
  assert.ok(snapshot);
  assert.equal(snapshot.turns.length, 3);
  assert.match(snapshot.text, /60-second TTL/);
  assert.doesNotMatch(snapshot.text, /Budget mode/);
  assert.match(formatConversationContextPreflight(snapshot), /3 frozen turns/);
  assert.match(conversationContextForPipeline(snapshot), /untrusted proposals/i);
});

test("self-contained tasks do not inherit unrelated conversation", () => {
  const snapshot = createConversationContextSnapshot("Implement pagination for the users endpoint", [
    { role: "you", text: "Earlier we discussed caching." },
  ]);
  assert.equal(snapshot, null);
});

test("referential tasks without history surface ambiguity", () => {
  assert.match(formatConversationContextPreflight(null, "implement that"), /may be ambiguous/i);
});

test("new-task boundaries prevent stale context from leaking", () => {
  const snapshot = createConversationContextSnapshot("Implement that", [
    { role: "you", text: "Use Redis." },
    { role: "cadence", text: "Ready for a new question or task." },
    { role: "you", text: "Use an in-memory cache instead." },
  ]);
  assert.ok(snapshot);
  assert.doesNotMatch(snapshot.text, /Redis/);
  assert.match(snapshot.text, /in-memory/);
});
