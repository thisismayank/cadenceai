import { NodeProcessRunner, type ProcessRunner } from "@cadenceai/agents";

export type GitWorktreeState = {
  isGitRepository: boolean;
  clean: boolean;
  changes: string[];
};

export async function inspectGitWorktree(
  cwd: string,
  runner: ProcessRunner = new NodeProcessRunner(),
): Promise<GitWorktreeState> {
  const repository = await runner.run({
    command: "git",
    args: ["rev-parse", "--is-inside-work-tree"],
    cwd,
    timeoutMs: 5_000,
  });
  if (repository.exitCode !== 0 || repository.stdout.trim() !== "true") {
    return { isGitRepository: false, clean: false, changes: [] };
  }
  const status = await runner.run({
    command: "git",
    args: ["status", "--porcelain=v1", "--untracked-files=all"],
    cwd,
    timeoutMs: 10_000,
  });
  if (status.exitCode !== 0) throw new Error(`Could not inspect Git worktree: ${status.stderr.trim() || `exit ${status.exitCode}`}`);
  const changes = status.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isCadenceState(line));
  return { isGitRepository: true, clean: changes.length === 0, changes };
}

export function formatGitSafetyBlock(state: GitWorktreeState): string {
  if (!state.isGitRepository) {
    return "Engineering requires a Git repository so changes can be reviewed and recovered safely. Initialize Git and commit the starting state before trying again.";
  }
  if (state.clean) return "Git safety: clean working tree.";
  return [
    "Engineering requires a clean Git working tree. CadenceAI did not invoke a model or modify files.",
    "",
    ...state.changes.slice(0, 12).map((change) => `  ${change}`),
    ...(state.changes.length > 12 ? [`  …and ${state.changes.length - 12} more`] : []),
    "",
    "Commit or stash these changes, then submit the task again.",
  ].join("\n");
}

export function formatGitChanges(state: GitWorktreeState): string {
  if (!state.isGitRepository) return "Changed files could not be determined because the target is not a Git repository.";
  if (state.clean) return "Changed files: none.";
  return [
    "Changed files",
    ...state.changes.map((change) => `  ${change}`),
    "",
    "Review with: git status --short && git diff",
    "CadenceAI did not commit these changes. Use normal Git restore/clean commands deliberately if you decide to discard them.",
  ].join("\n");
}

function isCadenceState(statusLine: string): boolean {
  const path = statusLine.slice(3).replace(/^"|"$/g, "");
  return path === ".cadence" || path.startsWith(".cadence/");
}
