import {
  ClaudeCliAdapter,
  CodexCliAdapter,
  OpenCodeCliAdapter,
  type CliAgentAdapter,
  type CliDiagnostic,
} from "@cadenceai/agents";

export const RUNTIME_HELP: Record<string, { install: string; login: string; docs: string }> = {
  claude: {
    install: "npm install -g @anthropic-ai/claude-code",
    login: "claude auth login",
    docs: "https://docs.anthropic.com/en/docs/claude-code/getting-started",
  },
  codex: {
    install: "npm install -g @openai/codex",
    login: "codex login",
    docs: "https://help.openai.com/en/articles/11096431",
  },
  opencode: {
    install: "npm install -g @opencode/cli",
    login: "opencode auth login",
    docs: "https://opencode.ai/v2/docs",
  },
};

export function defaultAdapters(): CliAgentAdapter[] {
  return [new CodexCliAdapter(), new ClaudeCliAdapter(), new OpenCodeCliAdapter()];
}

export async function diagnoseRuntimes(adapters: readonly CliAgentAdapter[] = defaultAdapters()): Promise<CliDiagnostic[]> {
  return Promise.all(adapters.map((adapter) => adapter.diagnose()));
}

export function formatActionableDiagnostics(diagnostics: readonly CliDiagnostic[]): string {
  const ready = diagnostics.filter((item) => item.installed && item.authenticated);
  const lines = diagnostics.flatMap((item) => {
    const help = RUNTIME_HELP[item.command];
    if (item.installed && item.authenticated) {
      return [
        `✓ ${item.command} ${item.version ?? ""} — ready`.trim(),
        ...(item.detail ? [`  ${singleLine(item.detail)}`] : []),
      ];
    }
    if (!item.installed) {
      return [
        `✗ ${item.command} — not installed`,
        `  Install: ${help?.install ?? `install ${item.command} and ensure it is on PATH`}`,
        ...(help ? [`  Guide: ${help.docs}`] : []),
      ];
    }
    return [
      `✗ ${item.command} ${item.version ?? ""} — login required`.trim(),
      `  Authenticate: ${help?.login ?? `${item.command} login`}`,
      ...(item.detail ? [`  Detail: ${singleLine(item.detail)}`] : []),
    ];
  });
  return [
    "CadenceAI doctor",
    "",
    ...lines,
    "",
    ready.length
      ? `${ready.length} runtime${ready.length === 1 ? " is" : "s are"} ready. CadenceAI can route around unavailable providers when a profile has a fallback.`
      : "No authenticated runtime is ready. Install and authenticate at least one, then run `cadenceai doctor` again.",
    "CadenceAI uses the runtimes' existing credentials and never asks for or stores API keys.",
  ].join("\n");
}

function singleLine(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}…` : compact;
}
