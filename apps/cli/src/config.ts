import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_MODEL_POLICY,
  type CapabilityProfile,
  type ModelCandidate,
  type ModelPolicy,
} from "@cadenceai/agents";
import type { RiskLevel } from "./task.ts";
import type { BudgetMode } from "./budget.ts";

export type PipelineStageConfig = {
  name: string;
  detail: string;
  modelProfile: CapabilityProfile | "shell" | "human";
};

export type EngineeringPipelineConfig = {
  stages: Record<string, PipelineStageConfig>;
  riskStages: Record<RiskLevel, string[]>;
  verificationCommands: "auto" | Array<{ command: string; args: string[]; label: string }>;
};

export type ReviewPipelineConfig = {
  stages: Record<string, PipelineStageConfig>;
  order: string[];
};

export type CadenceConfig = {
  version: 1;
  budget: {
    defaultMode: BudgetMode;
  };
  guardrails: {
    maxModelCallsPerTask: number | null;
  };
  chat: {
    defaultModel: string;
    models: Record<string, ModelCandidate>;
  };
  profiles: ModelPolicy;
  risk: {
    highKeywords: string[];
    lowKeywords: string[];
  };
  pipelines: {
    engineering: EngineeringPipelineConfig;
    pullRequestReview: ReviewPipelineConfig;
    qualityAssurance: ReviewPipelineConfig;
  };
};

export const PROJECT_CONFIG_NAME = ".cadenceai.json";

export const DEFAULT_CONFIG: CadenceConfig = {
  version: 1,
  budget: {
    defaultMode: "balanced",
  },
  guardrails: {
    maxModelCallsPerTask: null,
  },
  chat: {
    defaultModel: "auto",
    models: {
      "claude-sonnet": { cli: "claude", model: "sonnet", effort: "low" },
      "claude-opus": { cli: "claude", model: "opus", effort: "medium" },
      "codex-terra": { cli: "codex", model: "gpt-5.6-terra", effort: "low" },
      "codex-sol": { cli: "codex", model: "gpt-5.6-sol", effort: "medium" },
    },
  },
  profiles: structuredClone(DEFAULT_MODEL_POLICY),
  risk: {
    highKeywords: ["authentication", "authorization", "billing", "encryption", "migration", "payment", "permissions", "production", "security", "secrets", "data loss"],
    lowKeywords: ["copy change", "documentation", "formatting", "rename", "spelling", "typo"],
  },
  pipelines: {
    engineering: {
      stages: {
        analyze: { name: "Analyze", detail: "Assess intent, ambiguity, scope, and risk", modelProfile: "fast_classifier" },
        investigate: { name: "Investigate", detail: "Inspect relevant code paths and connected context", modelProfile: "balanced_reasoner" },
        test_design: { name: "Design tests", detail: "Write the executable contract before implementation", modelProfile: "flagship_reasoner" },
        implement: { name: "Implement", detail: "Change production code against the approved contract", modelProfile: "flagship_coder" },
        verify: { name: "Verify", detail: "Run deterministic tests, lint, typecheck, and build", modelProfile: "shell" },
        adversarial: { name: "Adversarial", detail: "Challenge the candidate and its evidence independently", modelProfile: "flagship_reasoner" },
        human_review: { name: "Human review", detail: "Review evidence and accept, revise, or reject", modelProfile: "human" },
      },
      riskStages: {
        low: ["analyze", "implement", "verify", "human_review"],
        medium: ["analyze", "investigate", "test_design", "implement", "verify", "human_review"],
        high: ["analyze", "investigate", "test_design", "implement", "verify", "adversarial", "human_review"],
      },
      verificationCommands: "auto",
    },
    pullRequestReview: {
      stages: {
        inspect: { name: "Inspect diff", detail: "Read the PR, changed files, and repository guidance", modelProfile: "connected_research" },
        requirements: { name: "Requirements", detail: "Compare the change with linked requirements", modelProfile: "balanced_reasoner" },
        correctness: { name: "Correctness", detail: "Review behavior, security, and maintainability", modelProfile: "pull_request_review" },
        test_gaps: { name: "Test gaps", detail: "Find missing coverage and unverified claims", modelProfile: "flagship_reasoner" },
        adversarial: { name: "Adversarial", detail: "Try to falsify the review conclusions", modelProfile: "flagship_reasoner" },
        synthesize: { name: "Review report", detail: "Consolidate evidence and prioritized findings", modelProfile: "pull_request_review" },
        human_review: { name: "Human review", detail: "Decide how to act on the findings", modelProfile: "human" },
      },
      order: ["inspect", "requirements", "correctness", "test_gaps", "adversarial", "synthesize", "human_review"],
    },
    qualityAssurance: {
      stages: {
        collect: { name: "Collect evidence", detail: "Fetch the ticket, comments, linked pull requests, diffs, and CI results", modelProfile: "connected_research" },
        requirements: { name: "Requirements", detail: "Build the requirement and acceptance-criteria matrix", modelProfile: "balanced_reasoner" },
        implementation: { name: "Implementation", detail: "Map pull-request and code evidence to every requirement", modelProfile: "pull_request_review" },
        verification: { name: "Verification gaps", detail: "Assess CI, tests, failures, and unverified behavior", modelProfile: "flagship_reasoner" },
        adversarial: { name: "Adversarial", detail: "Challenge coverage, edge cases, regressions, and release assumptions", modelProfile: "flagship_reasoner" },
        synthesize: { name: "QA report", detail: "Consolidate the evidence into a release-oriented verdict", modelProfile: "pull_request_review" },
        human_review: { name: "Human decision", detail: "Accept the evidence, request fixes, or start engineering", modelProfile: "human" },
      },
      order: ["collect", "requirements", "implementation", "verification", "adversarial", "synthesize", "human_review"],
    },
  },
};

