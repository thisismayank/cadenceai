import type { AgentExecutionResult } from "../types";

export const AGENT_RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "artifacts", "findings", "usage"],
  properties: {
    status: { type: "string", enum: ["success", "failure"] },
    summary: { type: "string" },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "content"],
        properties: {
          type: { type: "string", enum: ["EXECUTION_PLAN", "IMPLEMENTATION_SUMMARY", "TEST_REPORT", "REVIEW_REPORT", "DIFF", "LOG", "OTHER"] },
          name: { type: "string" },
          content: { type: "object", additionalProperties: true },
        },
      },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "category", "description", "evidence"],
        properties: {
          severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
          category: { type: "string" },
          file: { type: "string" },
          line: { type: "integer", minimum: 0 },
          description: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" },
        },
      },
    },
    usage: {
      type: "object",
      additionalProperties: false,
      required: ["inputTokens", "outputTokens", "estimatedCostCents"],
      properties: {
        inputTokens: { type: "integer", minimum: 0 },
        outputTokens: { type: "integer", minimum: 0 },
        estimatedCostCents: { type: "integer", minimum: 0 },
      },
    },
  },
} as const;

export function parseAgentResult(value: unknown): AgentExecutionResult {
  if (!value || typeof value !== "object") throw new Error("CLI returned a non-object result");
  const result = value as Partial<AgentExecutionResult>;
  if ((result.status !== "success" && result.status !== "failure") || typeof result.summary !== "string") {
    throw new Error("CLI result is missing a valid status or summary");
  }
  if (!Array.isArray(result.artifacts) || !Array.isArray(result.findings) || !result.usage) {
    throw new Error("CLI result is missing artifacts, findings, or usage");
  }
  return result as AgentExecutionResult;
}

export function buildPrompt(prompt: string): string {
  return `${prompt}\n\nReturn only the final structured result requested by the supplied JSON Schema. Do not wrap it in Markdown.`;
}
