import assert from "node:assert/strict";
import test from "node:test";
import { commandSuggestions, completeCommand, FIRST_RUN_TOUR, formatTuiHelp } from "./tui-help.ts";

test("slash-command suggestions are local and tab-completable", () => {
  const suggestions = commandSuggestions("/ref");
  assert.deepEqual(suggestions.map((item) => item.command), ["/refine"]);
  assert.equal(completeCommand(suggestions[0]!), "/refine ");
  assert.equal(completeCommand(commandSuggestions("/help q")[0]!, "/help q"), "/help qa");
  assert.deepEqual(commandSuggestions("normal question"), []);
  assert.deepEqual(commandSuggestions("/plan an idea"), []);
});

test("workflow help explains purpose, cost, safety, and examples", () => {
  const qa = formatTuiHelp("qa");
  assert.match(qa, /Planned model calls: 6/);
  assert.match(qa, /Safety:/);
  assert.match(qa, /\/qa ELM-2851/);
  assert.match(formatTuiHelp(), /\/crossrepo/);
  assert.match(formatTuiHelp("missing"), /Unknown help topic/);
});

test("first-run tour teaches the core journey without invoking a model", () => {
  assert.match(FIRST_RUN_TOUR, /uses no model calls/i);
  assert.match(FIRST_RUN_TOUR, /\/explore/);
  assert.match(FIRST_RUN_TOUR, /\/pipeline/);
  assert.match(FIRST_RUN_TOUR, /\/handoff/);
});
