export type CommandGuide = {
  command: string;
  usage: string;
  summary: string;
  calls?: string;
  when?: string;
  output?: string;
  safety?: string;
  examples?: string[];
  takesArgument?: boolean;
};

export const COMMAND_GUIDES: CommandGuide[] = [
  { command: "/chat", usage: "/chat <question>", summary: "force one direct answer", calls: "1", when: "You want a normal answer without tools or orchestration.", examples: ["/chat Explain eventual consistency"] , takesArgument: true },
  { command: "/explore", usage: "/explore <request>", summary: "investigate with read-only tools", calls: "1", when: "The answer depends on repository, Linear, or GitHub evidence.", safety: "Read-only; source content is treated as untrusted.", examples: ["/explore Summarize ELM-2851", "/explore Explain the authentication flow in this repository"], takesArgument: true },
  { command: "/pipeline", usage: "/pipeline <task>", summary: "force test-first engineering", calls: "1–5 plus optional connected context", when: "You want CadenceAI to modify the current repository.", output: "Code changes, deterministic verification, Git status, and human review.", safety: "Requires a clean Git worktree and confirmation preflight.", examples: ["/pipeline Implement ELM-2851"], takesArgument: true },
  { command: "/review", usage: "/review <PR>", summary: "review a pull request", calls: "6", when: "You want independent correctness, security, maintainability, and test-gap review.", safety: "Read-only; never posts comments.", examples: ["/review https://github.com/acme/app/pull/42"], takesArgument: true },
  { command: "/qa", usage: "/qa <ticket>", summary: "compare implementation with requirements", calls: "6", when: "A ticket has linked PRs and you need a release-oriented coverage verdict.", output: "Requirement matrix and Pass, Conditional Pass, Fail, or Insufficient Evidence verdict.", safety: "Reads ticket, PR diff, and CI evidence; does not execute untrusted PR code locally.", examples: ["/qa ELM-2851"], takesArgument: true },
  { command: "/refine", usage: "/refine <ticket>", summary: "make requirements development-ready", calls: "3", when: "Before implementation, when requirements or acceptance criteria may be incomplete.", output: "Testable brief with numbered acceptance criteria and a readiness verdict.", safety: "Read-only; does not edit the source ticket.", examples: ["/refine ELM-2851"], takesArgument: true },
  { command: "/release", usage: "/release <scope>", summary: "produce a release go/no-go assessment", calls: "6", when: "You need to aggregate tickets, PRs, CI, rollout, rollback, and operational evidence.", output: "Go, Conditional Go, No-Go, or Insufficient Evidence report.", safety: "Read-only; does not change release or deployment state.", examples: ["/release ELM-2851 ELM-2852 and their linked PRs"], takesArgument: true },
  { command: "/plan", usage: "/plan <proposal>", summary: "challenge a plan across disciplines", calls: "6", when: "A product, architecture, or delivery decision needs multiple skeptical perspectives.", output: "Decision-ready plan covering product, UX, engineering, commercial, and dissent.", safety: "Advisory only; human owners still approve commitments.", examples: ["/plan Improve developer onboarding without requiring API keys"], takesArgument: true },
  { command: "/crossrepo", usage: "/crossrepo <change and paths>", summary: "coordinate a multi-repository change", calls: "6", when: "A contract, schema, package, or API change spans independently released repositories.", output: "Dependency map, compatibility strategy, ordered rollout, test matrix, and authorization gates.", safety: "Read-only planning; no repository is modified.", examples: ["/crossrepo Migrate the API contract across ./service and ./client"], takesArgument: true },
  { command: "/handoff", usage: "/handoff [focus]", summary: "save a continuation brief", calls: "1", when: "Another developer or future session needs the current objective, evidence, decisions, risks, and next steps.", output: "Redacted Markdown under .cadence/handoffs/.", safety: "Common credential shapes are removed from the durable artifact.", examples: ["/handoff", "/handoff Focus on unresolved release blockers"], takesArgument: true },
  { command: "/model", usage: "/model <alias>", summary: "choose the normal-chat model", takesArgument: true },
  { command: "/models", usage: "/models", summary: "list configured chat models" },
  { command: "/budget", usage: "/budget <economy|balanced|thorough>", summary: "set engineering depth", takesArgument: true },
  { command: "/limit", usage: "/limit <number|off>", summary: "set the session model-call ceiling", takesArgument: true },
  { command: "/usage", usage: "/usage", summary: "show local seven-day model activity" },
  { command: "/retry", usage: "/retry", summary: "retry the preserved failed request" },
  { command: "/pipelines", usage: "/pipelines", summary: "show configured workflow stages" },
  { command: "/context", usage: "/context <view|none>", summary: "inspect or remove pending engineering context", takesArgument: true },
  { command: "/config", usage: "/config <init|reload>", summary: "create or reload editable configuration", takesArgument: true },
  { command: "/doctor", usage: "/doctor", summary: "check local agent runtimes" },
  { command: "/quickstart", usage: "/quickstart", summary: "show the five-minute walkthrough" },
  { command: "/tour", usage: "/tour", summary: "show the zero-cost product tour" },
  { command: "/setup", usage: "/setup", summary: "show guided setup instructions" },
  { command: "/update", usage: "/update", summary: "show safe update instructions" },
  { command: "/stages", usage: "/stages", summary: "focus the stage navigator" },
  { command: "/cancel", usage: "/cancel", summary: "cancel a pending preflight" },
  { command: "/new", usage: "/new", summary: "start a fresh context boundary" },
  { command: "/exit", usage: "/exit", summary: "close CadenceAI" },
  { command: "/help", usage: "/help [command]", summary: "show commands or explain one workflow", takesArgument: true },
];

