---
name: verify-release
description: Verify nuxt-files-sdk changes, diagnose its local or CI test failures, and assess release readiness using the repository's contract tests and exact packed-artifact checks. Use for this repository's verification or release review, not to publish a release without authorization.
---

# Verify nuxt-files-sdk

Work from the repository root. Read [AGENTS.md](../../../AGENTS.md), root/package manifests, relevant fixture manifests and lockfiles, and `.github/workflows/ci.yml` for current constraints, versions, and compatibility selections. Do not copy version requirements into this skill or reports as fixed guidance.

## Local checks

- Use `bun run test`, never substitute `bun test`; the package script selects Vitest and its isolated projects. If a report used the latter, reproduce with the configured runner before attributing failures to CI.
- `bun run check` covers format, lint, workspace/unused checks, source and test typecheck, all Vitest projects, and the package build. Run `bun run benchmark` separately. For a narrow failure, start with the affected `test:*` script in `package.json`, then run the relevant broader checks before claiming completion.
- Reuse `test/utils/fixture.ts` and `test/utils/generated-types.ts`. Heavy projects share generated output and must remain serial. Stable fixture installs use frozen lockfiles; nightly intentionally resolves separately and may change its lockfile. Inspect any resulting tracked diff rather than including unrelated dependency updates silently.
- Root typecheck alone is insufficient: run the real framework prepare/typecheck/build flows, positive examples, and negative cases against generated declarations. Canonical examples are fixture files, not README snippets.
- Use fixture dummy secrets only. Check generated files, deployment output, tarball, build logs, and the metadata-only snapshot through the existing contracts. Optional provider SDK resolution warnings do not justify dropping HTTP-route or bundle assertions.

## Compatibility and packed artifact

- Read minimum and latest-supported values from CI's consumer matrix. Run `bun run test:consumer` for each set with `NUXT_FILES_SDK_VERSION`, `NUXT_FILES_NUXT_VERSION`, and `NUXT_FILES_NITRO2_VERSION` set to that row; restore the caller's environment afterward. The helper creates fresh consumers and applies the SDK override throughout their dependency trees.
- When given a release archive, set `NUXT_FILES_TARBALL` to its absolute path and run `bun run test:consumer`. The test must inspect/install that archive without rebuilding it, then confirm its SHA-256 is unchanged. Do not substitute a fresh workspace tarball for the supplied artifact.
- Preserve publint/ATTW, contents/exports/dependency checks, isolated Nuxt and standalone Nitro compilation/build/HTTP checks, plugin and cloud-SDK exclusion, and secret scans. Nitro-only consumers must not acquire Nuxt to make typechecks pass.
- `bun run test:size` measures complete fixture output and enforces the existing Nuxt budgets. Native minify is enabled in fixtures, not forced by the module; provider-code pruning remains deferred in the issue linked from AGENTS.md. Compare equivalent configurations, and do not turn byte reductions into unsupported startup-performance claims.

## CI and release conclusion

- Inspect the failing commit and first failed job before changing workflow logic. Required checks must run even for docs/workflow-only changes. Every blocking job must be a direct `ci-ok` dependency, and failure/cancellation/skipping must fail that gate; nightly is the explicit exception.
- Use `.github/workflows/release.yml` as the release procedure: successful push CI for the tagged SHA, exact `uppt/pack` archive verification, then publication of that same uploaded artifact. Verify this ordering without triggering a tag, push, or publish unless the user requested it.
- Finish with actual commands/results, compatibility selections, material warnings or failures, and what was not run. Distinguish local results, remote CI, and publication/OIDC readiness. Run `git diff --check` and inspect tracked changes; never present a historical report or a green local run as current remote CI evidence.
