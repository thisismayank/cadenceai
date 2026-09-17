# Workflow reference

All automatic routing is local. Slash commands force a route when deterministic intent inference is not what the user wants.

## Shared lifecycle

Multi-stage workflows follow this lifecycle:

1. Build a local task envelope with intent, risk, ticket IDs, PR URLs, and tool needs.
2. Select configured stages and calculate logical model calls.
3. Reject work above the configured call ceiling.
4. Show target, stage order, cost, safety notes, and confirmation.
5. Execute stages with bounded evidence handoffs.
6. Preserve a failed request for `/retry`.
7. End at a human decision rather than silently taking consequential external action.

## Chat

- Route: ordinary question or `/chat`
- Calls: 1
- Tools: none
- Output: direct answer
- Session behavior: provider conversation may resume when supported

The selected chat alias affects only direct conversation.

## Exploration

- Route: connected question or `/explore`
- Calls: 1
- Tools: narrow read-only repository, GitHub, or MCP allowlist
- Output: source-grounded answer with visible references

After ticket exploration, CadenceAI suggests refinement before development or QA after implementation.

## Engineering

- Route: clear modification request or `/pipeline`
- Calls: 1–5 engineering stages plus optional connected evidence
- Tools: model-dependent repository access plus deterministic shell verification
- Mutation: current repository only
- Preconditions: Git repository, clean worktree, accepted preflight
- Output: implementation summary, verification evidence, and final Git status

Economy, Balanced, and Thorough change stage depth. Risk keywords select low, medium, or high scrutiny. Verification is deterministic and never replaced by a model claim.

## Pull-request review

- Command: `/review <PR or diff request>`
- Calls: 6
- Mutation: none
- Stages: inspect diff, requirements, correctness, test gaps, adversarial, review report, human review
- Output: verdict, prioritized evidence-backed findings, test gaps, and actions

Only inspection receives tools. Later stages reason from collected evidence.

## Ticket QA

- Command: `/qa <Linear ticket>`
- Calls: 6
- Mutation: none
- Stages: collect evidence, requirements, implementation, verification gaps, adversarial, QA report, human decision
- Evidence: ticket, comments, linked PR URLs, diffs, and reported CI checks
- Output: Pass, Conditional Pass, Fail, or Insufficient Evidence; requirement matrix; findings; release recommendation

QA does not checkout or execute untrusted PR code. It distinguishes remote CI results from local execution.

## Ticket refinement

- Command: `/refine <ticket or requirements>`
- Calls: 3
- Mutation: none
- Stages: collect ticket, requirements critic, ready-for-development brief, human decision
- Output: problem, scoped requirements, numbered acceptance criteria, non-goals, dependencies, test strategy, questions, and readiness verdict

The source ticket is never edited automatically. Proposed wording remains distinguishable from source requirements.

## Release readiness

- Command: `/release <tickets, PRs, milestone, cycle, or release scope>`
- Calls: 6
- Mutation: none
- Stages: collect evidence, release scope, implementation coverage, operational readiness, release challenge, go/no-go report, release decision
- Output: Go, Conditional Go, No-Go, or Insufficient Evidence; blockers; owners; rollout; rollback; monitoring

When a named milestone cannot be enumerated with available connectors, missing scope is reported rather than guessed.

## Challenged planning

- Command: `/plan <proposal>`
- Calls: 6
- Mutation: none
- Stages: product framing, UX challenge, engineering challenge, commercial challenge, adversarial council, decision-ready plan, human decision
- Output: decision and rationale, user jobs, scope, experience principles, technical approach, phases, experiments, risks, measures, ownership, and dissent

Planning can use recent conversation as context. Repository or ticket tools are used only when the request references connected evidence.

## Cross-repository planning

- Command: `/crossrepo <change and repository paths>`
- Calls: 6
- Mutation: none
- Stages: discover repositories, contract analysis, dependency map, delivery design, integration challenge, coordinated plan, human authorization
- Output: repository inventory, contracts, dependencies, phases, compatibility, test matrix, release gates, rollback, and ownership gaps

Launch CadenceAI from a shared parent directory when sibling repositories must be visible. This workflow does not checkout, fetch, install, build, test, or modify repositories.

## Session handoff

- Command: `/handoff [focus]`
- Calls: 1
- Mutation: one local `.cadence/handoffs/*.md` artifact
- Input: up to 24 recent substantive turns, bounded to 30,000 characters
- Output: objective, state, decisions, evidence, completed work, validation, questions, risks, commands, and next steps

Interface preflights are excluded and common credential shapes are deterministically redacted from the saved file.

## Human and external actions

Human stages are explicit waiting states. CadenceAI does not automatically:

- update Linear;
- post GitHub comments;
- approve or merge pull requests;
- commit or push code;
- create deployments or releases;
- alter feature flags;
- revert repository changes.

Those actions require a separate explicit user-authorized workflow.
