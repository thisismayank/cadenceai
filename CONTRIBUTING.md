# Contributing to CadenceAI

CadenceAI is currently a public repository in internal-alpha governance. An explicit open-source license has not yet been selected, so public contribution terms are not finalized. Coordinate with the repository owner before beginning external work.

## Before contributing

Read:

- `README.md`
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- the relevant workflow or configuration reference

Open an issue or internal ticket for nontrivial changes, especially changes to tool permissions, external mutations, credential handling, call budgets, or repository safety.

## Development flow

1. Branch from current `master`.
2. Make one coherent change.
3. Add tests and documentation.
4. Run `pnpm validate` and `git diff --check`.
5. Open a pull request using a descriptive title and evidence-backed description.
6. Resolve review conversations and keep the branch current.
7. Merge only after the required `Validate` check and approval.

Direct pushes to `master`, force pushes, and deletion of `master` are prohibited by repository protection.

## Pull-request description

Include:

- problem and user outcome;
- implementation approach;
- safety, permission, and model-call impact;
- tests and manual checks performed;
- documentation updated;
- known limitations or follow-up work.

## Security-sensitive changes

Changes to provider commands, MCP tools, Git commands, prompt-injection defenses, credential redaction, external actions, or worktree mutation require explicit security reasoning and adversarial tests.

Never include secrets, private ticket content, raw provider credentials, or user session artifacts in commits or issues.

## Style

- Preserve local deterministic behavior where a model call is unnecessary.
- Keep providers replaceable through capability profiles.
- Use the narrowest possible tool permission.
- Distinguish verified evidence from inference.
- Keep safety behavior visible in preflights and help.
- Avoid destructive recovery automation.

## Reporting problems

Follow [SECURITY.md](./SECURITY.md) for suspected vulnerabilities. Do not open a public issue containing exploit details or credentials.