export type LoadedConfig = {
  config: CadenceConfig;
  projectPath: string;
  loadedPaths: string[];
};

export async function loadCadenceConfig(cwd: string, globalPath = join(homedir(), ".config", "cadenceai", "config.json")): Promise<LoadedConfig> {
  const projectPath = join(cwd, PROJECT_CONFIG_NAME);
  let value: unknown = structuredClone(DEFAULT_CONFIG);
  const loadedPaths: string[] = [];
  for (const path of [globalPath, projectPath]) {
    const override = await readOptionalJson(path);
    if (override !== undefined) {
      value = mergeConfig(value, override);
      loadedPaths.push(path);
    }
  }
  return { config: validateConfig(value), projectPath, loadedPaths };
}

export async function initializeProjectConfig(cwd: string): Promise<string> {
  const path = join(cwd, PROJECT_CONFIG_NAME);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { flag: "wx" });
  return path;
}

export function resolveChatCandidates(config: CadenceConfig, selection: string): readonly ModelCandidate[] {
  const selected = selection === "default" ? config.chat.defaultModel : selection;
  if (selected === "auto") return config.profiles.conversation;
  const alias = config.chat.models[selected];
  if (alias) return [alias];
  const match = /^(claude|codex|opencode)\/(.+)$/.exec(selected);
  if (match) return [{ cli: match[1], model: match[2], effort: "low" } as ModelCandidate];
  throw new Error(`Unknown model '${selection}'. Use /models to list configured aliases.`);
}

export function pipelineStages(config: CadenceConfig, risk: RiskLevel): PipelineStageConfig[] {
  const pipeline = config.pipelines.engineering;
  return pipeline.riskStages[risk].map((id) => {
    const stage = pipeline.stages[id];
    if (!stage) throw new Error(`Engineering pipeline references unknown stage '${id}'`);
    return stage;
  });
}

export function reviewStages(config: CadenceConfig): PipelineStageConfig[] {
  const pipeline = config.pipelines.pullRequestReview;
  return pipeline.order.map((id) => {
    const stage = pipeline.stages[id];
    if (!stage) throw new Error(`Review pipeline references unknown stage '${id}'`);
    return stage;
  });
}

