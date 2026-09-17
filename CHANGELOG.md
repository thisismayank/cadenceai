# Changelog

CadenceAI follows semantic versioning once public releases begin. During internal alpha, this file records meaningful product milestones on `master`.

## Unreleased

### Added

- Current maintainer handbook and protected-branch CI contract.

## 0.1.0 — Internal alpha

### Added

- Continuous Ink terminal interface with direct chat and inspectable workflow stages.
- Authenticated Claude Code, Codex, and OpenCode routing without CadenceAI-owned API keys.
- Local classification, model selection, capability profiles, fallback, cooldowns, and usage ledger.
- Connected Linear, GitHub, and repository exploration.
- Risk-adaptive test-first engineering with deterministic verification and Git safety.
- Pull-request review and ticket QA pipelines.
- Ticket refinement, release readiness, challenged planning, cross-repository planning, and durable handoffs.
- Starter setup, doctor, installer, update guidance, retry, model-call ceilings, first-run tour, contextual help, and walkthroughs.

### Safety

- Read-only workflows use narrow tool permissions and treat retrieved sources as untrusted.
- Engineering requires a clean worktree and never commits, pushes, reverts, or deletes automatically.
- Cross-repository work remains planning-only.
