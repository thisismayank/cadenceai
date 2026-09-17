import { access, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { diagnoseRuntimes, formatActionableDiagnostics } from "./doctor.ts";

export const CLI_VERSION = "0.1.0";

export const QUICKSTART = [
  "CadenceAI · five-minute quickstart",
  "",
  "1. Check your runtimes",
  "   cadenceai doctor",
  "",
  "2. Open a Git repository with a clean working tree",
  "   cd /path/to/project",
  "   git status --short",
  "   cadenceai",
  "",
  "3. Ask a normal question",
  "   What does this error mean?",
  "",
  "4. Try a low-cost engineering task",
  "   /budget economy",
  "   Implement a small documentation correction",
  "   Review the preflight and press Enter.",
  "",
  "5. Review the result",
  "   git status --short",
  "   git diff",
  "",
  "CadenceAI does not commit, push, revert, or delete your work automatically.",
  "Use /usage for local call history, /retry after a provider failure, and /doctor for remediation.",
].join("\n");

export const CLI_HELP = [
  "CadenceAI",
  "",
  "cadenceai [project]           open the terminal interface",
  "cadenceai --continue          resume the latest local session",
  "cadenceai setup               configure providers and Starter guardrails",
  "cadenceai doctor              check runtimes with remediation steps",
  "cadenceai quickstart          print the five-minute walkthrough",
  "cadenceai update              show safe update instructions",
  "cadenceai --version           print the installed version",
].join("\n");

export async function runDoctorCommand(output: NodeJS.WritableStream = process.stdout): Promise<number> {
  output.write(formatActionableDiagnostics(await diagnoseRuntimes()) + "\n");
  return 0;
}

export async function runUpdateCommand(
  executable = process.argv[1] ?? "",
  output: NodeJS.WritableStream = process.stdout,
): Promise<number> {
  const checkout = await sourceCheckoutRoot(executable);
  output.write(formatUpdateGuidance(checkout) + "\n");
  return 0;
}

export function formatUpdateGuidance(checkout: string | null): string {
  return [
    "CadenceAI update",
    "",
    "Installed version: " + CLI_VERSION,
    checkout
      ? "Source checkout: " + checkout
      : "CadenceAI could not identify a source checkout for this executable.",
    "",
    checkout
      ? "Update safely:\n  cd " + shellQuote(checkout) + "\n  git pull --ff-only\n  pnpm install --frozen-lockfile\n  pnpm --filter @cadenceai/cli build"
      : "If installed from GitHub, rerun the CadenceAI installer. If installed from a package manager, use that manager's upgrade command.",
    "",
    "CadenceAI never updates itself in the background.",
  ].join("\n");
}

async function sourceCheckoutRoot(executable: string): Promise<string | null> {
  if (!executable) return null;
  try {
    const resolved = await realpath(executable);
    const candidate = resolve(dirname(resolved), "..", "..", "..");
    await access(resolve(candidate, ".git"));
    await access(resolve(candidate, "pnpm-workspace.yaml"));
    return candidate;
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
