# Troubleshooting

## Start here

```bash
cadenceai doctor
cadenceai --version
```

Inside the TUI:

```text
/usage
/models
/retry
```

## Command not found

Confirm the installer-linked directory is on `PATH`:

```bash
command -v cadenceai
```

The installer defaults to `$HOME/.local/bin`. Add that directory to your shell configuration or set `CADENCEAI_BIN_DIR` when installing.

The installer refuses to overwrite an unrelated existing command. Resolve that conflict explicitly rather than deleting unknown files automatically.

## Provider unavailable or unauthenticated

Run `cadenceai doctor`, follow the provider-owned login command it reports, and rerun doctor. CadenceAI cannot repair or store provider credentials.

If only one provider is authenticated, run `cadenceai setup` again so normal chat prefers it.

## Requested model is unavailable

Use `/models` and `/model auto`, or update the relevant capability profile. Model identifiers are provider-controlled and can differ by plan or CLI version.

Do not assume a model available in one provider CLI is available in another.

## Plan limit, allowance, or rate limit

`/usage` shows local successful activity, not the provider's authoritative balance. Options are:

1. use `/model auto` for chat fallback;
2. use `/budget economy` for engineering;
3. wait for provider reset;
4. update profile fallback order;
5. use `/retry` when ready.

`/limit` controls CadenceAI's planned logical calls. Raising it does not increase a provider subscription allowance.

## Connected Linear or MCP request asks for permission

CadenceAI runs connected retrieval noninteractively. Configure and authorize the MCP connector in the underlying provider CLI first, then test it directly there.

CadenceAI treats a permission deferral as an unavailable connected candidate and can try the next configured provider.

## Linear ticket is summarized but linked PRs are missing

Check that:

- the ticket or comments contain canonical GitHub PR URLs;
- `gh auth status` succeeds for the repository;
- the selected connected provider can access Linear comments;
- `/qa <ticket>` is used when implementation evidence is required.

CadenceAI reports missing source access rather than inventing linked work.

## Engineering is blocked by Git safety

Engineering requires a clean repository:

```bash
git status --short
```

Commit or stash your existing work yourself. CadenceAI will not stash, reset, discard, or mix unrelated changes. It checks again after the preflight in case the worktree changes while confirmation is open.

## Engineering exceeds the call ceiling

The preflight calculates connected and engineering stages. Choose a leaner budget or intentionally change the ceiling:

```text
/budget economy
/limit 6
```

Persist the choice with `cadenceai setup` or configuration. Review and decision workflows are not silently weakened by engineering budget mode.

## Cross-repository discovery cannot see a sibling repository

Exit and launch CadenceAI from a shared parent directory:

```bash
cd /path/to/workspace
cadenceai
```

Provide explicit repository paths in `/crossrepo`. Underlying provider filesystem permissions still apply. Cross-repository mode will not fetch or modify inaccessible repositories.

## Configuration fails to load

Check both personal and project configuration paths. Common failures are:

- missing `version: 1` after merge;
- invalid budget mode;
- call ceiling outside 1–50;
- missing required profile candidate arrays;
- stage order referencing an unknown stage;
- invalid runner or effort values.

Use a temporary copy before changing a shared project configuration. `/config reload` leaves the current in-memory configuration active when validation fails.

## A failed request needs to be retried

CadenceAI preserves the most recent failed chat, exploration, engineering, review, QA, or decision workflow within the process. Fix authentication, selection, quota, connector, Git, or call-limit conditions, then use `/retry`.

Restarting the process does not currently restore retry state.

## Session resume

Launch with:

```bash
cadenceai --continue
```

Sessions are append-only JSONL under `.cadence/sessions/`. If a file is corrupt, preserve it for diagnosis and start without `--continue`; do not hand-edit active sessions unless necessary.

## Reported CI versus local tests

QA and release workflows inspect reported GitHub checks. That is not equivalent to CadenceAI running the tests locally. Reports should label the distinction. Engineering verification is the workflow that executes repository commands locally.

## Getting diagnostic evidence

When filing an issue, include:

- CadenceAI version;
- operating system and Node version;
- sanitized `cadenceai doctor` output;
- the command or natural-language route;
- the displayed preflight;
- exact error text;
- whether `/retry` changed the result.

Never include provider tokens, private ticket content, secrets, or raw handoffs without reviewing them.
