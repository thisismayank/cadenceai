import {
  ClaudeCliAdapter,
  CodexCliAdapter,
  ModelRouter,
  OpenCodeCliAdapter,
  type CliStreamEvent,
  type ModelPolicy,
  type RoutingResult,
} from "@cadenceai/agents";
import { recordRoutingUsage } from "./usage.ts";

export type AnalyzerCallbacks = {
  onStream: (event: CliStreamEvent) => void;
};

export async function analyzeTask(
  task: string,
  cwd: string,
  callbacks: AnalyzerCallbacks,
  policy?: ModelPolicy,
): Promise<RoutingResult> {
  const router = new ModelRouter([new CodexCliAdapter(), new ClaudeCliAdapter(), new OpenCodeCliAdapter()], policy);
  const result = await router.execute("fast_classifier", {
    cwd,
    permission: "read-only",
    allowedTools: ["Read", "Grep", "Glob"],
    prompt: [
      "You are CadenceAI's analyzer. Assess the engineering task and produce an EXECUTION_PLAN artifact.",
      "The plan must use a test-first cadence: ANALYZE, parallel INVESTIGATE and TEST_DESIGN, IMPLEMENT, VERIFY, ADVERSARIAL, then HUMAN_REVIEW.",
      "Do not modify files. Keep the summary concise and identify ambiguities explicitly.",
      `Task:\n${task}`,
    ].join("\n\n"),
    onEvent: callbacks.onStream,
  });
  await recordRoutingUsage(cwd, "fast_classifier", result).catch(() => undefined);
  return result;
}

export type PlannedStageView = {
  name: string;
  detail: string;
  model: string;
};

export function stagesFromAnalysis(result: RoutingResult): PlannedStageView[] {
  const planArtifact = result.artifacts.find((artifact) => artifact.type === "EXECUTION_PLAN");
  const content = planArtifact?.content as {
    summary?: string;
    stages?: Array<{ role?: string; rationale?: string; modelProfile?: string }>;
  } | undefined;
  const planned = content?.stages ?? [];
  const dynamic = planned.map((stage) => ({
    name: title(stage.role ?? "stage"),
    detail: stage.rationale ?? "Selected by the analyzer",
    model: stage.modelProfile ?? "automatic",
  }));
  const has = (name: string) => dynamic.some((stage) => stage.name.toLowerCase().includes(name));
  return [
    { name: "Analyze", detail: content?.summary ?? result.summary, model: `${result.cli} · ${result.model}` },
    ...(has("investigat") ? [] : [{ name: "Investigate", detail: "Inspect the relevant code paths", model: "balanced_reasoner" }]),
    ...(has("test") ? [] : [{ name: "Design tests", detail: "Create an independent executable contract", model: "flagship_reasoner" }]),
    ...dynamic,
    ...(has("verif") ? [] : [{ name: "Verify", detail: "Run deterministic tests, lint, typecheck, and build", model: "shell" }]),
    ...(has("adversarial") ? [] : [{ name: "Adversarial", detail: "Challenge the candidate with independent evidence", model: "flagship_reasoner" }]),
    { name: "Human review", detail: "Review evidence and decide whether to accept", model: "human" },
  ];
}

function title(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
