import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { detectVerificationCommands } from "./engineering.ts";

test("verification commands follow repository scripts and package manager", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadence-verify-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node --test", typecheck: "tsc --noEmit" } }));
    await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
    const commands = await detectVerificationCommands(cwd);
    assert.deepEqual(commands, [
      { command: "pnpm", args: ["test"], label: "test" },
      { command: "pnpm", args: ["typecheck"], label: "typecheck" },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
