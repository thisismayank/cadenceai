import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { ClaudeCliAdapter, CodexCliAdapter, type CliDiagnostic } from "@cadenceai/agents";
import { analyzeTask, stagesFromAnalysis } from "./analyzer.ts";
import { SessionStore, eventNow, type SessionEvent, type StageStatus } from "./session.ts";

type ChatMessage = { role: "you" | "cadence"; text: string };
type StageView = {
  name: string;
  status: StageStatus;
  detail: string;
  model: string;
  logs: string[];
  expanded: boolean;
};

const initialStages: StageView[] = [
  { name: "Analyze", status: "waiting", detail: "Assess the request and choose a cadence", model: "fast_classifier", logs: [], expanded: false },
  { name: "Investigate", status: "waiting", detail: "Inspect relevant code paths", model: "balanced_reasoner", logs: [], expanded: false },
  { name: "Design tests", status: "waiting", detail: "Write the executable contract first", model: "flagship_reasoner", logs: [], expanded: false },
  { name: "Implement", status: "waiting", detail: "Change production code against the contract", model: "flagship_coder", logs: [], expanded: false },
  { name: "Verify", status: "waiting", detail: "Run deterministic checks", model: "shell", logs: [], expanded: false },
  { name: "Adversarial", status: "waiting", detail: "Challenge the verified candidate", model: "flagship_reasoner", logs: [], expanded: false },
  { name: "Human review", status: "waiting", detail: "Review evidence and accept or revise", model: "human", logs: [], expanded: false },
];

