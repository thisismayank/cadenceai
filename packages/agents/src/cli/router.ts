import type { CapabilityProfile, CliAgentAdapter, CliRunInput, CliRunResult, ModelCandidate, ModelPolicy } from "./types";

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
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
      const adapter = this.adapters.get(candidate.cli);
      if (!adapter) {
        failures.push({ candidate, error: `CLI adapter ${candidate.cli} is not configured` });
        continue;
      }
      const diagnostic = await adapter.diagnose();
      if (!diagnostic.installed || !diagnostic.authenticated) {
        failures.push({ candidate, error: diagnostic.detail ?? `${candidate.cli} is unavailable` });
        continue;
      }
      try {
        const result = await adapter.execute({ ...input, model: candidate.model, effort: candidate.effort });
        return { ...result, requestedProfile: profile, candidate, fallbackUsed: index > 0, failedCandidates: failures };
      } catch (error) {
        failures.push({ candidate, error: error instanceof Error ? error.message : String(error) });
      }
    }
    throw new Error(`No candidate succeeded for ${profile}: ${failures.map((f) => `${f.candidate.cli}/${f.candidate.model}: ${f.error}`).join("; ")}`);
  }
}
