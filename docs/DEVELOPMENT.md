# Development guide

## Prerequisites

- Node.js 20 or newer
- pnpm 11.24.0 through Corepack or a compatible installation
- Git
- At least one authenticated provider CLI for manual model smoke tests

Model credentials are not needed for unit tests.

## Setup

```bash
git clone git@github.com:thisismayank/cadenceai.git
cd cadenceai
corepack enable
pnpm install --frozen-lockfile
```

Run the development TUI:

```bash
pnpm cli
```

Build and run the executable:

```bash
pnpm --filter @cadenceai/cli build
./apps/cli/dist/index.js
```

## Validation

The required local gate is:

```bash
pnpm validate
git diff --check
```

`pnpm validate` runs agent tests, CLI tests, both typechecks, and the CLI production build. Tests use injected assistants and resolvers; they should not consume provider quota.

Run focused commands while developing:

```bash
pnpm --filter @cadenceai/agents test
pnpm --filter @cadenceai/cli test
pnpm --filter @cadenceai/agents typecheck
pnpm --filter @cadenceai/cli typecheck
pnpm --filter @cadenceai/cli build
```

The `tsx` test runner creates a temporary local IPC socket. Sandboxed environments may require permission for the operating-system temporary directory.

## Manual smoke tests

Avoid spending model calls unless the changed behavior requires a real provider.

Zero-cost checks:

```bash
cadenceai --version
cadenceai --help
cadenceai quickstart
cadenceai doctor
```

In a temporary directory, verify:

- first launch shows `/tour` content;
- typing `/ref` shows `/refine` and Tab completes it;
- `/help qa` explains cost and safety;
- `/pipelines` lists all workflow stages;
- `/cancel` closes a preflight without invoking a model.

When a live connector test is necessary, use one explicit ticket and record that provider quota and external data were accessed.

## Adding a read-only workflow

1. Add the intent to `TaskIntent` and conservative local patterns in `task.ts`.
2. Add the pipeline and default stages in `config.ts`.
3. Add call planning and preflight language in `budget.ts`.
4. Add stage prompt contracts in `workflow.ts`, or create a dedicated module when evidence handling is materially different.
5. Add the forced command, pending preflight, retry path, sidebar title, and completion guidance in `app.tsx`.
6. Add purpose, calls, safety, and examples to `tui-help.ts`.
7. Add connected tool permissions and prompt constraints in `context.ts` only when needed.
8. Add routing, budget, execution, failure, and help tests.
9. Update README, WORKFLOWS, configuration reference, walkthrough where relevant, and CHANGELOG.

Keep automatic routing narrow. False pipeline activation is more expensive and surprising than requiring a slash-command override.

## Adding a provider adapter

1. Implement `CliAgentAdapter` under `packages/agents/src/cli/`.
2. Keep command execution noninteractive and capture structured output where available.
3. Implement diagnostics without exposing account identifiers or secrets.
4. Support `toolAccess` and the narrow allowed-tool list as strongly as the provider permits.
5. Extract provider session IDs if direct chat can resume safely.
6. Add parser, argument, continuation, streaming, and failure tests.
7. Register the adapter in the router constructed by `apps/cli/src/chat.ts`.
8. Add default candidates only after the adapter is reliable.
9. Document authentication and limitations without storing credentials.

## Changing configuration

Backward compatibility relies on recursive merging with built-in defaults. New required sections should have complete defaults so older user files continue loading.

Update validation and add a test that loads a minimal older override. Never silently reinterpret an existing field.

## TUI changes

The UI must remain usable in narrow terminals. Keep persistent help concise, use the transcript for detail, and smoke-test standard terminal heights. Commands should remain discoverable through `/`, Tab, `/help`, and `/tour`.

## Git and generated state

- `.cadence/` belongs to the local user and must remain ignored.
- Do not commit `dist`, dependency directories, usage logs, sessions, or handoffs.
- Preserve unrelated worktree changes.
- Avoid destructive Git commands in automation.

## Pull requests

All changes to `master` should go through a pull request after branch protection is enabled. The required CI job is `Validate`. Include:

- problem and intended behavior;
- safety or call-cost impact;
- tests run;
- documentation changed;
- screenshots only when terminal rendering materially changes.