export function App({ cwd, continueLatest = false }: { cwd: string; continueLatest?: boolean }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout.rows || 32;
  const columns = stdout.columns || 110;
  const compact = columns < 90;
  const storeRef = useRef<SessionStore | null>(null);
  const [sessionId, setSessionId] = useState("starting");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "cadence", text: "Tell me what you want to understand or change. I’ll design the execution cadence before any code is modified." },
  ]);
  const [stages, setStages] = useState<StageView[]>(initialStages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stageFocus, setStageFocus] = useState(false);
  const [selectedStage, setSelectedStage] = useState(0);
  const [notice, setNotice] = useState("Initializing local session…");

  useEffect(() => {
    void (async () => {
      const resumed = continueLatest ? await SessionStore.resumeLatest(cwd) : null;
      const store = resumed ?? await SessionStore.create(cwd);
      storeRef.current = store;
      setSessionId(store.sessionId.slice(-8));
      if (resumed) {
        const events = await resumed.read();
        restoreEvents(events, setMessages, setStages);
        setNotice(`Resumed ${store.sessionId.slice(-8)}`);
      } else {
        setNotice("Ready · messages persist in .cadence/sessions");
      }
    })();
  }, [continueLatest, cwd]);

  useInput((value, key) => {
    if (key.ctrl && value === "l") {
      setStageFocus((current) => !current);
      return;
    }
    if (!stageFocus) return;
    if (key.escape) setStageFocus(false);
    if (key.upArrow) setSelectedStage((current) => Math.max(0, current - 1));
    if (key.downArrow) setSelectedStage((current) => Math.min(stages.length - 1, current + 1));
    if (key.return) {
      setStages((current) => current.map((stage, index) => index === selectedStage ? { ...stage, expanded: !stage.expanded } : stage));
    }
  });

  const addMessage = async (message: ChatMessage) => {
    setMessages((current) => [...current, message]);
    const event = eventNow(message.role === "you"
      ? { type: "user_message" as const, text: message.text }
      : { type: "assistant_message" as const, text: message.text });
    await storeRef.current?.append(event);
  };

  const changeStage = async (name: string, status: StageStatus, detail?: string, model?: string) => {
    setStages((current) => current.map((stage) => stage.name === name
      ? { ...stage, status, detail: detail ?? stage.detail, model: model ?? stage.model }
      : stage));
    await storeRef.current?.append(eventNow({ type: "stage_changed", stage: name, status, detail, model }));
  };

  const runDoctor = async () => {
    setBusy(true);
    setNotice("Checking installed agent CLIs…");
    const diagnostics = await Promise.all([new CodexCliAdapter().diagnose(), new ClaudeCliAdapter().diagnose()]);
    for (const diagnostic of diagnostics) {
      await storeRef.current?.append(eventNow({ type: "diagnostic", cli: diagnostic.command, ...diagnostic }));
    }
    await addMessage({ role: "cadence", text: formatDiagnostics(diagnostics) });
    setNotice("Doctor complete");
    setBusy(false);
  };

  const runAnalysis = async (task: string) => {
    setBusy(true);
    await changeStage("Analyze", "running");
    setNotice("Analyzer running through the local CLI router…");
    try {
      const result = await analyzeTask(task, cwd, {
        onStream: (event) => {
          const lines = event.data.split("\n").filter(Boolean).slice(-3);
          setStages((current) => current.map((stage) => stage.name === "Analyze"
            ? { ...stage, logs: [...stage.logs, ...lines].slice(-30) }
            : stage));
          void storeRef.current?.append(eventNow({ type: "agent_stream", stage: "Analyze", stream: event.stream, data: event.data }));
        },
      });
      const planned = stagesFromAnalysis(result);
      setStages(planned.map((stage, index) => ({
        ...stage,
        status: index === 0 ? "complete" : "waiting",
        logs: index === 0 ? [`${result.cli}/${result.model}`, result.summary] : [],
        expanded: false,
      })));
      await changeStage("Analyze", "complete", result.summary, `${result.cli} · ${result.model}`);
      await addMessage({
        role: "cadence",
        text: `${result.summary}\n\nI created a ${planned.length}-stage test-first cadence. Press Ctrl+L to inspect it; Enter expands the selected stage.`,
      });
      setNotice(`Plan ready · ${result.cli}/${result.model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await changeStage("Analyze", "failed", message);
      await storeRef.current?.append(eventNow({ type: "error", message }));
      await addMessage({ role: "cadence", text: `I could not complete the analysis. ${message}` });
      setNotice("Analyzer failed · use /doctor to inspect CLI authentication");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    setInput("");
    if (text === "/exit" || text === "/quit") {
      exit();
      return;
    }
    if (text === "/doctor") {
      await addMessage({ role: "you", text });
      await runDoctor();
      return;
    }
    if (text === "/stages") {
      setStageFocus(true);
      setNotice("Stage navigator focused · ↑/↓ select · Enter expand · Esc return");
      return;
    }
    await addMessage({ role: "you", text });
    if (busy) {
      await addMessage({ role: "cadence", text: "I recorded that instruction in this session. Steering active subprocesses will be connected in the execution slice." });
      return;
    }
    const hasTask = stages.some((stage) => stage.status !== "waiting");
    if (hasTask) {
      await addMessage({ role: "cadence", text: "I added that as a follow-up requirement. Start a fresh analysis with /new once execution orchestration is connected." });
      return;
    }
    await runAnalysis(text);
  };

  const visibleMessages = useMemo(() => messages.slice(-(compact ? 5 : 8)), [compact, messages]);
  const showWelcome = messages.length === 1 && stages.every((stage) => stage.status === "waiting");

  if (showWelcome) {
    return (
      <Box flexDirection="column" height={Math.max(20, rows - 1)}>
        <Box paddingX={1} justifyContent="space-between">
          <Text bold color="blue">cadenceai</Text>
          <Text dimColor>{shortPath(cwd)} · session {sessionId}</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
          <Box flexDirection="column" alignItems="center" marginBottom={2}>
            <Text bold color="cyan">   ╭──────────────────────╮</Text>
            <Text bold color="cyan">   │   C A D E N C E A I  │</Text>
            <Text bold color="blue">   ╰──────────────────────╯</Text>
            <Text dimColor>coordinate · test · verify</Text>
          </Box>
          <Box
            width={Math.min(76, Math.max(44, columns - 8))}
            borderStyle="round"
            borderColor="blue"
            flexDirection="column"
            paddingX={2}
            paddingY={1}
          >
            <Box>
              <Text color="cyan">› </Text>
              <TextInput
                value={input}
                onChange={setInput}
                onSubmit={(value) => void submit(value)}
                placeholder="Ask a question or describe what you want to build…"
              />
            </Box>
            <Box marginTop={1} justifyContent="space-between">
              <Text><Text color="cyan">adaptive</Text><Text dimColor> · test-first · local</Text></Text>
              <Text dimColor>Codex + Claude</Text>
            </Box>
          </Box>
          <Box marginTop={1} width={Math.min(76, Math.max(44, columns - 8))} justifyContent="flex-end">
            <Text><Text>ctrl+l</Text><Text dimColor> stages   </Text><Text> /doctor</Text><Text dimColor> runtimes</Text></Text>
          </Box>
          <Box marginTop={3}>
            <Text color="yellow">● Tip </Text>
            <Text dimColor>Start with “explain this repository” or describe a change.</Text>
          </Box>
        </Box>
        <Box paddingX={1} justifyContent="space-between">
          <Text dimColor>{notice}</Text>
          <Text dimColor>session data stays in .cadence/</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={Math.max(20, rows - 1)}>
      <Box borderStyle="round" borderColor="blue" paddingX={1} justifyContent="space-between">
        <Text bold color="blue">cadenceai</Text>
        <Text dimColor>{shortPath(cwd)} · session {sessionId}</Text>
      </Box>

      <Box flexGrow={1} flexDirection={compact ? "column" : "row"}>
        <Box flexDirection="column" flexGrow={1} paddingX={1} paddingTop={1}>
          <Box flexDirection="column" flexGrow={1}>
            {visibleMessages.map((message, index) => (
              <Box key={`${message.role}-${index}`} flexDirection="column" marginBottom={1}>
                <Text bold color={message.role === "you" ? "cyan" : "green"}>{message.role === "you" ? "You" : "CadenceAI"}</Text>
                {message.text.split("\n").map((line, lineIndex) => <Text key={lineIndex}>{line || " "}</Text>)}
              </Box>
            ))}
            {busy && <Text color="yellow">● working…</Text>}
          </Box>
        </Box>

        <Box
          width={compact ? undefined : 42}
          height={compact ? Math.min(12, stages.length + 3) : undefined}
          borderStyle="single"
          borderColor={stageFocus ? "cyan" : "gray"}
          flexDirection="column"
          paddingX={1}
        >
          <Text bold>CADENCE <Text dimColor>({stages.filter((stage) => stage.status === "complete").length}/{stages.length})</Text></Text>
          {stages.map((stage, index) => (
            <Box key={`${stage.name}-${index}`} flexDirection="column">
              <Text inverse={stageFocus && selectedStage === index}>
                <Text color={statusColor(stage.status)}>{statusIcon(stage.status)}</Text>{" "}
                {stage.name} <Text dimColor>· {stage.model}</Text>
              </Text>
              {stage.expanded && (
                <Box paddingLeft={2} flexDirection="column">
                  <Text dimColor>{stage.detail}</Text>
                  {stage.logs.slice(-4).map((log, logIndex) => <Text key={logIndex} color="gray">{cleanLog(log)}</Text>)}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      <Box borderStyle="round" borderColor={stageFocus ? "gray" : "cyan"} paddingX={1}>
        <Text color="cyan">› </Text>
        <TextInput value={input} onChange={setInput} onSubmit={(value) => void submit(value)} focus={!stageFocus} placeholder={busy ? "Steer the run or ask a question…" : "Describe a task, or type /doctor"} />
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>{notice}</Text>
        <Text dimColor>Ctrl+L stages · /doctor · /exit</Text>
      </Box>
    </Box>
  );
}

function restoreEvents(
  events: SessionEvent[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setStages: React.Dispatch<React.SetStateAction<StageView[]>>,
) {
  const restoredMessages = events.flatMap<ChatMessage>((event) => {
    if (event.type === "user_message") return [{ role: "you", text: event.text }];
    if (event.type === "assistant_message") return [{ role: "cadence", text: event.text }];
    return [];
  });
  if (restoredMessages.length) setMessages(restoredMessages);
  const changes = events.filter((event): event is Extract<SessionEvent, { type: "stage_changed" }> => event.type === "stage_changed");
  setStages((current) => current.map((stage) => {
    const latest = changes.filter((event) => event.stage === stage.name).at(-1);
    return latest ? { ...stage, status: latest.status, detail: latest.detail ?? stage.detail, model: latest.model ?? stage.model } : stage;
  }));
}

function formatDiagnostics(diagnostics: CliDiagnostic[]): string {
  return diagnostics.map((item) => {
    const icon = item.installed && item.authenticated ? "✓" : "✗";
    const state = !item.installed ? "not installed" : item.authenticated ? "authenticated" : "login required";
    return `${icon} ${item.command} ${item.version ?? ""} — ${state}${item.detail ? `\n  ${item.detail}` : ""}`;
  }).join("\n");
}

function statusIcon(status: StageStatus) {
  return status === "complete" ? "✓" : status === "running" ? "●" : status === "failed" ? "✗" : "○";
}

function statusColor(status: StageStatus) {
  return status === "complete" ? "green" : status === "running" ? "yellow" : status === "failed" ? "red" : "gray";
}

function shortPath(path: string) {
  const parts = path.split("/");
  return parts.slice(-2).join("/");
}

function cleanLog(log: string) {
  const singleLine = log.replace(/\s+/g, " ").trim();
  return singleLine.length > 80 ? `${singleLine.slice(0, 77)}…` : singleLine;
}
