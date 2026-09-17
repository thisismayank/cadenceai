import type {
  AgentExecutionInput,
  AgentExecutionResult,
  AgentProvider,
} from "./types";

// MockAgentProvider is used by workflow tests. It returns deterministic artifacts
// per stage kind without calling any model or touching a real sandbox.
export class MockAgentProvider implements AgentProvider {
  readonly name = "mock";

  async execute(input: AgentExecutionInput): Promise<AgentExecutionResult> {
    switch (input.role) {
      case "ANALYZER":
        return this.mockAnalyzer(input);
      case "IMPLEMENTER":
        return this.mockImplementer(input);
      case "TESTER":
        return this.mockTester(input);
      case "ADVERSARIAL":
        return this.mockAdversarial(input);
      default:
        return {
          status: "success",
          summary: `Mock agent noop for role ${input.role}`,
          artifacts: [],
          findings: [],
          usage: { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 },
        };
    }
  }

  private mockAnalyzer(input: AgentExecutionInput): AgentExecutionResult {
    return {
      status: "success",
      summary: "Mock analyzer created the default internal-alpha workflow.",
      artifacts: [
        {
          type: "EXECUTION_PLAN",
          name: "execution-plan",
          content: {
            intent: "software_change",
            complexity: "medium",
            risk: "MEDIUM",
            summary: input.task.slice(0, 200),
            ambiguities: [],
            acceptanceCriteria: input.acceptanceCriteria,
            stages: [
              {
                id: "investigate",
                role: "INVESTIGATOR",
                dependsOn: [],
                modelProfile: "balanced_reasoner",
                reasoningEffort: "medium",
                rationale: "The relevant code paths must be located before implementation.",
                required: true,
              },
              {
                id: "design-tests",
                role: "TEST_DESIGNER",
                dependsOn: [],
                modelProfile: "flagship_reasoner",
                reasoningEffort: "high",
                rationale: "An independent executable contract should precede production changes.",
                required: true,
              },
              {
                id: "implement",
                role: "IMPLEMENTER",
                dependsOn: ["investigate", "design-tests"],
                modelProfile: "flagship_coder",
                reasoningEffort: "high",
                rationale: "The requested software change requires repository writes.",
                required: true,
              },
              {
                id: "verify",
                role: "VERIFIER",
                dependsOn: ["implement"],
                modelProfile: "fast_classifier",
                reasoningEffort: "low",
                rationale: "The implementation must be checked against deterministic tests and acceptance criteria.",
                required: true,
              },
              {
                id: "adversarial",
                role: "ADVERSARIAL",
                dependsOn: ["verify"],
                modelProfile: "flagship_reasoner",
                reasoningEffort: "high",
                rationale: "An independent review is required before human approval.",
                required: true,
              },
              {
                id: "human-review",
                role: "HUMAN_REVIEW",
                dependsOn: ["adversarial"],
                modelProfile: "fast_classifier",
                reasoningEffort: "low",
                rationale: "A human makes the final acceptance decision.",
                required: true,
              },
            ],
          },
        },
      ],
      findings: [],
      usage: { inputTokens: 80, outputTokens: 80, estimatedCostCents: 1 },
    };
  }

  private mockImplementer(input: AgentExecutionInput): AgentExecutionResult {
    return {
      status: "success",
      summary: `Mock implementation for: ${input.task.slice(0, 60)}`,
      artifacts: [
        {
          type: "IMPLEMENTATION_SUMMARY",
          name: "impl-summary",
          content: {
            narrative: "Mock implementation. No real changes were made.",
            filesChanged: ["src/mock.ts"],
            testsAdded: [],
            testsExecuted: [],
            knownLimitations: ["This is a mock; no code was actually modified."],
          },
        },
        {
          type: "DIFF",
          name: "diff",
          content: {
            patch: "diff --git a/src/mock.ts b/src/mock.ts\n+// mock change\n",
            filesChanged: 1,
            additions: 1,
            deletions: 0,
            baseCommit: "0000000",
            headCommit: "1111111",
          },
        },
      ],
      findings: [],
      usage: { inputTokens: 100, outputTokens: 50, estimatedCostCents: 1 },
    };
  }

  private mockTester(input: AgentExecutionInput): AgentExecutionResult {
    return {
      status: "success",
      summary: "Mock tester: all tests passed (mock).",
      artifacts: [
        {
          type: "TEST_REPORT",
          name: "test-report",
          content: {
            status: "pass",
            testsRun: ["mock.test.ts"],
            testsPassed: 1,
            testsFailed: 0,
            lintPassed: true,
            typecheckPassed: true,
            acceptanceCriteria: input.acceptanceCriteria.map((c) => ({
              criterion: c,
              status: "verified",
              evidence: "Mock: assumed satisfied.",
            })),
            failures: [],
          },
        },
      ],
      findings: [],
      usage: { inputTokens: 100, outputTokens: 50, estimatedCostCents: 1 },
    };
  }

  private mockAdversarial(_input: AgentExecutionInput): AgentExecutionResult {
    return {
      status: "success",
      summary: "Mock adversarial: no findings.",
      artifacts: [
        {
          type: "REVIEW_REPORT",
          name: "review-report",
          content: {
            findings: [],
            overallVerdict: "safe_to_merge",
            summary: "Mock adversarial review found nothing.",
          },
        },
      ],
      findings: [],
      usage: { inputTokens: 100, outputTokens: 50, estimatedCostCents: 1 },
    };
  }
}
