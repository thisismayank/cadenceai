import type { AgentProvider } from "@cadenceai/agents";
import type { Database } from "@cadenceai/db";
import type { SandboxProvider } from "@cadenceai/sandboxes";

export type WorkflowDeps = {
  db: Database;
  sandboxProvider: SandboxProvider;
  agentProvider: AgentProvider;
};
