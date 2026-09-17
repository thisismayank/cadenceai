import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { CliDiagnostic } from "@cadenceai/agents";
import { diagnoseRuntimes, formatActionableDiagnostics } from "./doctor.ts";

export type SetupPreset = "starter" | "balanced";
export type SetupPreferences = {
  preset: SetupPreset;
  chatModel: string;
};
type SetupInput = Readable & { isTTY?: boolean };
type SetupOutput = Writable & { isTTY?: boolean };

export function globalConfigPath(home = homedir()): string {
  return join(home, ".config", "cadenceai", "config.json");
}

export function recommendedChatModel(diagnostics: readonly CliDiagnostic[]): string {
  const ready = diagnostics.filter((item) => item.installed && item.authenticated).map((item) => item.command);
  if (ready.length > 1) return "auto";
  if (ready.includes("claude")) return "claude-sonnet";
  if (ready.includes("codex")) return "codex-terra";
  return "auto";
}

export async function saveSetupPreferences(path: string, preferences: SetupPreferences): Promise<void> {
  const existing = await readJsonObject(path);
  const update = preferences.preset === "starter"
    ? {
        version: 1,
        budget: { defaultMode: "economy" },
        guardrails: { maxModelCallsPerTask: 6 },
        chat: { defaultModel: preferences.chatModel },
      }
    : {
        version: 1,
        budget: { defaultMode: "balanced" },
        guardrails: { maxModelCallsPerTask: null },
        chat: { defaultModel: preferences.chatModel },
      };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(mergeObjects(existing, update), null, 2) + "\n");
}

export async function runSetupCommand(
  args: readonly string[],
  io: { input: SetupInput; output: SetupOutput } = { input: process.stdin, output: process.stdout },
  path = globalConfigPath(),
): Promise<number> {
  const destination = optionValue(args, "--config") ?? path;
  io.output.write("CadenceAI Starter setup\n\nChecking local coding-agent runtimes…\n");
  const diagnostics = await diagnoseRuntimes();
  io.output.write(formatActionableDiagnostics(diagnostics) + "\n\n");

  const nonInteractive = args.includes("--yes") || args.includes("-y");
  const requestedProvider = optionValue(args, "--provider");
  const requestedPreset: SetupPreset = args.includes("--balanced") ? "balanced" : "starter";
  let chatModel = providerSelection(requestedProvider) ?? recommendedChatModel(diagnostics);
  let preset: SetupPreset = requestedPreset;

  if (!nonInteractive && io.input.isTTY && io.output.isTTY) {
    const prompt = createInterface({ input: io.input, output: io.output });
    try {
      const ready = diagnostics.filter((item) => item.installed && item.authenticated).map((item) => item.command);
      const choices = "auto" + (ready.includes("claude") ? "/claude" : "") + (ready.includes("codex") ? "/codex" : "") + (ready.includes("opencode") ? "/opencode/<provider>/<model>" : "");
      const answer = (await prompt.question("Chat provider [" + choices + "] (" + chatModel + "): ")).trim();
      chatModel = providerSelection(answer) ?? chatModel;
      const presetAnswer = (await prompt.question("Use Starter guardrails (Economy mode, maximum 6 model calls per task)? [Y/n]: ")).trim().toLowerCase();
      preset = presetAnswer === "n" || presetAnswer === "no" ? "balanced" : "starter";
    } finally {
      prompt.close();
    }
  }

  await saveSetupPreferences(destination, { preset, chatModel });
  io.output.write([
    "Saved " + (preset === "starter" ? "Starter" : "Balanced") + " settings to " + destination + ".",
    "Normal chat: " + chatModel,
    preset === "starter"
      ? "Engineering: Economy by default · maximum 6 model calls per task"
      : "Engineering: Balanced by default · no per-task call ceiling",
    "",
    "Next: cd into a Git repository and run cadenceai.",
    "The first project launch shows a zero-cost tour. Use /quickstart for the five-minute walkthrough, /help for every command, or /doctor for runtime help.",
    "",
  ].join("\n"));
  return 0;
}

function providerSelection(value: string | undefined): string | null {
  if (!value) return null;
  if (value === "auto") return "auto";
  if (value === "claude") return "claude-sonnet";
  if (value === "codex") return "codex-terra";
  if (value.startsWith("opencode/")) return value;
  return null;
}

function optionValue(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    throw new Error("configuration root is not an object");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("Could not preserve existing CadenceAI settings at " + path + ": " + (error instanceof Error ? error.message : String(error)));
  }
}

function mergeObjects(base: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(update)) {
    const current = merged[key];
    merged[key] = isObject(current) && isObject(value) ? mergeObjects(current, value) : value;
  }
  return merged;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
