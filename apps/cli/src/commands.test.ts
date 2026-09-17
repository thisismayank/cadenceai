import assert from "node:assert/strict";
import test from "node:test";
import { CLI_HELP, formatUpdateGuidance, QUICKSTART } from "./commands.ts";

test("quickstart covers chat, low-cost engineering, and Git review", () => {
  assert.match(QUICKSTART, /normal question/i);
  assert.match(QUICKSTART, /budget economy/i);
  assert.match(QUICKSTART, /git diff/i);
  assert.match(QUICKSTART, /does not commit/i);
});

test("command help and update guidance expose self-service entry points", () => {
  assert.match(CLI_HELP, /cadenceai setup/);
  assert.match(CLI_HELP, /cadenceai doctor/);
  assert.match(formatUpdateGuidance("/tmp/cadenceai"), /git pull --ff-only/);
  assert.match(formatUpdateGuidance(null), /rerun the CadenceAI installer/i);
});
