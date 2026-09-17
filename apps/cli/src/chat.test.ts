import assert from "node:assert/strict";
import test from "node:test";
import { buildChatPrompt, buildContinuationPrompt } from "./chat.ts";

test("chat prompt includes recent context and prohibits pipeline work", () => {
  const prompt = buildChatPrompt("Can it connect to Linear?", [
    { role: "you", text: "We are building CadenceAI" },
    { role: "cadence", text: "Understood." },
    { role: "you", text: "Can it connect to Linear?" },
  ]);
  assert.match(prompt, /We are building CadenceAI/);
  assert.match(prompt, /do not.*execution pipeline/i);
  assert.match(prompt, /User: Can it connect to Linear\?/);
});

test("continuation prompt sends only the new turn to a warm provider session", () => {
  const prompt = buildContinuationPrompt("What about the retry path?");
  assert.match(prompt, /User: What about the retry path\?/);
  assert.doesNotMatch(prompt, /Recent conversation/);
  assert.match(prompt, /Do not use tools/i);
});
