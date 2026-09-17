import { MockAgentProvider } from "@cadenceai/agents";
import { MockSandboxProvider } from "@cadenceai/sandboxes";
import { createRunExecutionFunction, inngest } from "@cadenceai/workflows";
import type { WorkflowDeps } from "@cadenceai/workflows";
import { getDb } from "@cadenceai/db";

// Phase 0: everything is mock. Phase 1 swaps in E2BSandboxProvider and
// ClaudeCodeAgentProvider without changing any workflow code.
export function buildWorkflowDeps(): WorkflowDeps {
  return {
    db: getDb(),
    sandboxProvider: new MockSandboxProvider(),
    agentProvider: new MockAgentProvider(),
  };
}

export const cadenceaiInngestFunctions = [createRunExecutionFunction(buildWorkflowDeps())];

export { inngest };
