# Roadmap and known limitations

## Current internal alpha

Implemented:

- continuous terminal conversation;
- local intent and risk routing;
- Claude, Codex, and OpenCode adapters with fallback;
- read-only repository, Linear, and GitHub evidence retrieval;
- risk-adaptive test-first engineering;
- PR review and ticket QA;
- ticket refinement, release readiness, challenged planning, and cross-repository planning;
- local sessions, usage records, handoffs, onboarding, and editable pipelines;
- budget guardrails, Git safety, retry preservation, and provider cooldowns.

## Deliberate limitations

- Cross-repository mode plans but does not modify multiple repositories.
- QA reads CI results but does not checkout and execute untrusted PR branches.
- CadenceAI does not edit Linear, post PR comments, merge code, deploy, or change feature flags.
- Retry state and provider cooldowns are process-local.
- `/usage` is not an authoritative provider quota balance.
- No active database or shared team server backs the CLI.
- Session artifacts are local and are not synchronized across machines.
- There is no plugin SDK; extension currently means TypeScript and configuration changes.
- The repository does not yet have an open-source license.

## Next reliability milestones

1. Isolated worktree execution for safe PR verification.
2. Multi-repository mutation with per-repository clean-state checks, isolated branches, rollback, and explicit authorization at every boundary.
3. Structured artifact schemas for workflow outputs instead of text-only handoffs.
4. Resume retry and cooldown state safely across process restarts.
5. Evaluation fixtures for routing accuracy, prompt regressions, cost, and provider parity.
6. Automated release packaging and version consistency.

## Self-service milestones

1. Test the installer and tour with internal team members who did not build the project.
2. Run a concierge alpha with a Starter-plan developer.
3. Capture onboarding failures and real workflow cost before expanding automation.
4. Add supported-platform testing for macOS and Linux.
5. Choose a license and publish contribution and security policies before public promotion.

## Product decisions to revisit later

- Whether team-shared evidence needs an optional service or remains file-based.
- Whether external mutations should be first-class or remain human-driven handoffs.
- Whether model policies should ship as community presets.
- Whether planning perspectives should be selectable per domain.
- Whether NotebookLM-style source synthesis belongs as a connector or a separate research workflow.

Historical control-plane ideas live in `SPEC.md` and `DECISIONS.md`; they are not the current implementation roadmap.
