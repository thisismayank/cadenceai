# Release and maintenance process

CadenceAI is an internal alpha and does not yet publish an npm package. Releases currently mean a validated commit on protected `master` and an updated installer checkout.

## Version sources

The CLI version currently appears in:

- `apps/cli/package.json`
- `CLI_VERSION` in `apps/cli/src/commands.ts`

Keep them equal. The root workspace version is not the installed CLI version.

## Pull-request gate

Before requesting review:

```bash
pnpm validate
git diff --check
```

The protected `master` branch requires:

- a pull request;
- one approving review;
- the `Validate` status check;
- an up-to-date branch;
- resolved conversations;
- linear history;
- no force pushes or branch deletion.

Repository administrators retain an emergency bypass during the internal alpha. Do not use it for normal development.

## Release checklist

1. Update the two CLI version sources.
2. Add user-visible changes to `CHANGELOG.md`.
3. Update README, quickstart, workflow, configuration, provider, troubleshooting, or architecture docs as applicable.
4. Run `pnpm validate` and `git diff --check`.
5. Build and smoke-test:

   ```bash
   pnpm --filter @cadenceai/cli build
   ./apps/cli/dist/index.js --version
   ./apps/cli/dist/index.js quickstart
   ```

6. Test the installer in a temporary location when installer or linking behavior changed.
7. Open a pull request and wait for `Validate` and review.
8. Merge using a method compatible with linear history, preferably squash or rebase.
9. Verify `master` and `origin/master` match.
10. If publishing a tagged release, create an annotated semantic-version tag only after the merge.

## Updating installations

`cadenceai update` prints fast-forward-only instructions for source checkouts. The installer can also be rerun. CadenceAI does not self-update in the background.

## Rollback

Never rewrite protected `master`. Revert the offending merge through a new pull request, run the same validation, and document the rollback in the changelog.

If branch protection itself blocks emergency recovery, a repository administrator may temporarily bypass it. Record the reason and restore protection immediately.

## Future public release requirements

Before calling CadenceAI a public open-source release:

- choose and add an explicit license;
- finalize contribution and security-reporting policies;
- publish immutable release artifacts or a package;
- automate version consistency and changelog validation;
- pin third-party GitHub Actions to reviewed commit SHAs;
- add supported-platform and compatibility testing.
