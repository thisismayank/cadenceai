import type { CapabilityProfile, CliAgentAdapter, CliChatInput, CliChatResult, CliRunInput, CliRunResult, ModelCandidate, ModelPolicy } from "./types";

const DIAGNOSTIC_TTL_MS = 60_000;
const diagnosticCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<CliAgentAdapter["diagnose"]>> }>();
const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 60_000;
const providerCooldowns = new Map<string, { expiresAt: number; reason: string }>();

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  conversation: [
    { cli: "claude", model: "sonnet", effort: "low" },
    { cli: "codex", model: "gpt-5.6-terra", effort: "low" },
  ],
  connected_research: [
    { cli: "claude", model: "sonnet", effort: "medium" },
    { cli: "codex", model: "gpt-5.6-terra", effort: "medium" },
  ],
  pull_request_review: [
    { cli: "codex", model: "gpt-5.6-sol", effort: "high" },
    { cli: "claude", model: "sonnet", effort: "high" },
  ],
  fast_classifier: [
    { cli: "codex", model: "gpt-5.6-luna", effort: "low" },
    { cli: "claude", model: "haiku", effort: "low" },
  ],
  balanced_reasoner: [
    { cli: "codex", model: "gpt-5.6-terra", effort: "medium" },
    { cli: "claude", model: "sonnet", effort: "medium" },
  ],
  flagship_coder: [
    { cli: "codex", model: "gpt-5.6-sol", effort: "high" },
    { cli: "claude", model: "opus", effort: "high" },
  ],
  flagship_reasoner: [
    { cli: "claude", model: "sonnet", effort: "high" },
    { cli: "codex", model: "gpt-5.6-sol", effort: "high" },
  ],
  critical_escalation: [
    { cli: "codex", model: "gpt-6-astra", effort: "high" },
    { cli: "claude", model: "opus", effort: "high" },
  ],
};

export type RoutingResult = CliRunResult & {
  requestedProfile: CapabilityProfile;
  candidate: ModelCandidate;
  fallbackUsed: boolean;
  failedCandidates: Array<{ candidate: ModelCandidate; error: string }>;
};

export type ChatRoutingResult = CliChatResult & {
  requestedProfile: CapabilityProfile;
  candidate: ModelCandidate;
  fallbackUsed: boolean;
  failedCandidates: Array<{ candidate: ModelCandidate; error: string }>;
};