export const FIRST_RUN_TOUR = [
  "Welcome to CadenceAI — this tour uses no model calls.",
  "",
  "1. Ask normally: What does this error mean?",
  "2. Research or refine: /explore …  /refine ELM-2851",
  "3. Build or verify: /pipeline …  /qa ELM-2851",
  "4. Preserve the result: /handoff",
  "",
  "Every multi-model workflow shows its expected calls and waits for confirmation.",
  "Type / then Tab, /help qa for details, or /quickstart for the walkthrough.",
].join("\n");

export function commandSuggestions(input: string, limit = 6): CommandGuide[] {
  const normalized = input.trimStart().toLowerCase();
  if (!normalized.startsWith("/")) return [];
  if (normalized.startsWith("/help ")) {
    const topic = normalized.slice(6).trim();
    if (!topic) return COMMAND_GUIDES.filter((guide) => guide.when).slice(0, limit);
    return COMMAND_GUIDES.filter((guide) => guide.command.slice(1).startsWith(topic) && guide.when).slice(0, limit);
  }
  if (/\s/.test(normalized)) return [];
  return COMMAND_GUIDES.filter((guide) => guide.command.startsWith(normalized)).slice(0, limit);
}

export function completeCommand(guide: CommandGuide, input = ""): string {
  if (input.trimStart().toLowerCase().startsWith("/help ")) return `/help ${guide.command.slice(1)}`;
  return `${guide.command}${guide.takesArgument ? " " : ""}`;
}

export function formatTuiHelp(topic?: string): string {
  const normalized = topic?.trim().replace(/^\//, "").toLowerCase();
  if (normalized) {
    const guide = COMMAND_GUIDES.find((item) => item.command.slice(1) === normalized);
    if (!guide) return `Unknown help topic '${topic}'. Use /help to list commands.`;
    return [
      guide.usage,
      guide.summary,
      guide.calls ? `Planned model calls: ${guide.calls}` : "",
      guide.when ? `Use when: ${guide.when}` : "",
      guide.output ? `Produces: ${guide.output}` : "",
      guide.safety ? `Safety: ${guide.safety}` : "",
      ...(guide.examples?.length ? ["", "Examples", ...guide.examples.map((example) => `  ${example}`)] : []),
    ].filter(Boolean).join("\n");
  }
  return [
    "Commands — type /help <command> for details",
    "",
    ...COMMAND_GUIDES.map((guide) => `${guide.usage.padEnd(38)} ${guide.summary}`),
    "",
    "Type / to see suggestions and press Tab to complete a command.",
  ].join("\n");
}
