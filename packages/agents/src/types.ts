import type { StageKind } from "@cadenceai/schemas";
import type { SandboxHandle, SandboxProvider } from "@cadenceai/sandboxes";

export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
};

export type AgentArtifact = {
  type: "EXECUTION_PLAN" | "IMPLEMENTATION_SUMMARY" | "TEST_REPORT" | "REVIEW_REPORT" | "DIFF" | "LOG" | "OTHER";
  name: string;
  content: unknown;
};

export type AgentFinding = {
  severity: "info" | "low" | "medium" | "high" | "critical";
  category: string;
  file?: string;
  line?: number;
  description: string;
  evidence: string;
  recommendation?: string;
};

export type AgentExecutionInput = {
  role: StageKind;
  task: string;
  instructions: string;
  acceptanceCriteria: string[];
  sandbox: SandboxProvider;
  sandboxHandle: SandboxHandle;
  priorArtifacts?: AgentArtifact[];
  allowedTools?: string[];
  promptVersion?: string;
};

export type AgentExecutionResult = {
  status: "success" | "failure";
  summary: string;
  artifacts: AgentArtifact[];
  findings: AgentFinding[];
  usage: AgentUsage;
  rawLogsReference?: string;
};

export interface AgentProvider {
  readonly name: string;
  execute(input: AgentExecutionInput): Promise<AgentExecutionResult>;
}