export class ModelRouter {
  private readonly adapters: Map<string, CliAgentAdapter>;
  private readonly policy: ModelPolicy;
  constructor(adapters: CliAgentAdapter[], policy: ModelPolicy = DEFAULT_MODEL_POLICY) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.name, adapter]));
    this.policy = policy;
  }

  async execute(profile: CapabilityProfile, input: Omit<CliRunInput, "model" | "effort">): Promise<RoutingResult> {
    const failures: RoutingResult["failedCandidates"] = [];
    const candidates = this.policy[profile];
    for (const [index, candidate] of candidates.entries()) {
      const cooldown = activeCooldown(candidate.cli);
      if (cooldown) {
        failures.push({ candidate, error: `provider cooling down: ${cooldown.reason}` });
        continue;
      }
      const adapter = this.adapters.get(candidate.cli);
      if (!adapter) {
        failures.push({ candidate, error: `CLI adapter ${candidate.cli} is not configured` });
        continue;
      }
      const diagnostic = await diagnose(adapter);
      if (!diagnostic.installed || !diagnostic.authenticated) {
        failures.push({ candidate, error: diagnostic.detail ?? `${candidate.cli} is unavailable` });
        continue;
      }
      try {
        const result = await adapter.execute({ ...input, model: candidate.model, effort: candidate.effort });
        return { ...result, requestedProfile: profile, candidate, fallbackUsed: index > 0, failedCandidates: failures };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        maybeCooldown(candidate.cli, message);
        failures.push({ candidate, error: message });
      }
    }
    throw new Error(`No candidate succeeded for ${profile}: ${failures.map((f) => `${f.candidate.cli}/${f.candidate.model}: ${f.error}`).join("; ")}`);
  }

  async chat(profile: CapabilityProfile, input: Omit<CliChatInput, "model" | "effort">): Promise<ChatRoutingResult> {
    return this.chatCandidates(profile, this.policy[profile], input);
  }

  async chatCandidates(
    profile: CapabilityProfile,
    candidates: readonly ModelCandidate[],
    input: Omit<CliChatInput, "model" | "effort">,
  ): Promise<ChatRoutingResult> {
    const failures: ChatRoutingResult["failedCandidates"] = [];
    for (const [index, candidate] of candidates.entries()) {
      const cooldown = activeCooldown(candidate.cli);
      if (cooldown) {
        failures.push({ candidate, error: `provider cooling down: ${cooldown.reason}` });
        continue;
      }
      const adapter = this.adapters.get(candidate.cli);
      if (!adapter) {
        failures.push({ candidate, error: `CLI adapter ${candidate.cli} is not configured` });
        continue;
      }
      const diagnostic = await diagnose(adapter);
      if (!diagnostic.installed || !diagnostic.authenticated) {
        failures.push({ candidate, error: diagnostic.detail ?? `${candidate.cli} is unavailable` });
        continue;
      }
      try {
        const result = await adapter.chat({ ...input, model: candidate.model, effort: candidate.effort });
        return { ...result, requestedProfile: profile, candidate, fallbackUsed: index > 0, failedCandidates: failures };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        maybeCooldown(candidate.cli, message);
        failures.push({ candidate, error: message });
      }
    }
    throw new Error(`No candidate succeeded for ${profile}: ${failures.map((f) => `${f.candidate.cli}/${f.candidate.model}: ${f.error}`).join("; ")}`);
  }
}

async function diagnose(adapter: CliAgentAdapter) {
  if (!adapter.cacheDiagnostics) return adapter.diagnose();
  const cached = diagnosticCache.get(adapter.name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await adapter.diagnose();
  diagnosticCache.set(adapter.name, { value, expiresAt: Date.now() + DIAGNOSTIC_TTL_MS });
  return value;
}

export function clearDiagnosticCache(): void {
  diagnosticCache.clear();
}

export type ProviderCooldown = { cli: string; expiresAt: number; reason: string };

export function getProviderCooldowns(now = Date.now()): ProviderCooldown[] {
  for (const [cli, cooldown] of providerCooldowns) {
    if (cooldown.expiresAt <= now) providerCooldowns.delete(cli);
  }
  return [...providerCooldowns].map(([cli, cooldown]) => ({ cli, ...cooldown }));
}

export function clearProviderCooldowns(): void {
  providerCooldowns.clear();
}

function activeCooldown(cli: string, now = Date.now()) {
  const cooldown = providerCooldowns.get(cli);
  if (cooldown && cooldown.expiresAt <= now) {
    providerCooldowns.delete(cli);
    return undefined;
  }
  return cooldown;
}

function maybeCooldown(cli: string, reason: string): void {
  if (!/(?:rate limit|usage limit|weekly limit|quota|allowance|too many requests|credits? exhausted)/i.test(reason)) return;
  providerCooldowns.set(cli, {
    expiresAt: Date.now() + cooldownDuration(reason),
    reason: compactReason(reason),
  });
}

function cooldownDuration(reason: string): number {
  const match = /(?:reset|retry|try again|available)[^\d]{0,20}(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)/i.exec(reason);
  if (!match) return DEFAULT_QUOTA_COOLDOWN_MS;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "minutes";
  if (unit.startsWith("sec")) return amount * 1_000;
  if (unit.startsWith("hour") || unit.startsWith("hr")) return amount * 60 * 60_000;
  if (unit.startsWith("day")) return amount * 24 * 60 * 60_000;
  return amount * 60_000;
}

function compactReason(reason: string): string {
  const singleLine = reason.replace(/\s+/g, " ").trim();
  return singleLine.length > 180 ? `${singleLine.slice(0, 177)}…` : singleLine;
}
