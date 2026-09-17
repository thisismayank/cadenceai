import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore, eventNow } from "./session.ts";

test("sessions persist and resume as JSONL", async () => {
  const project = await mkdtemp(join(tmpdir(), "cadence-session-test-"));
  try {
    const created = await SessionStore.create(project);
    await created.append(eventNow({ type: "user_message", text: "fix retries" }));
    const resumed = await SessionStore.resumeLatest(project);
    assert.ok(resumed);
    assert.equal(resumed.sessionId, created.sessionId);
    const events = await resumed.read();
    assert.equal(events.length, 2);
    assert.equal(events[1]?.type, "user_message");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
