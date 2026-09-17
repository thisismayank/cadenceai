import type { CadenceConfig } from "./config.ts";

export type TaskIntent = "chat" | "explore" | "engineering" | "review" | "qa" | "refine" | "release" | "plan" | "crossrepo" | "handoff";
export type RiskLevel = "low" | "medium" | "high";

export type TaskEnvelope = {
  request: string;
  intent: TaskIntent;
  risk: RiskLevel;
  linearTickets: string[];
  pullRequests: string[];
  needsConnectedTools: boolean;
};

const LINEAR_TICKET = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/gi;
const PR_URL = /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/gi;
const REVIEW = /\b(?:review|audit|inspect)\b.*\b(?:pr|pull request|diff)\b|\b(?:pr|pull request)\b.*\b(?:review|audit|inspect)\b/i;
const QUALITY_ASSURANCE = /\b(?:qa|quality assurance|acceptance criteria|assess(?:ment)?|validate|verification|requirement gaps?|test gaps?)\b/i;
const REFINEMENT = /\b(?:refine|clarify|ticket readiness|ready for (?:development|engineering)|improve (?:the )?requirements?|spec lint|requirement quality)\b/i;
const RELEASE = /\b(?:release readiness|go[ /-]?no[ -]?go|ship readiness|release gate|release assessment)\b/i;
const PLANNING = /^(?:please\s+)?(?:plan|help me plan|create (?:a )?plan|challenge (?:this|the) plan|review (?:this|the) rfc|write (?:an? )?rfc)\b|\b(?:planning council|decision-ready plan)\b/i;
const CROSS_REPOSITORY = /\b(?:cross[ -]?repo(?:sitory)?|multi[ -]?repo(?:sitory)?|multiple repositor(?:y|ies)|across (?:the )?repos(?:itories)?)\b/i;
const HANDOFF = /\b(?:handoff|hand-off|continuation brief|session brief)\b/i;
const ENGINEERING = /^(?:(?:please\s+)?(?:add|build|create|debug|delete|fix|implement|integrate|make|migrate|modify|refactor|remove|rename|replace|set up|ship|update|upgrade|write)|(?:go ahead|let(?:'s| us) do it)|(?:let(?:'s| us)|help me)\s+(?:add|build|create|fix|implement|make|refactor|ship|update))\b/i;
const CONTEXTUAL_ENGINEERING = /^(?:ok(?:ay)?[,\s]+|alright[,\s]+)?(?:please\s+)?(?:build|do|implement|make|ship|apply|proceed with)\s+(?:that|this|it)\b/i;
const CONNECTED_EXPLORATION = /\b(?:check|explain|explore|fetch|find|inspect|investigate|look at|read|summari[sz]e|understand)\b/i;
const REPOSITORY_REFERENCE = /\b(?:codebase|current (?:project|repo(?:sitory)?)|repository|this (?:project|repo(?:sitory)?))\b/i;

export function createTaskEnvelope(request: string, config: CadenceConfig, forced?: TaskIntent, contextSignals = ""): TaskEnvelope {
  const signals = `${request}\n${contextSignals}`;
  const linearTickets = unique(signals.match(LINEAR_TICKET) ?? [], true);
  const pullRequests = unique(signals.match(PR_URL) ?? []);
  const intent = forced ?? inferIntent(request, linearTickets, pullRequests);
  return {
    request,
    intent,
    risk: assessRisk(signals, config),
    linearTickets,
    pullRequests,
    needsConnectedTools: intent === "explore" || intent === "review" || intent === "refine" || intent === "release" || intent === "crossrepo" || (intent === "plan" && REPOSITORY_REFERENCE.test(request)) || linearTickets.length > 0 || pullRequests.length > 0,
  };
}

export function assessRisk(request: string, config: CadenceConfig): RiskLevel {
  const normalized = request.toLowerCase();
  if (config.risk.highKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) return "high";
  if (config.risk.lowKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) return "low";
  return "medium";
}

function inferIntent(request: string, tickets: string[], pullRequests: string[]): TaskIntent {
  if (HANDOFF.test(request)) return "handoff";
  if (CROSS_REPOSITORY.test(request)) return "crossrepo";
  if (RELEASE.test(request)) return "release";
  if (REFINEMENT.test(request)) return "refine";
  if (PLANNING.test(request)) return "plan";
  if (tickets.length > 0 && QUALITY_ASSURANCE.test(request)) return "qa";
  if (REVIEW.test(request) || pullRequests.length > 0) return "review";
  if (ENGINEERING.test(request) || CONTEXTUAL_ENGINEERING.test(request)) return "engineering";
  if ((tickets.length > 0 || REPOSITORY_REFERENCE.test(request)) && CONNECTED_EXPLORATION.test(request)) return "explore";
  return "chat";
}

function unique(values: string[], uppercase = false): string[] {
  return [...new Set(values.map((value) => uppercase ? value.toUpperCase() : value))];
}
