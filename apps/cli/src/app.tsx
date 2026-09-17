import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import {
  getProviderCooldowns,
} from "@cadenceai/agents";
import { analyzeTask } from "./analyzer.ts";
import {
  formatExecutionPreflight,
  formatQaPreflight,
  formatReviewPreflight,
  formatWorkflowPreflight,
  modelCallLimitViolation,
  planEngineeringExecution,
  planQaExecution,
  planReviewExecution,
  planWorkflowExecution,
  type BudgetMode,
} from "./budget.ts";
import { answerQuestion } from "./chat.ts";
import { formatUpdateGuidance, QUICKSTART } from "./commands.ts";
import {
  DEFAULT_CONFIG,
  initializeProjectConfig,
  loadCadenceConfig,
  resolveChatCandidates,
  qaStages,
  reviewStages,
  workflowStages,
  type CadenceConfig,
  type PipelineStageConfig,
  type ReadOnlyWorkflowKind,
} from "./config.ts";
import { connectedCandidateOrder, contextForPipeline, resolveConnectedContext } from "./context.ts";
import {
  conversationContextForPipeline,
  createConversationContextSnapshot,
  formatConversationContextPreflight,
  type ConversationContextSnapshot,
} from "./conversation-context.ts";
import { runEngineeringPipeline } from "./engineering.ts";
import { diagnoseRuntimes, formatActionableDiagnostics } from "./doctor.ts";
import { formatGitChanges, formatGitSafetyBlock, inspectGitWorktree } from "./git-safety.ts";
import { handoffSessionContext, saveHandoff } from "./handoff.ts";
import { type InteractionMode } from "./intent.ts";
import { qualityAssureTicket } from "./qa.ts";
import { reviewPullRequest } from "./review.ts";
import { formatFailureRecovery } from "./recovery.ts";
import { SessionStore, eventNow, type SessionEvent, type StageStatus } from "./session.ts";
import { createTaskEnvelope, type RiskLevel, type TaskEnvelope, type TaskIntent } from "./task.ts";
import { readUsageSummary } from "./usage.ts";
import { runReadOnlyWorkflow, workflowLabel } from "./workflow.ts";

