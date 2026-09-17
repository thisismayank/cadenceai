export type InteractionMode = "auto" | "chat" | "pipeline";
export type IntentRoute = Exclude<InteractionMode, "auto">;

const ACTION = /\b(?:add|build|change|code|create|debug|delete|develop|fix|implement|install|integrate|make|migrate|modify|refactor|remove|rename|replace|set up|ship|update|upgrade|write)\b/i;
const ENGINEERING_TARGET = /\b(?:api|app|application|bug|cli|code|component|database|endpoint|feature|file|function|integration|mcp|package|pipeline|project|repo(?:sitory)?|schema|script|service|test|tests|ui|workflow)\b/i;
const STRONG_ACTION = /^(?:please\s+)?(?:add|build|create|debug|delete|fix|implement|integrate|make|migrate|modify|refactor|remove|rename|replace|set up|ship|update|upgrade|write)\b/i;
const EXPLICIT_GO_AHEAD = /^(?:(?:let(?:'s| us)|help me)\s+(?:add|build|create|fix|implement|make|refactor|ship|update)|(?:go ahead|let(?:'s| us) do it)\b)/i;
const CONTEXTUAL_ACTION = /^(?:ok(?:ay)?[,\s]+|alright[,\s]+)?(?:please\s+)?(?:build|do|implement|make|ship|apply|proceed with)\s+(?:that|this|it)\b/i;

/**
 * Route conservatively: questions are conversation unless they clearly ask
 * CadenceAI to perform an engineering change. Users can always override this.
 */
export function classifyIntent(input: string, mode: InteractionMode = "auto"): IntentRoute {
  if (mode !== "auto") return mode;
  const text = input.trim();
  if (!text) return "chat";
  if (CONTEXTUAL_ACTION.test(text)) return "pipeline";
  if (EXPLICIT_GO_AHEAD.test(text)) return "pipeline";
  if (STRONG_ACTION.test(text)) return "pipeline";
  if (/\b(?:can|could|would|will)\s+you\b/i.test(text) && ACTION.test(text) && ENGINEERING_TARGET.test(text)) return "pipeline";
  if (/\b(?:i\s+(?:need|want)|we\s+(?:need|want|should))\b/i.test(text) && ACTION.test(text) && ENGINEERING_TARGET.test(text)) return "pipeline";
  return "chat";
}
