import type { ProviderCooldown } from "@cadenceai/agents";

export function formatFailureRecovery(message: string, cooldowns: readonly ProviderCooldown[]): string {
  const quota = /(?:rate limit|usage limit|weekly limit|quota|allowance|too many requests|credits? exhausted|cooling down)/i.test(message);
  const unavailableModel = /(?:model.*(?:unavailable|not found|not supported|access)|unknown model)/i.test(message);
  const lines = [
    "",
    "Recovery",
    quota
      ? "A provider allowance or rate limit appears to be exhausted. CadenceAI tried configured fallbacks before stopping."
      : unavailableModel
        ? "The selected model may not be available on this account or CLI version."
        : "The request and its frozen context are retained for this session.",
    ...cooldowns.map((item) => "  " + item.cli + " cooling down · " + remaining(item.expiresAt) + " · " + item.reason),
    "Use /retry to try the preserved request again.",
    quota
      ? "You can wait for reset, use /model auto for chat fallback, or use /budget economy for the next engineering attempt."
      : unavailableModel
        ? "Use /model auto to try detected configured alternatives, inspect /models, or adjust the relevant capability profile in .cadenceai.json."
        : "Use /doctor for runtime remediation if retrying fails.",
  ];
  return lines.join("\n");
}

function remaining(expiresAt: number): string {
  const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60_000));
  if (minutes >= 24 * 60) return Math.ceil(minutes / (24 * 60)) + "d";
  if (minutes >= 60) return Math.ceil(minutes / 60) + "h";
  return minutes + "m";
}
