# Ticket-to-handoff walkthrough

This journey demonstrates the complete CadenceAI loop without requiring CadenceAI-owned API keys. Replace `ELM-2851` with a ticket available through your Claude or Codex Linear connection.

## 1. Check the environment

```bash
cd /path/to/a/clean/git/repository
git status --short
cadenceai doctor
cadenceai
```

Inside CadenceAI, type `/tour` at any time for the zero-cost overview. Type `/` to see commands and press Tab to complete one.

## 2. Understand the ticket

```text
/explore Summarize ELM-2851, including its dependencies and unresolved questions
```

Exploration makes one read-only connected call. CadenceAI suggests refinement before development or QA after implementation.

## 3. Refine requirements before coding

```text
/refine ELM-2851
```

The preflight shows three planned calls. Press Enter to continue. The resulting brief separates original source requirements from proposed clarifications and produces numbered, testable acceptance criteria. CadenceAI does not edit Linear.

Have a human resolve material open questions before continuing.

## 4. Implement the approved brief

Make sure the repository is still clean, then submit a self-contained implementation request:

```text
/pipeline Implement the approved requirements for ELM-2851
```

CadenceAI displays the risk level, budget, stages, expected calls, and captured conversation context. Review the preflight and press Enter.

After execution:

```bash
git status --short
git diff
```

CadenceAI never commits or pushes automatically.

## 5. Assess the implementation

Once the ticket references its pull request or pull requests:

```text
/qa ELM-2851
```

QA retrieves ticket requirements, comments, linked PR diffs, and reported CI checks. It produces a requirement-coverage matrix and a Pass, Conditional Pass, Fail, or Insufficient Evidence verdict.

Reported CI is not presented as locally executed testing. Missing execution evidence remains explicit.

## 6. Check release readiness

For a release containing several tickets or PRs:

```text
/release ELM-2851 ELM-2852 and their linked pull requests
```

The report covers scope, implementation coverage, operational readiness, rollout, rollback, monitoring, blockers, conditions, and owners. It does not change release state.

## 7. Preserve a handoff

```text
/handoff Focus on QA findings and unresolved release blockers
```

CadenceAI creates one local Markdown file under `.cadence/handoffs/`. The handoff includes the objective, evidence, decisions, validation, risks, and exact next steps. Common credential shapes are redacted from the durable artifact.

## Useful recovery commands

```text
/usage
/retry
/doctor
/limit 6
/help qa
/help handoff
```

Use `/new` to create a hard conversation boundary before starting unrelated work.
