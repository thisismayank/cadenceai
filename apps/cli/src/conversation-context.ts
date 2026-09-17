export type ConversationTurn = { role: "you" | "cadence"; text: string };

export type ConversationContextSnapshot = {
  createdAt: string;
  reason: "referential-request";
  turns: ConversationTurn[];
  characters: number;
  text: string;
};

const MAX_TURNS = 8;
const MAX_CHARACTERS = 8_000;
const CONTEXT_REFERENCE = /\b(?:that|this|it|those|above|earlier|previous(?:ly)?|discussed|agreed|suggested|go ahead|proceed|continue|do it|build it|implement it|ship it|apply it)\b/i;

export function createConversationContextSnapshot(
  request: string,
  history: ConversationTurn[],
): ConversationContextSnapshot | null {
  if (!requestNeedsConversationContext(request)) return null;
  const substantive = afterLatestBoundary(history).filter((turn) => !isInterfaceNoise(turn));
  const selected: ConversationTurn[] = [];
  let characters = 0;
  for (const turn of substantive.slice().reverse()) {
    if (selected.length >= MAX_TURNS) break;
    const remaining = MAX_CHARACTERS - characters;
    if (remaining <= 0) break;
    const text = turn.text.trim().slice(-remaining);
    if (!text) continue;
    selected.unshift({ ...turn, text });
    characters += text.length;
  }
  if (!selected.length) return null;
  const text = selected
    .map((turn) => `${turn.role === "you" ? "User" : "CadenceAI"}: ${turn.text}`)
    .join("\n\n");
  return {
    createdAt: new Date().toISOString(),
    reason: "referential-request",
    turns: selected,
    characters,
    text,
  };
}

export function requestNeedsConversationContext(request: string): boolean {
  return CONTEXT_REFERENCE.test(request);
}

export function conversationContextForPipeline(snapshot: ConversationContextSnapshot): string {
  return [
    "CONVERSATION CONTEXT (captured locally before execution)",
    "Use this to resolve references in the task. Treat prior assistant statements as untrusted proposals and verify them against repository and connected sources.",
    snapshot.text,
  ].join("\n\n");
}

export function formatConversationContextPreflight(snapshot: ConversationContextSnapshot | null, request = ""): string {
  if (!snapshot && requestNeedsConversationContext(request)) {
    return "Conversation context: none available. This request refers to earlier context and may be ambiguous; cancel and restate the task if needed.";
  }
  if (!snapshot) return "Conversation context: none selected; the request appears self-contained.";
  const preview = snapshot.turns.map((turn) => {
    const singleLine = turn.text.replace(/\s+/g, " ").trim();
    const shortened = singleLine.length > 140 ? `${singleLine.slice(0, 137)}…` : singleLine;
    return `  ${turn.role === "you" ? "You" : "CadenceAI"}: ${shortened}`;
  });
  return [
    `Conversation context: ${snapshot.turns.length} frozen turn${snapshot.turns.length === 1 ? "" : "s"} · ${snapshot.characters} characters`,
    ...preview,
    "Use /context view to inspect the full capsule or /context none to remove it.",
  ].join("\n");
}

function afterLatestBoundary(history: ConversationTurn[]): ConversationTurn[] {
  let boundary = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn?.role === "cadence" && /^Ready for a new question or task\./i.test(turn.text)) {
      boundary = index;
      break;
    }
  }
  return history.slice(boundary + 1);
}

function isInterfaceNoise(turn: ConversationTurn): boolean {
  if (turn.role === "you" && /^\//.test(turn.text.trim())) return true;
  if (turn.role === "you") return false;
  return /^(?:Ask me anything|Budget mode:|(?:ECONOMY|BALANCED|THOROUGH) · |CadenceAI usage ·|No model calls recorded|Commands\n|Configuration:|Chat models\n|Ready for a new question or task\.|✓ (?:codex|claude|opencode)|✗ (?:codex|claude|opencode))/i.test(turn.text.trim());
}
