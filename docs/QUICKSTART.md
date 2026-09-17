# CadenceAI Starter quickstart

CadenceAI uses authenticated Claude, Codex, or OpenCode commands. It does not require model API keys of its own.

## 1. Install

Run the GitHub installer:

~~~
curl -fsSL https://raw.githubusercontent.com/thisismayank/cadenceai/master/scripts/install.sh | bash
~~~

Or inspect it first:

~~~
git clone https://github.com/thisismayank/cadenceai.git
cd cadenceai
CADENCEAI_INSTALL_ROOT="$PWD" ./scripts/install.sh
~~~

The installer keeps a dedicated checkout under $HOME/.local/share/cadenceai when downloaded and run independently; the command above explicitly uses the checkout you just cloned. It links cadenceai and cadence into $HOME/.local/bin and refuses to replace an unrelated existing command. Override CADENCEAI_INSTALL_ROOT or CADENCEAI_BIN_DIR when needed.

## 2. Configure Starter mode

~~~
cadenceai setup
cadenceai doctor
~~~

Setup detects authenticated runtimes, lets you select normal-chat routing, and recommends:

- Economy engineering by default;
- a maximum of six model calls per task;
- local intent and risk classification;
- explicit preflight confirmation before multi-model work.

The settings live in $HOME/.config/cadenceai/config.json. Existing unrelated settings are preserved.

If a runtime needs attention, doctor prints the exact install or login command. CadenceAI uses credentials already managed by those tools. See the official setup guides for [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started), [Codex CLI](https://help.openai.com/en/articles/11096431), and [OpenCode](https://opencode.ai/v2/docs).

## 3. Start in a clean Git repository

~~~
cd /path/to/project
git status --short
cadenceai
~~~

The first launch in a project shows a tour without invoking a model. Reopen it with `/tour`. Type `/` to see command suggestions, press Tab to complete the first match, or use `/help <command>` for purpose, cost, safety, and examples.

Ask a normal question first:

~~~
What does this error mean?
~~~

Normal conversation makes one direct model call and does not activate repository tools.

To assess an implemented Linear ticket without changing anything:

~~~
/qa ELM-2851
~~~

The preflight shows six expected model calls. CadenceAI retrieves the ticket, comments, linked pull requests, diffs, and reported CI checks, then maps implementation evidence to each requirement. It does not execute untrusted PR code locally; missing test-execution evidence is reported as unverified.

Other read-only workflows are available when you need them:

~~~
/refine ELM-2851
/release ELM-2851 ELM-2852 and their linked PRs
/plan Improve developer onboarding without requiring API keys
/crossrepo Migrate the API contract across ./service and ./client
/handoff
~~~

Refinement uses three planned calls and handoff uses one. Release, planning, and cross-repository assessment use six by default. Handoffs are saved under `.cadence/handoffs/`. Cross-repository mode creates a coordinated plan but does not modify any repository.

## 4. Try an Economy engineering task

~~~
/budget economy
Implement a small documentation correction
~~~

CadenceAI requires a clean working tree and shows the expected model calls before starting. Press Enter to accept the preflight or type /cancel.

## 5. Review what changed

~~~
git status --short
git diff
~~~

CadenceAI reports verification results and changed files. It never commits, pushes, reverts, or deletes the result automatically.

## When a plan limit is reached

CadenceAI tries configured provider fallbacks and temporarily cools down providers that report allowance or rate-limit failures. The failed request and its frozen context remain available:

~~~
/usage
/model auto
/budget economy
/retry
~~~

The local usage ledger is not the provider's authoritative quota balance. For a temporary ceiling change, use /limit 8 or /limit off. Persist it through cadenceai setup or guardrails.maxModelCallsPerTask in configuration.

## Updating

~~~
cadenceai update
~~~

This prints checkout-aware, fast-forward-only update instructions. CadenceAI never updates itself in the background.

For a complete example, continue with the [ticket-to-handoff walkthrough](./WALKTHROUGH.md).

Maintainers and contributors should continue with the [development guide](./DEVELOPMENT.md) and [architecture guide](./ARCHITECTURE.md).