export function qaStages(config: CadenceConfig): PipelineStageConfig[] {
  const pipeline = config.pipelines.qualityAssurance;
  return pipeline.order.map((id) => {
    const stage = pipeline.stages[id];
    if (!stage) throw new Error(`QA pipeline references unknown stage '${id}'`);
    return stage;
  });
}

async function readOptionalJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Could not load CadenceAI config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mergeConfig(base: unknown, override: unknown): unknown {
  if (!isObject(base) || !isObject(override)) return structuredClone(override);
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in merged ? mergeConfig(merged[key], value) : structuredClone(value);
  }
  return merged;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateConfig(value: unknown): CadenceConfig {
  if (!isObject(value) || value.version !== 1) throw new Error("CadenceAI config must have version: 1");
  const config = value as unknown as CadenceConfig;
  if (!config.budget || !["economy", "balanced", "thorough"].includes(config.budget.defaultMode)) {
    throw new Error("CadenceAI config budget.defaultMode must be economy, balanced, or thorough");
  }
  if (!config.guardrails || (config.guardrails.maxModelCallsPerTask !== null && (!Number.isInteger(config.guardrails.maxModelCallsPerTask) || config.guardrails.maxModelCallsPerTask < 1 || config.guardrails.maxModelCallsPerTask > 50))) {
    throw new Error("CadenceAI config guardrails.maxModelCallsPerTask must be null or an integer from 1 to 50");
  }
  if (!config.chat?.models || !config.profiles?.conversation || !config.profiles?.connected_research) {
    throw new Error("CadenceAI config is missing chat models or required model profiles");
  }
  for (const [profile, candidates] of Object.entries(config.profiles)) {
    if (!Array.isArray(candidates)) throw new Error(`Model profile '${profile}' must be an array`);
    for (const candidate of candidates) validateCandidate(candidate, `profiles.${profile}`);
  }
  for (const [alias, candidate] of Object.entries(config.chat.models)) validateCandidate(candidate, `chat.models.${alias}`);
  for (const risk of ["low", "medium", "high"] as const) {
    if (!Array.isArray(config.pipelines?.engineering?.riskStages?.[risk])) {
      throw new Error(`CadenceAI config is missing engineering riskStages.${risk}`);
    }
  }
  if (!Array.isArray(config.pipelines?.pullRequestReview?.order)) {
    throw new Error("CadenceAI config is missing the pull-request review order");
  }
  if (!Array.isArray(config.pipelines?.qualityAssurance?.order)) {
    throw new Error("CadenceAI config is missing the quality-assurance order");
  }
  for (const [id, stage] of Object.entries(config.pipelines.engineering.stages)) validateStage(stage, `engineering.stages.${id}`);
  for (const [id, stage] of Object.entries(config.pipelines.pullRequestReview.stages)) validateStage(stage, `pullRequestReview.stages.${id}`);
  for (const [id, stage] of Object.entries(config.pipelines.qualityAssurance.stages)) validateStage(stage, `qualityAssurance.stages.${id}`);
  pipelineStages(config, "low");
  pipelineStages(config, "medium");
  pipelineStages(config, "high");
  reviewStages(config);
  qaStages(config);
  const verification = config.pipelines.engineering.verificationCommands;
  if (verification !== "auto" && (!Array.isArray(verification) || verification.some((command) => !isObject(command) || typeof command.command !== "string" || !Array.isArray(command.args) || typeof command.label !== "string"))) {
    throw new Error("engineering.verificationCommands must be 'auto' or an array of command definitions");
  }
  return config;
}

function validateCandidate(value: unknown, path: string): asserts value is ModelCandidate {
  if (!isObject(value) || typeof value.cli !== "string" || typeof value.model !== "string" || !["low", "medium", "high", "xhigh", "max"].includes(String(value.effort))) {
    throw new Error(`Invalid model candidate at ${path}`);
  }
}

function validateStage(value: unknown, path: string): asserts value is PipelineStageConfig {
  if (!isObject(value) || typeof value.name !== "string" || typeof value.detail !== "string" || typeof value.modelProfile !== "string") {
    throw new Error(`Invalid pipeline stage at ${path}`);
  }
}
