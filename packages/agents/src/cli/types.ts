import type { AgentExecutionResult } from "../types";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type CliPermission = "read-only" | "workspace-write";
export type CliToolAccess = "none" | "read-only";

export type CliDiagnostic = {
  command: string;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  detail?: string;
};

export type CliRunInput = {
  prompt: string;
  cwd: string;
  model: string;
  effort: ReasoningEffort;
  permission: CliPermission;
  timeoutMs?: number;
  allowedTools?: string[];
  onEvent?: (event: CliStreamEvent) => void;
};

export type CliStreamEvent = {
  stream: "stdout" | "stderr";
  data: string;
};

export type CliRunResult = AgentExecutionResult & {
  cli: string;
  cliVersion?: string;
  model: string;
  effort: ReasoningEffort;
  rawOutput: string;
};

export type CliChatInput = {
  prompt: string;
  cwd: string;
  model: string;
  effort: ReasoningEffort;
  toolAccess?: CliToolAccess;
  allowedTools?: string[];
  conversationId?: string;
  continuationPrompt?: string;
  timeoutMs?: number;
  onEvent?: (event: CliStreamEvent) => void;
  onText?: (text: string) => void;
};

export type CliChatResult = {
  cli: string;
  cliVersion?: string;
  model: string;
  effort: ReasoningEffort;
  text: string;
  rawOutput: string;
};

export interface CliAgentAdapter {
  readonly name: string;
  readonly cacheDiagnostics?: boolean;
  diagnose(): Promise<CliDiagnostic>;
  execute(input: CliRunInput): Promise<CliRunResult>;
  chat(input: CliChatInput): Promise<CliChatResult>;
}

export type CapabilityProfile =
  | "conversation"
  | "connected_research"
  | "pull_request_review"
  | "fast_classifier"
  | "balanced_reasoner"
  | "flagship_coder"
  | "flagship_reasoner"
  | "critical_escalation";

export type ModelCandidate = {
  cli: string;
  model: string;
  effort: ReasoningEffort;
};

export type ModelPolicy = Record<CapabilityProfile, readonly ModelCandidate[]>;