type ChatMessage = { role: "you" | "cadence"; text: string };
type RetryRequest =
  | { kind: "chat"; question: string; history: ChatMessage[] }
  | { kind: "explore"; envelope: TaskEnvelope }
  | { kind: "engineering"; envelope: TaskEnvelope; mode: BudgetMode; context: ConversationContextSnapshot | null }
  | { kind: "review"; envelope: TaskEnvelope }
  | { kind: "qa"; envelope: TaskEnvelope }
  | { kind: "workflow"; workflow: ReadOnlyWorkflowKind; envelope: TaskEnvelope; seedContext?: string };
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
    { role: "cadence", text: "Ask me anything, or describe something you want to build. I’ll use conversation for questions and activate the engineering pipeline for implementation work." },
  ]);
  const [stages, setStages] = useState<StageView[]>(initialStages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stageFocus, setStageFocus] = useState(false);
  const [selectedStage, setSelectedStage] = useState(0);
  const [notice, setNotice] = useState("Initializing local session…");
  const [mode, setMode] = useState<InteractionMode>("auto");
  const [lastRoute, setLastRoute] = useState<TaskIntent>("chat");
  const [activeModel, setActiveModel] = useState("auto-select");
  const [modelSelection, setModelSelection] = useState("auto");
  const [config, setConfig] = useState<CadenceConfig>(DEFAULT_CONFIG);
  const [configPaths, setConfigPaths] = useState<string[]>([]);
  const [activeRisk, setActiveRisk] = useState<RiskLevel | null>(null);
  const [activeContext, setActiveContext] = useState("none");
  const [activePipelineKind, setActivePipelineKind] = useState<Exclude<TaskIntent, "chat" | "explore">>("engineering");
  const [activePath, setActivePath] = useState("Chat → auto-select");
  const [draftResponse, setDraftResponse] = useState("");
  const [budgetMode, setBudgetMode] = useState<BudgetMode>(DEFAULT_CONFIG.budget.defaultMode);
  const [pendingEngineering, setPendingEngineering] = useState<{
    envelope: TaskEnvelope;
    mode: BudgetMode;
    context: ConversationContextSnapshot | null;
  } | null>(null);
  const [pendingReview, setPendingReview] = useState<TaskEnvelope | null>(null);
  const [pendingQa, setPendingQa] = useState<TaskEnvelope | null>(null);
  const [pendingWorkflow, setPendingWorkflow] = useState<{
    kind: ReadOnlyWorkflowKind;
    envelope: TaskEnvelope;
    seedContext?: string;
  } | null>(null);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await loadCadenceConfig(cwd);
        setConfig(loaded.config);
        setConfigPaths(loaded.loadedPaths);
        setModelSelection(loaded.config.chat.defaultModel);
        setBudgetMode(loaded.config.budget.defaultMode);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
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
    try {
      const diagnostics = await diagnoseRuntimes();
      for (const diagnostic of diagnostics) {
        await storeRef.current?.append(eventNow({ type: "diagnostic", cli: diagnostic.command, ...diagnostic }));
      }
      await addMessage({ role: "cadence", text: formatActionableDiagnostics(diagnostics) });
      setNotice("Doctor complete");
    } finally {
      setBusy(false);
    }
  };

  const prepareEngineering = async (
    envelope: TaskEnvelope,
    selectedBudget = budgetMode,
    context: ConversationContextSnapshot | null = null,
  ) => {
    const gitState = await inspectGitWorktree(cwd).catch(() => null);
    if (!gitState) {
      setPendingEngineering(null);
      setRetryRequest({ kind: "engineering", envelope, mode: selectedBudget, context });
      setLastRoute("engineering");
      setActiveRisk(envelope.risk);
      setActivePath("Engineering → blocked by Git safety");
      setNotice("Engineering blocked · Git status unavailable");
      await addMessage({
        role: "cadence",
        text: "Engineering requires a verifiable clean Git working tree, but CadenceAI could not read its status. Check that Git is installed and the repository is accessible, then try again.",
      });
      return;
    }
    if (!gitState.clean) {
      setPendingEngineering(null);
      setRetryRequest({ kind: "engineering", envelope, mode: selectedBudget, context });
      setLastRoute("engineering");
      setActiveRisk(envelope.risk);
      setActivePath("Engineering → blocked by Git safety");
      setNotice("Engineering blocked · clean Git working tree required");
      await addMessage({ role: "cadence", text: formatGitSafetyBlock(gitState) });
      return;
    }
    const plan = planEngineeringExecution(envelope, config, selectedBudget);
    const limitError = modelCallLimitViolation(plan.totalModelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setPendingEngineering(null);
      setRetryRequest({ kind: "engineering", envelope, mode: selectedBudget, context });
      setLastRoute("engineering");
      setActiveRisk(envelope.risk);
      setActivePath("Engineering → blocked by call limit");
      setNotice("Engineering blocked · per-task call limit");
      await addMessage({ role: "cadence", text: limitError });
      return;
    }
    setPendingEngineering({ envelope, mode: selectedBudget, context });
    setLastRoute("engineering");
    setActivePipelineKind("engineering");
    setActiveRisk(envelope.risk);
    setStages(stageViews(plan.stages));
    setActivePath(`Preflight → ${selectedBudget} → ${envelope.risk}-risk · ${plan.totalModelCalls} calls`);
    setNotice("Preflight ready · press Enter to continue · /cancel to stop");
    await addMessage({
      role: "cadence",
      text: `${formatExecutionPreflight(plan, config.guardrails.maxModelCallsPerTask)}\n\n${formatConversationContextPreflight(context, envelope.request)}`,
    });
  };

  const runEngineering = async (
    envelope: TaskEnvelope,
    selectedBudget = budgetMode,
    context: ConversationContextSnapshot | null = null,
  ) => {
    const gitState = await inspectGitWorktree(cwd).catch(() => null);
    if (!gitState) {
      setRetryRequest({ kind: "engineering", envelope, mode: selectedBudget, context });
      setNotice("Engineering blocked · Git status unavailable");
      setActivePath("Engineering → blocked by Git safety");
      await addMessage({
        role: "cadence",
        text: "The Git safety check could not confirm a clean working tree, so CadenceAI stopped before invoking a model or modifying files.",
      });
      return;
    }
    if (!gitState.clean) {
      setRetryRequest({ kind: "engineering", envelope, mode: selectedBudget, context });
      setNotice("Engineering blocked · working tree changed after preflight");
      setActivePath("Engineering → blocked by Git safety");
      await addMessage({ role: "cadence", text: formatGitSafetyBlock(gitState) });
      return;
    }
    const plan = planEngineeringExecution(envelope, config, selectedBudget);
    const limitError = modelCallLimitViolation(plan.totalModelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setRetryRequest({ kind: "engineering", envelope, mode: selectedBudget, context });
      setNotice("Engineering blocked · per-task call limit changed after preflight");
      setActivePath("Engineering → blocked by call limit");
      await addMessage({ role: "cadence", text: limitError });
      return;
    }
    setLastRoute("engineering");
    setActivePipelineKind("engineering");
    setActiveRisk(envelope.risk);
    setBusy(true);
    const definitions = plan.stages;
    setStages(stageViews(definitions));
    const analyzeDefinition = config.pipelines.engineering.stages.analyze;
    const analyzeStage = analyzeDefinition?.name ?? "Analyze";
    let failureStage = definitions[0]?.name ?? "Engineering";
    setNotice(`Engineering · ${envelope.risk} risk · preparing context…`);
    setActivePath(`Engineering → ${selectedBudget} → ${envelope.risk}-risk cadence`);
    try {
      let analyzerTask = context
        ? `${envelope.request}\n\n${conversationContextForPipeline(context)}`
        : envelope.request;
      if (envelope.needsConnectedTools) {
        const candidate = connectedCandidateOrder(envelope, config)[0];
        if (candidate) setActivePath(`Connected → ${candidate.cli}/${candidate.model} → ${connectedTarget(envelope)} → engineering`);
        const context = await resolveConnectedContext(envelope, cwd, config);
        setActivePath(`Connected → ${context.runner}/${context.model} → ${connectedTarget(envelope)} → engineering`);
        setActiveContext(context.sources.map((source) => source.reference).join(", "));
        await addMessage({
          role: "cadence",
          text: `Connected context via ${context.runner}/${context.model}:\n\n${context.content}\n\nI’m using this source-grounded context for the ${envelope.risk}-risk engineering cadence.`,
        });
        analyzerTask = `${analyzerTask}\n\n${contextForPipeline(context)}`;
      } else {
        setActiveContext("repository");
      }
      let analysis = `Local classification: ${envelope.risk}-risk ${envelope.intent} request using ${selectedBudget} budget mode.`;
      if (plan.stageIds.includes("analyze")) {
        failureStage = analyzeStage;
        await changeStage(analyzeStage, "running", `Risk: ${envelope.risk} · assessing requirements and execution shape`);
        setNotice("Analyzer running through the configured model policy…");
        setActivePath(`Engineering → analyze → ${envelope.risk}-risk cadence`);
        const result = await analyzeTask(analyzerTask, cwd, {
          onStream: (event) => {
            const lines = event.data.split("\n").filter(Boolean).slice(-3);
            setStages((current) => current.map((stage) => stage.name === analyzeStage
              ? { ...stage, logs: [...stage.logs, ...lines].slice(-30) }
              : stage));
          },
        }, config.profiles);
        analysis = result.summary;
        await changeStage(analyzeStage, "complete", result.summary, `${result.cli} · ${result.model}`);
        await addMessage({
          role: "cadence",
          text: `${result.summary}\n\nRisk assessment: ${envelope.risk}. I selected the ${selectedBudget} ${definitions.length}-stage engineering cadence and am continuing now. Press Ctrl+L to inspect progress.`,
        });
      } else {
        await addMessage({
          role: "cadence",
          text: `${analysis}\n\nThe analyzer model call was skipped. The implementer will receive the task, connected context, and responsibility for the test-first contract.`,
        });
      }
      setNotice(`Executing ${envelope.risk}-risk engineering cadence…`);
      setActivePath(`Engineering → ${selectedBudget} → ${envelope.risk}-risk cadence → executing`);
      const execution = await runEngineeringPipeline(
        analyzerTask,
        analysis,
        envelope.risk,
        cwd,
        config,
        (update) => {
          if (update.status === "running") failureStage = update.stage.name;
          void changeStage(update.stage.name, update.status, update.detail, update.model);
          if (update.logs?.length) {
            setStages((current) => current.map((stage) => stage.name === update.stage.name
              ? { ...stage, logs: [...stage.logs, ...update.logs!].slice(-30) }
              : stage));
          }
        },
        undefined,
        plan.stageIds,
      );
      const finalModel = execution.stages.filter((stage) => stage.model !== "shell").at(-1)?.model;
      if (finalModel) setActiveModel(finalModel);
      const humanStage = definitions.find((stage) => stage.modelProfile === "human");
      if (humanStage) await changeStage(humanStage.name, "waiting", execution.summary, "human");
      const finalGitState = await inspectGitWorktree(cwd).catch(() => null);
      const changeReport = finalGitState
        ? formatGitChanges(finalGitState)
        : "Changed files could not be determined because Git status was unavailable after execution.";
      await addMessage({ role: "cadence", text: `${execution.summary}\n\n${changeReport}` });
      setRetryRequest(null);
      setNotice("Engineering cadence complete · awaiting human review");
      setActivePath(`Engineering → ${selectedBudget} → ${envelope.risk}-risk cadence → human review`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalGitState = await inspectGitWorktree(cwd).catch(() => null);
      await changeStage(failureStage, "failed", message);
      await storeRef.current?.append(eventNow({ type: "error", message }));
      setRetryRequest({ kind: "engineering", envelope, mode: selectedBudget, context });
      await addMessage({
        role: "cadence",
        text: `I could not complete the engineering cadence. ${message}${finalGitState ? `\n\n${formatGitChanges(finalGitState)}` : ""}\n${formatFailureRecovery(message, getProviderCooldowns())}`,
      });
      setNotice("Engineering preparation failed · use /doctor to inspect runtimes and connections");
    } finally {
      setBusy(false);
    }
  };

  const runChat = async (question: string, history: ChatMessage[]) => {
    setBusy(true);
    setLastRoute("chat");
    setDraftResponse("");
    try {
      const candidates = resolveChatCandidates(config, modelSelection);
      const candidate = candidates[0];
      if (candidate) {
        setActiveModel(`${candidate.cli} · ${candidate.model}`);
        setActivePath(`Chat → ${candidate.cli}/${candidate.model}`);
        setNotice(`Chat · ${candidate.cli}/${candidate.model} · starting…`);
      }
      const result = await answerQuestion(question, cwd, history, candidates, {
        conversationId: storeRef.current?.sessionId ?? `${cwd}:${sessionId}`,
        onText: (text) => setDraftResponse((current) => current + text),
      });
      setActiveModel(`${result.cli} · ${result.model}`);
      setActiveContext("none");
      setActivePath(`Chat → ${result.cli}/${result.model}${result.fallbackUsed ? " → fallback" : ""}`);
      setDraftResponse("");
      await addMessage({ role: "cadence", text: result.text });
      setRetryRequest(null);
      setNotice(`Chat · ${result.cli}/${result.model}${result.fallbackUsed ? " · fallback" : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await storeRef.current?.append(eventNow({ type: "error", message }));
      setRetryRequest({ kind: "chat", question, history });
      await addMessage({ role: "cadence", text: `I could not answer through the local model CLIs. ${message}\n${formatFailureRecovery(message, getProviderCooldowns())}` });
      setNotice("Chat failed · use /doctor to inspect CLI authentication");
    } finally {
      setDraftResponse("");
      setBusy(false);
    }
  };

  const runExplore = async (envelope: TaskEnvelope) => {
    setBusy(true);
    setLastRoute("explore");
    setActiveRisk(null);
    const candidate = connectedCandidateOrder(envelope, config)[0];
    if (candidate) {
      setActiveModel(`${candidate.cli} · ${candidate.model}`);
      setActivePath(`Connected → ${candidate.cli}/${candidate.model} → ${connectedTarget(envelope)}`);
      setNotice(`Connected · ${candidate.cli}/${candidate.model} · ${connectedTarget(envelope)} · read-only`);
    }
    try {
      const context = await resolveConnectedContext(envelope, cwd, config);
      setActiveModel(`${context.runner} · ${context.model}`);
      setActiveContext(context.sources.map((source) => source.reference).join(", "));
      setActivePath(`Connected → ${context.runner}/${context.model} → ${connectedTarget(envelope)}`);
      await addMessage({ role: "cadence", text: context.content });
      setRetryRequest(null);
      setNotice(`Connected · ${context.runner}/${context.model} · ${context.sources.length} source${context.sources.length === 1 ? "" : "s"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await storeRef.current?.append(eventNow({ type: "error", message }));
      setRetryRequest({ kind: "explore", envelope });
      await addMessage({ role: "cadence", text: `I could not resolve the connected context. ${message}\n${formatFailureRecovery(message, getProviderCooldowns())}` });
      setNotice("Connected exploration failed · verify the MCP connection with the underlying CLI");
    } finally {
      setBusy(false);
    }
  };

  const runReview = async (envelope: TaskEnvelope) => {
    const plan = planReviewExecution(config);
    const limitError = modelCallLimitViolation(plan.modelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setPendingReview(null);
      setRetryRequest({ kind: "review", envelope });
      setNotice("Review blocked · per-task call limit changed after preflight");
      setActivePath("Review → blocked by call limit");
      await addMessage({ role: "cadence", text: limitError });
      return;
    }
    setPendingReview(null);
    setBusy(true);
    setLastRoute("review");
    setActivePipelineKind("review");
    setActiveRisk(null);
    setActiveContext(envelope.pullRequests.join(", ") || "repository diff");
    setStages(stageViews(reviewStages(config)));
    setActivePath(`Review → ${envelope.pullRequests.join(", ") || "working tree"}`);
    setNotice("Pull-request review · collecting independent evidence…");
    try {
      const result = await reviewPullRequest(envelope.request, cwd, config, (update) => {
        void changeStage(update.stage.name, update.status, update.detail, update.model);
      });
      await addMessage({ role: "cadence", text: result.report });
      const latest = result.runs.at(-1);
      if (latest) setActiveModel(`${latest.cli} · ${latest.model}`);
      setRetryRequest(null);
      setNotice(`Review ready · ${result.runs.length} model stages · awaiting human review`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await storeRef.current?.append(eventNow({ type: "error", message }));
      setRetryRequest({ kind: "review", envelope });
      await addMessage({ role: "cadence", text: `I could not complete the pull-request review. ${message}\n${formatFailureRecovery(message, getProviderCooldowns())}` });
      setNotice("Review failed · use /doctor to inspect runtimes and connections");
    } finally {
      setBusy(false);
    }
  };

  const prepareReview = async (envelope: TaskEnvelope) => {
    const plan = planReviewExecution(config);
    const target = envelope.pullRequests.join(", ") || "working-tree diff";
    const limitError = modelCallLimitViolation(plan.modelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setPendingReview(null);
      setRetryRequest({ kind: "review", envelope });
      setLastRoute("review");
      setActivePipelineKind("review");
      setActivePath("Review → blocked by call limit");
      setNotice("Review blocked · per-task call limit");
      await addMessage({ role: "cadence", text: `${limitError}\n\nPR reviews stay thorough; raising the limit is the only way to run this configured review.` });
      return;
    }
    setPendingReview(envelope);
    setLastRoute("review");
    setActivePipelineKind("review");
    setActiveRisk(null);
    setActiveContext(target);
    setStages(stageViews(plan.stages));
    setActivePath(`Review preflight → thorough → ${plan.modelCalls} calls`);
    setNotice("Review preflight ready · press Enter to continue · /cancel to stop");
    await addMessage({ role: "cadence", text: formatReviewPreflight(plan, target, config.guardrails.maxModelCallsPerTask) });
  };

  const runQa = async (envelope: TaskEnvelope) => {
    const plan = planQaExecution(config);
    const limitError = modelCallLimitViolation(plan.modelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setPendingQa(null);
      setRetryRequest({ kind: "qa", envelope });
      setNotice("QA blocked · per-task call limit changed after preflight");
      setActivePath("QA → blocked by call limit");
      await addMessage({ role: "cadence", text: limitError });
      return;
    }
    setPendingQa(null);
    setBusy(true);
    setLastRoute("qa");
    setActivePipelineKind("qa");
    setActiveRisk(null);
    setActiveContext(envelope.linearTickets.join(", "));
    setStages(stageViews(qaStages(config)));
    setActivePath(`QA → ${envelope.linearTickets.join(", ")} → collecting evidence`);
    setNotice("Ticket QA · collecting requirements, linked PRs, and CI evidence…");
    try {
      const result = await qualityAssureTicket(envelope, cwd, config, (update) => {
        void changeStage(update.stage.name, update.status, update.detail, update.model);
      });
      setActiveContext(result.context.sources.map((source) => source.reference).join(", "));
      const latest = result.runs.at(-1);
      if (latest) setActiveModel(`${latest.cli} · ${latest.model}`);
      await addMessage({
        role: "cadence",
        text: `${result.report}\n\nRead-only QA complete. No files, tickets, pull requests, or comments were changed. Say “implement the confirmed fixes” to promote this evidence into an engineering preflight.`,
      });
      setRetryRequest(null);
      setActivePath(`QA → ${envelope.linearTickets.join(", ")} → human decision`);
      setNotice(`QA report ready · ${result.runs.length} model stages · awaiting human decision`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await storeRef.current?.append(eventNow({ type: "error", message }));
      setRetryRequest({ kind: "qa", envelope });
      await addMessage({ role: "cadence", text: `I could not complete ticket QA. ${message}\n${formatFailureRecovery(message, getProviderCooldowns())}` });
      setNotice("Ticket QA failed · use /doctor to inspect runtimes and connections");
    } finally {
      setBusy(false);
    }
  };

  const prepareQa = async (envelope: TaskEnvelope) => {
    if (!envelope.linearTickets.length) {
      await addMessage({ role: "cadence", text: "Ticket QA needs a Linear ticket ID. Usage: /qa ELM-2851" });
      return;
    }
    const plan = planQaExecution(config);
    const limitError = modelCallLimitViolation(plan.modelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setPendingQa(null);
      setRetryRequest({ kind: "qa", envelope });
      setLastRoute("qa");
      setActivePipelineKind("qa");
      setActivePath("QA → blocked by call limit");
      setNotice("QA blocked · per-task call limit");
      await addMessage({ role: "cadence", text: `${limitError}\n\nTicket QA keeps independent scrutiny; raise the limit to run this configured cadence.` });
      return;
    }
    setPendingQa(envelope);
    setLastRoute("qa");
    setActivePipelineKind("qa");
    setActiveRisk(null);
    setActiveContext(envelope.linearTickets.join(", "));
    setStages(stageViews(plan.stages));
    setActivePath(`QA preflight → ${envelope.linearTickets.join(", ")} → ${plan.modelCalls} calls`);
    setNotice("QA preflight ready · press Enter to continue · /cancel to stop");
    await addMessage({ role: "cadence", text: formatQaPreflight(plan, envelope.linearTickets, config.guardrails.maxModelCallsPerTask) });
  };

  const runWorkflow = async (
    kind: ReadOnlyWorkflowKind,
    envelope: TaskEnvelope,
    seedContext?: string,
  ) => {
    const plan = planWorkflowExecution(config, kind);
    const limitError = modelCallLimitViolation(plan.modelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setPendingWorkflow(null);
      setRetryRequest({ kind: "workflow", workflow: kind, envelope, seedContext });
      setNotice(`${workflowLabel(kind)} blocked · per-task call limit changed after preflight`);
      setActivePath(`${workflowLabel(kind)} → blocked by call limit`);
      await addMessage({ role: "cadence", text: limitError });
      return;
    }
    setPendingWorkflow(null);
    setBusy(true);
    setLastRoute(kind);
    setActivePipelineKind(kind);
    setActiveRisk(null);
    setActiveContext(workflowTarget(envelope, kind));
    setStages(stageViews(workflowStages(config, kind)));
    setActivePath(`${workflowLabel(kind)} → executing read-only cadence`);
    setNotice(`${workflowLabel(kind)} · working…`);
    try {
      const result = await runReadOnlyWorkflow(kind, envelope, cwd, config, (update) => {
        void changeStage(update.stage.name, update.status, update.detail, update.model);
      }, { seedContext });
      if (result.context) setActiveContext(result.context.sources.map((source) => source.reference).join(", "));
      const latest = result.runs.at(-1);
      if (latest) setActiveModel(`${latest.cli} · ${latest.model}`);
      let artifact = "";
      if (kind === "handoff") {
        const path = await saveHandoff(cwd, result.report);
        artifact = `\n\nSaved locally to ${path}.`;
      }
      await addMessage({ role: "cadence", text: `${result.report}${artifact}\n\n${workflowCompletionNote(kind)}` });
      setRetryRequest(null);
      setActivePath(`${workflowLabel(kind)} → human decision`);
      setNotice(`${workflowLabel(kind)} ready · ${result.runs.length} model stage${result.runs.length === 1 ? "" : "s"} · awaiting human review`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await storeRef.current?.append(eventNow({ type: "error", message }));
      setRetryRequest({ kind: "workflow", workflow: kind, envelope, seedContext });
      await addMessage({ role: "cadence", text: `I could not complete ${workflowLabel(kind)}. ${message}\n${formatFailureRecovery(message, getProviderCooldowns())}` });
      setNotice(`${workflowLabel(kind)} failed · use /doctor to inspect runtimes and connections`);
    } finally {
      setBusy(false);
    }
  };

  const prepareWorkflow = async (
    kind: ReadOnlyWorkflowKind,
    envelope: TaskEnvelope,
    seedContext?: string,
  ) => {
    const plan = planWorkflowExecution(config, kind);
    const limitError = modelCallLimitViolation(plan.modelCalls, config.guardrails.maxModelCallsPerTask);
    if (limitError) {
      setPendingWorkflow(null);
      setRetryRequest({ kind: "workflow", workflow: kind, envelope, seedContext });
      setLastRoute(kind);
      setActivePipelineKind(kind);
      setActivePath(`${workflowLabel(kind)} → blocked by call limit`);
      setNotice(`${workflowLabel(kind)} blocked · per-task call limit`);
      await addMessage({ role: "cadence", text: limitError });
      return;
    }
    setPendingWorkflow({ kind, envelope, seedContext });
    setLastRoute(kind);
    setActivePipelineKind(kind);
    setActiveRisk(null);
    setActiveContext(workflowTarget(envelope, kind));
    setStages(stageViews(plan.stages));
    setActivePath(`${workflowLabel(kind)} preflight → ${plan.modelCalls} calls`);
    setNotice(`${workflowLabel(kind)} preflight ready · press Enter to continue · /cancel to stop`);
    await addMessage({
      role: "cadence",
      text: formatWorkflowPreflight(kind, plan, workflowTarget(envelope, kind), config.guardrails.maxModelCallsPerTask),
    });
  };

  const submit = async (value: string) => {
    const text = value.trim();
    setInput("");
    if (!text && pendingEngineering && !busy) {
      const pending = pendingEngineering;
      setPendingEngineering(null);
      await runEngineering(pending.envelope, pending.mode, pending.context);
      return;
    }
    if (!text && pendingReview && !busy) {
      const pending = pendingReview;
      setPendingReview(null);
      await runReview(pending);
      return;
    }
    if (!text && pendingQa && !busy) {
      const pending = pendingQa;
      setPendingQa(null);
      await runQa(pending);
      return;
    }
    if (!text && pendingWorkflow && !busy) {
      const pending = pendingWorkflow;
      setPendingWorkflow(null);
      await runWorkflow(pending.kind, pending.envelope, pending.seedContext);
      return;
    }
    if (!text) return;
    if (text === "/exit" || text === "/quit") {
      exit();
      return;
    }
    if (text === "/help") {
      await addMessage({ role: "cadence", text: [
        "Commands",
        "/model <alias>       select the normal-chat model",
        "/models              list configured chat models",
        "/explore <request>   use repository and MCP tools read-only",
        "/pipeline <task>     force the engineering cadence",
        "/review <PR>         run the pull-request review pipeline",
        "/qa <ticket>         assess requirements, linked PRs, and CI evidence",
        "/refine <ticket>     make requirements development-ready",
        "/release <scope>     produce a release go/no-go assessment",
        "/plan <proposal>     challenge a plan across product, UX, engineering, and commercial roles",
        "/crossrepo <change>  design a coordinated multi-repository change read-only",
        "/handoff [focus]     save a durable continuation brief",
        "/pipelines           show risk-adaptive stage layouts",
        "/budget <mode>       economy, balanced, or thorough",
        "/limit <n|off>       set the session model-call ceiling",
        "/usage               show local 7-day model activity",
        "/retry               retry the last preserved failure",
        "/quickstart          show the five-minute walkthrough",
        "/setup               show guided-setup instructions",
        "/update              show safe update instructions",
        "/context view        inspect pending conversation context",
        "/context none        remove pending conversation context",
        "/cancel              cancel a pending preflight",
        "/config init         create .cadenceai.json",
        "/config reload       validate and reload configuration",
        "/doctor              inspect authenticated runners",
        "/new                 clear the active cadence",
        "/exit                close CadenceAI",
      ].join("\n") });
      return;
    }
    if (text === "/doctor") {
      await addMessage({ role: "you", text });
      await runDoctor();
      return;
    }
    if (text === "/quickstart") {
      await addMessage({ role: "cadence", text: QUICKSTART });
      return;
    }
    if (text === "/setup") {
      await addMessage({ role: "cadence", text: "Guided setup runs outside the TUI so it can safely prompt you. Exit with /exit, run `cadenceai setup`, then reopen CadenceAI in your project." });
      return;
    }
    if (text === "/update") {
      await addMessage({ role: "cadence", text: `${formatUpdateGuidance(null)}\n\nFor checkout-aware instructions, exit and run \`cadenceai update\`.` });
      return;
    }
    if (text === "/retry") {
      if (busy) {
        await addMessage({ role: "cadence", text: "CadenceAI is still working. Retry is available after the current request finishes." });
        return;
      }
      if (!retryRequest) {
        await addMessage({ role: "cadence", text: "There is no failed request preserved for retry." });
        return;
      }
      const retry = retryRequest;
      setRetryRequest(null);
      await addMessage({ role: "cadence", text: `Retrying the preserved ${retry.kind} request. Configured provider fallbacks and current guardrails apply.` });
      if (retry.kind === "chat") await runChat(retry.question, retry.history);
      else if (retry.kind === "explore") await runExplore(retry.envelope);
      else if (retry.kind === "engineering") await prepareEngineering(retry.envelope, retry.mode, retry.context);
      else if (retry.kind === "review") await prepareReview(retry.envelope);
      else if (retry.kind === "qa") await prepareQa(retry.envelope);
      else await prepareWorkflow(retry.workflow, retry.envelope, retry.seedContext);
      return;
    }
    if (text === "/usage") {
      const summary = await readUsageSummary(cwd);
      const cooldowns = getProviderCooldowns();
      const cooldownText = cooldowns.length
        ? `\n\nProvider cooldowns\n${cooldowns.map((item) => `${item.cli} · ${formatRemaining(item.expiresAt)} · ${item.reason}`).join("\n")}`
        : "\n\nProvider cooldowns\nnone";
      await addMessage({ role: "cadence", text: `${summary}${cooldownText}` });
      return;
    }
    if (text === "/budget" || text.startsWith("/budget ")) {
      const requested = text.split(/\s+/)[1];
      if (!requested) {
        await addMessage({ role: "cadence", text: `Current budget mode: ${budgetMode}. Choose /budget economy, /budget balanced, or /budget thorough.` });
        return;
      }
      if (requested !== "economy" && requested !== "balanced" && requested !== "thorough") {
        await addMessage({ role: "cadence", text: "Budget mode must be economy, balanced, or thorough." });
        return;
      }
      setBudgetMode(requested);
      setNotice(`Budget mode set to ${requested}`);
      await addMessage({ role: "cadence", text: budgetDescription(requested) });
      if (pendingEngineering) await prepareEngineering(pendingEngineering.envelope, requested, pendingEngineering.context);
      if (pendingReview) {
        await addMessage({
          role: "cadence",
          text: "The pending pull-request review is unchanged: reviews always use the configured thorough cadence.",
        });
      }
      if (pendingQa) {
        await addMessage({
          role: "cadence",
          text: "The pending ticket QA is unchanged: QA always uses the configured evidence-driven cadence.",
        });
      }
      if (pendingWorkflow) {
        await addMessage({
          role: "cadence",
          text: `The pending ${workflowLabel(pendingWorkflow.kind)} is unchanged: engineering budget modes do not weaken this workflow.`,
        });
      }
      return;
    }
    if (text === "/limit" || text.startsWith("/limit ")) {
      const requested = text.split(/\s+/)[1];
      if (!requested) {
        await addMessage({ role: "cadence", text: `Current per-task model-call limit: ${config.guardrails.maxModelCallsPerTask ?? "off"}. Use /limit 6 or /limit off.` });
        return;
      }
      const parsed = requested === "off" ? null : Number(requested);
      if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 50)) {
        await addMessage({ role: "cadence", text: "The model-call limit must be an integer from 1 to 50, or off." });
        return;
      }
      const replacedPreflight = Boolean(pendingEngineering || pendingReview || pendingQa || pendingWorkflow);
      setConfig((current) => ({ ...current, guardrails: { maxModelCallsPerTask: parsed } }));
      setPendingEngineering(null);
      setPendingReview(null);
      setPendingQa(null);
      setPendingWorkflow(null);
      setNotice(`Per-task model-call limit: ${parsed ?? "off"}`);
      await addMessage({
        role: "cadence",
        text: `Per-task model-call limit set to ${parsed ?? "off"} for this session.${replacedPreflight ? " The pending preflight was cancelled; submit the request again to see an updated estimate." : ""}\nPersist this setting with \`cadenceai setup\` or guardrails.maxModelCallsPerTask in your configuration.`,
      });
      return;
    }
    if (text === "/context" || text.startsWith("/context ")) {
      const action = text.split(/\s+/)[1] ?? "view";
      if (!pendingEngineering) {
        await addMessage({ role: "cadence", text: "There is no pending engineering preflight with conversation context." });
        return;
      }
      if (action === "none") {
        await prepareEngineering(pendingEngineering.envelope, pendingEngineering.mode, null);
        return;
      }
      if (action === "view") {
        const snapshot = pendingEngineering.context;
        await addMessage({
          role: "cadence",
          text: snapshot
            ? `${conversationContextForPipeline(snapshot)}\n\nFrozen at ${snapshot.createdAt}`
            : "No conversation context is selected for this task.",
        });
        return;
      }
      await addMessage({ role: "cadence", text: "Usage: /context view or /context none" });
      return;
    }
    if (text === "/cancel" && (pendingEngineering || pendingReview || pendingQa || pendingWorkflow)) {
      setPendingEngineering(null);
      setPendingReview(null);
      setPendingQa(null);
      setPendingWorkflow(null);
      setRetryRequest(null);
      setStages(initialStages.map((stage) => ({ ...stage, logs: [], expanded: false })));
      setLastRoute("chat");
      setActiveRisk(null);
      setActivePath("Chat → auto-select");
      setNotice("Pending cadence cancelled");
      await addMessage({ role: "cadence", text: "Cancelled. No model was invoked and no files were changed." });
      return;
    }
    if (text === "/stages") {
      setLastRoute(activePipelineKind);
      setStageFocus(true);
      setNotice("Stage navigator focused · ↑/↓ select · Enter expand · Esc return");
      return;
    }
    if (text === "/new") {
      setStages(initialStages.map((stage) => ({ ...stage, logs: [], expanded: false })));
      setLastRoute("chat");
      setActiveModel("auto-select");
      setActiveRisk(null);
      setActiveContext("none");
      setActivePath("Chat → auto-select");
      setDraftResponse("");
      setPendingEngineering(null);
      setPendingReview(null);
      setPendingQa(null);
      setPendingWorkflow(null);
      setRetryRequest(null);
      await addMessage({ role: "cadence", text: "Ready for a new question or task." });
      setNotice(`Mode: ${mode}`);
      return;
    }
    if (text === "/models") {
      const aliases = Object.entries(config.chat.models)
        .map(([alias, candidate]) => `${alias === modelSelection ? "●" : "○"} ${alias} · ${candidate.cli}/${candidate.model} · ${candidate.effort}`)
        .join("\n");
      await addMessage({ role: "cadence", text: `Chat models\n${modelSelection === "auto" ? "●" : "○"} auto · configured fallback policy\n${aliases}\n\nSelect with /model <alias>, /model auto, or /model opencode/<provider>/<model>.` });
      return;
    }
    if (text === "/model" || text.startsWith("/model ")) {
      const requested = text.split(/\s+/)[1];
      if (!requested) {
        await addMessage({ role: "cadence", text: `Current chat model: ${modelSelection}. Type /models to see configured options.` });
        return;
      }
      try {
        resolveChatCandidates(config, requested);
        setModelSelection(requested);
        setActiveModel(requested === "auto" ? "auto-select" : requested);
        setNotice(`Chat model set to ${requested}`);
        await addMessage({ role: "cadence", text: `Normal conversation will now use ${requested}. Connected and pipeline stages still use their configured capability profiles.` });
      } catch (error) {
        await addMessage({ role: "cadence", text: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (text === "/config" || text.startsWith("/config ")) {
      const action = text.split(/\s+/)[1];
      if (action === "init") {
        try {
          const path = await initializeProjectConfig(cwd);
          const loaded = await loadCadenceConfig(cwd);
          setConfig(loaded.config);
          setConfigPaths(loaded.loadedPaths);
          setBudgetMode(loaded.config.budget.defaultMode);
          setModelSelection(loaded.config.chat.defaultModel);
          setNotice(`Created ${path}`);
          await addMessage({ role: "cadence", text: `Created ${path}. Edit model profiles, risk stages, or review stages there, then run /config reload.` });
        } catch (error) {
          const message = (error as NodeJS.ErrnoException).code === "EEXIST"
            ? `Configuration already exists at ${cwd}/.cadenceai.json. I left it unchanged.`
            : error instanceof Error ? error.message : String(error);
          await addMessage({ role: "cadence", text: message });
        }
      } else if (action === "reload") {
        try {
          const loaded = await loadCadenceConfig(cwd);
          setConfig(loaded.config);
          setConfigPaths(loaded.loadedPaths);
          setBudgetMode(loaded.config.budget.defaultMode);
          setModelSelection(loaded.config.chat.defaultModel);
          setNotice("Configuration reloaded");
          await addMessage({ role: "cadence", text: `Configuration reloaded from ${loaded.loadedPaths.join(", ") || "built-in defaults"}.` });
        } catch (error) {
          await addMessage({ role: "cadence", text: error instanceof Error ? error.message : String(error) });
        }
      } else {
        await addMessage({
          role: "cadence",
          text: `Configuration: ${configPaths.join(", ") || "built-in defaults"}\nProject override: ${cwd}/.cadenceai.json\n\n/config init creates a complete editable project configuration.\n/config reload validates and reloads it.`,
        });
      }
      return;
    }
    if (text === "/pipelines") {
      const risks = (["low", "medium", "high"] as const)
        .map((risk) => {
          const envelope: TaskEnvelope = {
            request: "pipeline preview",
            intent: "engineering",
            risk,
            linearTickets: [],
            pullRequests: [],
            needsConnectedTools: false,
          };
          return `${risk}: ${planEngineeringExecution(envelope, config, budgetMode).stages.map((stage) => stage.name).join(" → ")}`;
        })
        .join("\n");
      const workflows = (["refine", "release", "plan", "crossrepo", "handoff"] as const)
        .map((kind) => `${workflowLabel(kind)}\n${workflowStages(config, kind).map((stage) => stage.name).join(" → ")}`)
        .join("\n\n");
      await addMessage({ role: "cadence", text: `Engineering pipeline · ${budgetMode}\n${risks}\n\nPull-request review\n${reviewStages(config).map((stage) => stage.name).join(" → ")}\n\nTicket QA\n${qaStages(config).map((stage) => stage.name).join(" → ")}\n\n${workflows}` });
      return;
    }
    if (text.startsWith("/mode")) {
      const requested = text.split(/\s+/)[1];
      if (requested === "auto" || requested === "chat" || requested === "pipeline") {
        setMode(requested);
        setNotice(`Mode set to ${requested}`);
        await addMessage({ role: "cadence", text: `Mode is now ${requested}. ${modeDescription(requested)}` });
      } else {
        await addMessage({ role: "cadence", text: "Usage: /mode auto, /mode chat, or /mode pipeline" });
      }
      return;
    }
    const forced: TaskIntent | null = text === "/chat" || text.startsWith("/chat ")
      ? "chat"
      : text === "/pipeline" || text.startsWith("/pipeline ")
        ? "engineering"
        : text === "/explore" || text.startsWith("/explore ")
          ? "explore"
          : text === "/review" || text.startsWith("/review ")
            ? "review"
            : text === "/qa" || text.startsWith("/qa ")
              ? "qa"
              : text === "/refine" || text.startsWith("/refine ")
                ? "refine"
                : text === "/release" || text.startsWith("/release ")
                  ? "release"
                  : text === "/plan" || text.startsWith("/plan ")
                    ? "plan"
                    : text === "/crossrepo" || text.startsWith("/crossrepo ")
                      ? "crossrepo"
                      : text === "/handoff" || text.startsWith("/handoff ")
                        ? "handoff"
            : null;
    if (forced && !text.includes(" ")) {
      if (forced === "chat" || forced === "engineering") {
        const nextMode = forced === "engineering" ? "pipeline" : "chat";
        setMode(nextMode);
        setNotice(`Mode set to ${nextMode}`);
        await addMessage({ role: "cadence", text: `Mode is now ${nextMode}. ${modeDescription(nextMode)}` });
        return;
      } else if (forced === "handoff") {
        // A bare handoff intentionally summarizes the current session.
      } else {
        const usage = forced === "review" ? "review <PR or diff request>"
          : forced === "qa" ? "qa <Linear ticket>"
          : forced === "refine" ? "refine <ticket or requirements>"
          : forced === "release" ? "release <tickets, PRs, or milestone>"
          : forced === "plan" ? "plan <proposal>"
          : forced === "crossrepo" ? "crossrepo <change and repository paths>"
          : "explore <connected question>";
        await addMessage({ role: "cadence", text: `Usage: /${usage}` });
        return;
      }
    }
    const request = forced === "handoff" && !text.includes(" ")
      ? "Create a handoff for the current session"
      : forced ? text.slice(text.indexOf(" ") + 1).trim() : text;
    const replacedPreflight = pendingEngineering ?? pendingReview ?? pendingQa ?? pendingWorkflow;
    if (pendingEngineering) setPendingEngineering(null);
    if (pendingReview) setPendingReview(null);
    if (pendingQa) setPendingQa(null);
    if (pendingWorkflow) setPendingWorkflow(null);
    const userMessage: ChatMessage = { role: "you", text: request };
    const history = [...messages, userMessage];
    await addMessage(userMessage);
    if (replacedPreflight) {
      await addMessage({ role: "cadence", text: "The previous preflight was cancelled because you started a new request. No model was invoked for it and no files were changed." });
    }
    if (busy) {
      await addMessage({ role: "cadence", text: "I’m still working on the previous request. Wait for it to finish, then send this again." });
      return;
    }
    setRetryRequest(null);
    const modeIntent = mode === "chat" ? "chat" : mode === "pipeline" ? "engineering" : undefined;
    const conversationContext = createConversationContextSnapshot(request, messages);
    const envelope = createTaskEnvelope(request, config, forced ?? modeIntent, conversationContext?.text);
    if (envelope.intent === "engineering") {
      if (stages.some((stage) => stage.status !== "waiting")) {
        setStages(initialStages.map((stage) => ({ ...stage, logs: [], expanded: false })));
      }
      await prepareEngineering(envelope, budgetMode, conversationContext);
    } else if (envelope.intent === "explore") {
      await runExplore(envelope);
    } else if (envelope.intent === "review") {
      await prepareReview(envelope);
    } else if (envelope.intent === "qa") {
      await prepareQa(envelope);
    } else if (["refine", "release", "plan", "crossrepo", "handoff"].includes(envelope.intent)) {
      const kind = envelope.intent as ReadOnlyWorkflowKind;
      const seedContext = kind === "handoff" || kind === "plan" ? handoffSessionContext(messages) : undefined;
      await prepareWorkflow(kind, envelope, seedContext);
    } else {
      await runChat(request, history);
    }
  };

  const visibleMessages = useMemo(() => messages.slice(-(compact ? 5 : 8)), [compact, messages]);
  const showWelcome = messages.length === 1 && stages.every((stage) => stage.status === "waiting");
  const pipelineActive = stages.some((stage) => stage.status !== "waiting");
  const showPipeline = (pipelineActive || Boolean(pendingEngineering) || Boolean(pendingReview) || Boolean(pendingQa) || Boolean(pendingWorkflow)) && lastRoute !== "chat" && lastRoute !== "explore";

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
              <Text><Text color="cyan">mode {mode}</Text><Text dimColor> · budget {budgetMode} · limit {config.guardrails.maxModelCallsPerTask ?? "off"}</Text></Text>
              <Text dimColor>Claude + Codex + OpenCode</Text>
            </Box>
          </Box>
          <Box marginTop={1} width={Math.min(76, Math.max(44, columns - 8))} justifyContent="flex-end">
            <Text><Text>ctrl+l</Text><Text dimColor> stages   </Text><Text> /doctor</Text><Text dimColor> runtimes</Text></Text>
          </Box>
          <Box marginTop={3}>
            <Text color="yellow">● Tip </Text>
            <Text dimColor>Ask a question, or say “implement…” to activate the pipeline.</Text>
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
        <Text dimColor>{shortPath(cwd)} · {mode}/{lastRoute} · {budgetMode} · {modelSelection} · session {sessionId}</Text>
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
            {draftResponse && (
              <Box flexDirection="column" marginBottom={1}>
                <Text bold color="green">CadenceAI</Text>
                {draftResponse.split("\n").map((line, lineIndex) => <Text key={lineIndex}>{line || " "}</Text>)}
              </Box>
            )}
            {busy && <Text color="yellow">● {activePath}</Text>}
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
          {showPipeline ? (
            <>
          <Text bold>{pipelineTitle(lastRoute)} <Text dimColor>({stages.filter((stage) => stage.status === "complete").length}/{stages.length}){activeRisk ? ` · ${activeRisk}` : ""}</Text></Text>
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
            </>
          ) : (
            <Box flexDirection="column">
              <Text bold color="cyan">{lastRoute === "explore" ? "CONNECTED" : "CHAT"}</Text>
              <Text color={busy ? "yellow" : "green"}>● {busy ? "working" : "ready"}</Text>
              <Text dimColor>{activeModel}</Text>
              <Text dimColor>{activePath}</Text>
              {activeContext !== "none" && <Text dimColor>context · {activeContext}</Text>}
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>{lastRoute === "explore" ? "Read-only tools enabled." : "No pipeline active."}</Text>
                <Text dimColor>{lastRoute === "explore" ? "Sources stay visible." : "Questions answer directly."}</Text>
                <Text dimColor>Implementation requests</Text>
                <Text dimColor>start a risk-sized cadence.</Text>
              </Box>
              <Box marginTop={1} flexDirection="column">
                <Text>/chat <Text dimColor>force chat</Text></Text>
                <Text>/explore <Text dimColor>use tools</Text></Text>
                <Text>/pipeline <Text dimColor>force pipeline</Text></Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box borderStyle="round" borderColor={stageFocus ? "gray" : "cyan"} paddingX={1}>
        <Text color="cyan">› </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={(value) => void submit(value)}
          focus={!stageFocus}
          placeholder={busy
            ? "Working…"
            : pendingEngineering
              ? "Press Enter to run, /budget <mode>, or /cancel"
              : pendingReview
                ? "Press Enter to run the thorough review, or /cancel"
                : pendingQa
                  ? "Press Enter to run read-only ticket QA, or /cancel"
                  : pendingWorkflow
                    ? `Press Enter to run ${workflowLabel(pendingWorkflow.kind)}, or /cancel`
                : "Ask anything, or describe an implementation task"}
        />
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>{notice}</Text>
        <Text dimColor>Mode {mode} · Budget {budgetMode} · Limit {config.guardrails.maxModelCallsPerTask ?? "off"} · Model {modelSelection}{retryRequest ? " · retry ready" : ""} · /usage · /doctor</Text>
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

function stageViews(definitions: PipelineStageConfig[]): StageView[] {
  return definitions.map((stage) => ({
    name: stage.name,
    status: "waiting",
    detail: stage.detail,
    model: stage.modelProfile,
    logs: [],
    expanded: false,
  }));
}

function modeDescription(mode: InteractionMode): string {
  if (mode === "chat") return "Every request is answered directly until you change modes.";
  if (mode === "pipeline") return "Every request starts the engineering cadence until you change modes.";
  return "Questions use chat; clear implementation requests use the engineering cadence.";
}

function connectedTarget(envelope: TaskEnvelope): string {
  const targets = [
    ...envelope.linearTickets.map((ticket) => `Linear ${ticket}`),
    ...envelope.pullRequests.map((pullRequest) => `PR ${pullRequest}`),
  ];
  return targets.join(", ") || "repository";
}

function workflowTarget(envelope: TaskEnvelope, kind: ReadOnlyWorkflowKind): string {
  const connected = connectedTarget(envelope);
  if (connected !== "repository") return connected;
  if (kind === "handoff") return "current session";
  if (kind === "crossrepo") return "repositories named in request";
  if (kind === "release") return "release scope in request";
  if (kind === "plan") return "proposal in request";
  return "requirements in request";
}

function workflowCompletionNote(kind: ReadOnlyWorkflowKind): string {
  if (kind === "refine") return "No source ticket was edited. Apply the proposed brief only after human review.";
  if (kind === "release") return "No release, ticket, pull request, or deployment state was changed.";
  if (kind === "plan") return "This is a challenged recommendation, not an approved commitment. Human owners still decide.";
  if (kind === "crossrepo") return "No repository was modified. Authorize implementation separately after reviewing repository boundaries and Git state.";
  return "The handoff is local and may still contain proposals that the next person should verify.";
}

function pipelineTitle(intent: TaskIntent): string {
  if (intent === "review") return "REVIEW";
  if (intent === "qa") return "TICKET QA";
  if (intent === "refine") return "REFINE";
  if (intent === "release") return "RELEASE";
  if (intent === "plan") return "PLAN";
  if (intent === "crossrepo") return "CROSS-REPO";
  if (intent === "handoff") return "HANDOFF";
  return "CADENCE";
}

function budgetDescription(mode: BudgetMode): string {
  if (mode === "economy") return "Budget mode: economy. CadenceAI minimizes model calls, uses local classification, and retains independent scrutiny only for high-risk work.";
  if (mode === "thorough") return "Budget mode: thorough. CadenceAI uses every stage configured for the task's risk level.";
  return "Budget mode: balanced. Low-risk work stays lean; medium and high-risk work add independent reasoning where it is most useful.";
}

function formatRemaining(expiresAt: number): string {
  const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60_000));
  if (minutes >= 24 * 60) return `${Math.ceil(minutes / (24 * 60))}d remaining`;
  if (minutes >= 60) return `${Math.ceil(minutes / 60)}h remaining`;
  return `${minutes}m remaining`;
}
