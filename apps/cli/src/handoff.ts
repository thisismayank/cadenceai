import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export async function saveHandoff(cwd: string, content: string, now = new Date()): Promise<string> {
  const directory = join(cwd, ".cadence", "handoffs");
  await mkdir(directory, { recursive: true });
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `${timestamp}.md`);
  await writeFile(path, `${redactSensitiveText(content).trim()}\n`, { flag: "wx" });
  return relative(cwd, path);
}

export function handoffSessionContext(messages: ReadonlyArray<{ role: "you" | "cadence"; text: string }>): string {
  return redactSensitiveText(messages
    .slice(-24)
    .filter((message) => !isInterfaceMessage(message.text))
    .map((message) => `${message.role === "you" ? "User" : "CadenceAI"}: ${message.text}`)
    .join("\n\n")
    .slice(-30_000));
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/(authorization:\s*bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_API_KEY]")
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function isInterfaceMessage(text: string): boolean {
  return /^(?:Commands\n|THOROUGH ·|ECONOMY ·|BALANCED ·|Per-task model-call limit|Cancelled\. No model|Ready for a new question)/.test(text);
}
