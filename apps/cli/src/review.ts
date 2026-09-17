import type { CapabilityProfile, ChatRoutingResult, ModelCandidate } from "@cadenceai/agents";
import { runAssistant } from "./chat.ts";
import type { CadenceConfig, PipelineStageConfig } from "./config.ts";

export type ReviewStageUpdate = {
  stage: PipelineStageConfig;
  status: "running" | "complete" | "failed";
  detail?: string;
  model?: string;
};

export type PullRequestReviewResult = {
  report: string;
  runs: Array<{ stage: string; cli: string; model: string }>;
};

export type ReviewAssistant = typeof runAssistant;

export async function reviewPullRequest(
  request: string,
  cwd: string,
  config: CadenceConfig,
  onStage: (update: ReviewStageUpdate) => void,
  assistant: ReviewAssistant = runAssistant,
): Promise<PullRequestReviewResult> {
  const pipeline = config.pipelines.pullRequestReview;
  const outputs: Array<{ stage: string; text: string }> = [];
  const runs: PullRequestReviewResult["runs"] = [];
  for (const id of pipeline.order) {
    const stage = pipeline.stages[id];
    if (!stage || stage.modelProfile === "human") continue;
    const profile = stage.modelProfile as CapabilityProfile;
    const candidates = candidatesFor(config, profile);
    onStage({ stage, status: "running" });
    try {
      const result = await runReviewStage(id, stage, request, cwd, profile, candidates, outputs, assistant);
      outputs.push({ stage: stage.name, text: result.text });
      runs.push({ stage: stage.name, cli: result.cli, model: result.model });
      onStage({ stage, status: "complete", detail: summarize(result.text), model: `${result.cli} · ${result.model}` });
    } catch (error) {
      onStage({ stage, status: "failed", detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return { report: outputs.at(-1)?.text ?? "The review produced no report.", runs };
}

async function runReviewStage(
  id: string,
  stage: PipelineStageConfig,
  request: string,
  cwd: string,
  profile: CapabilityProfile,
  candidates: readonly ModelCandidate[],
  previous: Array<{ stage: string; text: string }>,
  assistant: ReviewAssistant,
): Promise<ChatRoutingResult> {
  const inspect = id === "inspect";
  const priorEvidence = previous.map((item) => `## ${item.stage}\n${item.text}`).join("\n\n").slice(-30_000);
  return assistant({
    profile,
    candidates,
    cwd,
    toolAccess: inspect ? "read-only" : "none",
    allowedTools: inspect ? [
      "Read", "Grep", "Glob",
      "Bash(git status *)", "Bash(git diff *)",
      "Bash(gh pr view *)", "Bash(gh pr diff *)",
    ] : undefined,
    timeoutMs: inspect ? 8 * 60_000 : 4 * 60_000,
    prompt: [
      `You are executing the '${stage.name}' stage of CadenceAI's pull-request review pipeline.`,
      stage.detail,
      inspect
        ? "Use repository, GitHub CLI, or configured MCP tools read-only. Inspect the actual diff and relevant surrounding code. Never modify anything or post comments."
        : "Work only from the evidence supplied below. Do not use tools. Challenge unsupported claims and distinguish verified evidence from inference.",
      `Review request:\n${request}`,
      priorEvidence ? `Prior independent evidence:\n${priorEvidence}` : "",
      id === "synthesize"
        ? "Return one concise review report with: verdict, prioritized findings, evidence, test gaps, and recommended next actions. Do not invent findings."
        : "Return concise, evidence-backed findings for this stage. State explicitly when no issue is found.",
    ].filter(Boolean).join("\n\n"),
  });
}

function candidatesFor(config: CadenceConfig, profile: CapabilityProfile): readonly ModelCandidate[] {
  const candidates = config.profiles[profile];
  if (!candidates?.length) throw new Error(`No candidates configured for model profile '${profile}'`);
  return candidates;
}

function summarize(value: string): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > 180 ? `${line.slice(0, 177)}…` : line;
}
