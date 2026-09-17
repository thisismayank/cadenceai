import {
  ClaudeCliAdapter,
  CodexCliAdapter,
  ModelRouter,
  OpenCodeCliAdapter,
  type CapabilityProfile,
  type ChatRoutingResult,
  type CliToolAccess,
  type ModelCandidate,
} from "@cadenceai/agents";
import { recordRoutingUsage } from "./usage.ts";

export type ChatTurn = { role: "you" | "cadence"; text: string };

export type AssistantRequest = {
  prompt: string;
  cwd: string;
  profile: CapabilityProfile;
  candidates: readonly ModelCandidate[];
  toolAccess?: CliToolAccess;
  allowedTools?: string[];
  conversationId?: string;
  continuationPrompt?: string;
  timeoutMs?: number;
  onText?: (text: string) => void;
};

// Keep adapters alive for the lifetime of the TUI process. Besides avoiding
// repeated setup, this lets adapters which support resumable sessions reuse
// their provider-side conversation on subsequent direct-chat turns.
const router = new ModelRouter([
  new CodexCliAdapter(),
  new ClaudeCliAdapter(),
  new OpenCodeCliAdapter(),
]);

export async function runAssistant(request: AssistantRequest): Promise<ChatRoutingResult> {
  const result = await router.chatCandidates(request.profile, request.candidates, {
    cwd: request.cwd,
    timeoutMs: request.timeoutMs ?? 3 * 60_000,
    prompt: request.prompt,
    toolAccess: request.toolAccess ?? "none",
    allowedTools: request.allowedTools,
    conversationId: request.conversationId,
    continuationPrompt: request.continuationPrompt,
    onText: request.onText,
  });
  await recordRoutingUsage(request.cwd, request.profile, result).catch(() => undefined);
  return result;
}

export async function answerQuestion(
  question: string,
  cwd: string,
  history: ChatTurn[],
  candidates: readonly ModelCandidate[],
  options: { conversationId?: string; onText?: (text: string) => void } = {},
): Promise<ChatRoutingResult> {
  return runAssistant({
    profile: "conversation",
    candidates,
    cwd,
    prompt: buildChatPrompt(question, history),
    continuationPrompt: buildContinuationPrompt(question),
    conversationId: options.conversationId,
    onText: options.onText,
  });
}

export function buildContinuationPrompt(question: string): string {
  return [
    "Answer this next user message directly and concisely. Do not use tools or claim to have changed anything.",
    `User: ${question}`,
    "CadenceAI:",
  ].join("\n\n");
}

export function buildChatPrompt(question: string, history: ChatTurn[]): string {
  const previous = history
    .slice(-10, -1)
    .map((turn) => `${turn.role === "you" ? "User" : "CadenceAI"}: ${turn.text}`)
    .join("\n\n");
  return [
    "You are CadenceAI in conversation mode, a concise and practical assistant for software developers.",
    "Answer the user's question directly. Do not inspect files, invoke tools, design an execution pipeline, or claim that you changed anything.",
    "If the user asks whether a change is possible, explain feasibility and the likely approach; do not turn it into an implementation plan unless they explicitly ask you to implement it.",
    previous ? `Recent conversation:\n${previous}` : "",
    `User: ${question}`,
    "CadenceAI:",
  ].filter(Boolean).join("\n\n");
}
