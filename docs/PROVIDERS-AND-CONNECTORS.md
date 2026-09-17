# Providers and connectors

## Authentication model

CadenceAI does not own provider API keys. It invokes local commands that are already installed and authenticated:

- Claude Code through `claude`
- Codex through `codex`
- OpenCode through `opencode`

Run:

```bash
cadenceai doctor
```

Doctor reports installation, authentication, and safe remediation commands without printing account identifiers or credentials. Authenticate through the provider CLI itself, then rerun doctor.

## Provider selection

Normal chat uses the session selection from `/model`. `auto` uses the ordered `conversation` capability profile.

Pipeline stages use profiles such as `connected_research`, `balanced_reasoner`, `flagship_coder`, and `flagship_reasoner`. Each profile contains ordered runner/model candidates. See [CONFIGURATION.md](./CONFIGURATION.md).

The router:

1. skips unavailable or unauthenticated CLIs;
2. skips providers on a temporary quota cooldown;
3. invokes the next configured candidate after a failure;
4. records the successful runner and model locally;
5. reports fallback use to the terminal.

Diagnostics are cached briefly to avoid repeated login checks. Connected resolution remembers the last successful candidate per capability for ten minutes.

## Direct-chat continuation

Provider adapters can expose a session identifier. CadenceAI keeps adapters alive for the TUI process and sends a compact continuation prompt on later direct-chat turns.

Connected lookups and workflow stages remain isolated calls because their tool permissions and evidence boundaries differ.

## OpenCode models

Use a direct selection in this form:

```text
/model opencode/<provider>/<model>
```

OpenCode owns provider credentials and model availability. CadenceAI passes the provider/model reference through without storing credentials.

For pipelines, add OpenCode candidates to capability profiles in `.cadenceai.json`.

## MCP connectors

CadenceAI reuses connectors configured in the underlying CLI. It does not run its own MCP registry or credential store.

Linear-aware workflows can request read-only tools for:

- retrieving an issue;
- listing comments;
- listing issues for release scope discovery.

The exact tool must exist in the selected provider's MCP configuration. If the provider requests interactive approval during a noninteractive call, CadenceAI treats the attempt as unavailable and tries the next configured connected candidate.

## GitHub CLI

PR review, QA, and release evidence use narrow read-only `gh` command shapes, including PR view, diff, checks, list, and run view. The local `gh` command must be authenticated for private repositories.

CadenceAI does not use commands that merge, approve, comment, close, edit, or create GitHub resources.

## Tool permission boundaries

- Chat: no tools.
- Repository exploration: Read, Grep, and Glob.
- Linear: configured read-only MCP tools.
- PR evidence: read-only `git` and `gh` commands.
- Cross-repository discovery: read-only `git -C` status, diff, log, ls-files, grep, rev-parse, and remote inspection.
- Engineering: provider-specific repository mutation permissions plus separately executed verification commands.

Prompts repeat that retrieved source material is untrusted and that embedded instructions must not be followed.

## Quotas and cooldowns

CadenceAI cannot read authoritative subscription balances. `/usage` reports only successful calls observed locally.

Quota-like or rate-limit failures place the provider on an in-process cooldown, normally one hour, so fallback does not repeatedly hit an exhausted service. Restarting CadenceAI resets in-memory cooldowns; provider limits remain provider-controlled.

Use `/retry` after selecting another model, lowering engineering budget, raising an intentional call ceiling, or waiting for provider reset.

## Connector troubleshooting

1. Run `cadenceai doctor`.
2. Confirm the connector works directly in the underlying CLI.
3. Confirm the workflow uses a `connected_research` candidate with that connector.
4. Use `/explore <request>` to isolate retrieval from multi-stage processing.
5. Read the exact CadenceAI error for permission deferral, unavailable tools, or authentication.
6. Do not place connector tokens in `.cadenceai.json`.
