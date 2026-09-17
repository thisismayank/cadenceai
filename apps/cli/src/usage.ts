import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityProfile, ChatRoutingResult, RoutingResult } from "@cadenceai/agents";

export type UsageEvent = {
  at: string;
  cli: string;
  model: string;
  profile: CapabilityProfile;
  fallbackUsed: boolean;
};

export async function recordRoutingUsage(
  cwd: string,
  profile: CapabilityProfile,
  result: RoutingResult | ChatRoutingResult,
): Promise<void> {
  const directory = join(cwd, ".cadence");
  await mkdir(directory, { recursive: true });
  const file = await open(join(directory, "usage.jsonl"), "a");
  try {
    const event: UsageEvent = {
      at: new Date().toISOString(),
      cli: result.cli,
      model: result.model,
      profile,
      fallbackUsed: result.fallbackUsed,
    };
    await file.write(`${JSON.stringify(event)}\n`);
  } finally {
    await file.close();
  }
}

export async function readUsageSummary(cwd: string, now = Date.now()): Promise<string> {
  const events = await readUsageEvents(cwd);
  const since = now - 7 * 24 * 60 * 60_000;
  const recent = events.filter((event) => Date.parse(event.at) >= since);
  if (!recent.length) return "No model calls recorded by CadenceAI in the last 7 days.";
  const byCli = countBy(recent, (event) => event.cli);
  const byModel = countBy(recent, (event) => `${event.cli}/${event.model}`);
  const fallbacks = recent.filter((event) => event.fallbackUsed).length;
  return [
    "CadenceAI usage · last 7 days",
    "",
    ...Object.entries(byCli).sort(([, left], [, right]) => right - left).map(([cli, calls]) => `${cli.padEnd(10)} ${calls} successful call${calls === 1 ? "" : "s"}`),
    "",
    "Models",
    ...Object.entries(byModel).sort(([, left], [, right]) => right - left).map(([model, calls]) => `${model} · ${calls}`),
    "",
    `Fallback completions: ${fallbacks}`,
    "This is a local activity ledger, not the provider's authoritative quota balance.",
  ].join("\n");
}

async function readUsageEvents(cwd: string): Promise<UsageEvent[]> {
  try {
    const content = await readFile(join(cwd, ".cadence", "usage.jsonl"), "utf8");
    return content.split("\n").filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line) as UsageEvent];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function countBy(events: UsageEvent[], key: (event: UsageEvent) => string): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    const value = key(event);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
