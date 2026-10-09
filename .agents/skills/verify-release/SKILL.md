---
name: verify-release
description: Verify nuxt-files-sdk changes, diagnose its local or CI test failures, and assess release readiness using the repository's contract tests and exact packed-artifact checks. Use for this repository's verification or release review, not to publish a release without authorization.
---

# Verify nuxt-files-sdk

Work from the repository root. Read [AGENTS.md](../../../AGENTS.md), root/package manifests, relevant fixture manifests and lockfiles, and `.github/workflows/ci.yml` for current constraints, versions, and compatibility selections. Do not copy version requirements into this skill or reports as fixed guidance.

## Local checks

- Renovate uses the native Bun manager for the root and fixture locks. SDK updates are
  dashboard-gated: the reviewer runs `bun run peers:sync --write`, regenerates existing root
  and affected fixture locks with the pinned Bun, then runs `bun run peers:sync --check` and
  the minimum/latest consumer matrix in the same PR. Generated optional peers are excluded
  from independent bot updates; hosted Renovate does not execute this generator. Preserve
  nightly aliases and fixture TypeScript compatibility independently of the root toolchain.

- Use `bun run test`, never substitute `bun test`; the package script selects Vitest and its isolated projects. If a report used the latter, reproduce with the configured runner before attributing failures to CI.
- `bun run check` (or `vp run check`) covers Vite+ format/lint, workspace/unused checks, source and test typecheck, all eight test projects, and the package build. Run `bun run benchmark` separately. For a narrow failure, start with the affected `test:*` script in `package.json`, then run the relevant broader checks before claiming completion.
- Reuse `test/utils/fixture.ts` and `test/utils/generated-types.ts`. Heavy projects share generated output and must remain serial. Stable fixture installs use frozen lockfiles; nightly intentionally resolves separately and may change its lockfile. Inspect any resulting tracked diff rather than including unrelated dependency updates silently.
- After changing the owned SDK, run `bun run peers:sync --write`, update lockfiles, then run `bun run peers:sync --check`. Review adapter import/conditional-dependency conformance without adding native file-operation tests. `bun run benchmark:integration` records startup, generation and installed/output sizes; timing is informational.
- Root typecheck alone is insufficient: run the real framework prepare/typecheck/build flows, positive examples, and negative cases against generated declarations. Canonical examples are fixture files, not README snippets.
- Cover explicit runtime imports and server auto-imports against the shared registry, public `RequestEvent` body/context/response/signal forwarding, runtime Gateway secret precedence, and native SDK token acceptance/rejection. A source-level signal check is not a client-disconnect test; report the native Nuxt/Nitro transport's limits separately.
- Use fixture dummy secrets only. Check generated files, deployment output, tarball, build logs, and the metadata-only snapshot through the existing contracts. Optional provider SDK resolution warnings do not justify dropping HTTP-route or bundle assertions.

## Integration measurements

- Run `bun run benchmark:integration /absolute/path/to/report.json`; the output path is one positional argument. Save the command log and JSON outside the checkout, with the actual toolchain, framework versions, commit, and transport setting.
- Stable fixture installs are frozen. Prepare, typecheck, and build production first; measure `.nuxt/nuxt-files-sdk` together with `node_modules/.cache/nuxt/.nuxt/nuxt-files-sdk`, or the standalone Nitro generation directories, before dev startup creates additional files. Keep the per-directory breakdown so a missing directory cannot masquerade as a reduction.
- The benchmark defaults to Nitro's official TCP worker transport through `NITRO_NO_UNIX_SOCKET=1`, avoiding restricted Linux abstract sockets. Use the same setting in both comparison runs; do not patch framework internals or claim this verifies every deployment transport.
- Compare fresh baseline and changed checkouts on the same machine with equivalent dependency/cache state. Report each timing and byte metric separately; improvements in some measurements and regressions in others are a mixed result.
- Historical Phase A commit `fb6242a7bebb54f850d57aa937b6bc07ef0d2b97` used locked Nuxt 4.5.2. Its original Nuxt generated metric was 15,425 bytes and omitted 15,525 cached production bytes; the comparable historical total was 30,950 bytes. Keep that correction distinct from a new report. Lost artifacts must be remeasured, never recreated as original files from recalled values.

## Compatibility and packed artifact

- Read minimum and latest-supported values from CI's consumer matrix. Run `bun run test:consumer` for each set with `NUXT_FILES_NUXT_VERSION` and `NUXT_FILES_NITRO2_VERSION` set to that row; restore the caller's environment afterward. Use the same `NUXT_FILES_TARBALL` for all rows and package managers. The SDK is the archive's exact normal dependency, never a consumer override. The pnpm consumer also covers non-hoisting, a workspace Layer and a competing SDK.
- Verify the stable Nuxt and standalone Nitro targets separately from experimental targets. The Nuxt 5 fixture must install and assert the actual distributed package version, then exercise real build/HTTP and development paths. The Vite server fixture must build/typecheck and serve basic Files SSR, exclude Files DevTools, and reject configured Gateway routes. Experimental CI results remain visible but non-blocking; they do not widen stable support.
- When given a release archive, set `NUXT_FILES_TARBALL` to its absolute path and run `bun run test:consumer`. The test must inspect/install that archive without rebuilding it, then confirm its SHA-256 is unchanged. Do not substitute a fresh workspace tarball for the supplied artifact.
- Preserve publint/ATTW, contents/exports/dependency checks, isolated Nuxt and standalone Nitro compilation/build/HTTP checks, plugin and cloud-SDK exclusion, and secret scans. Nitro-only consumers must not acquire Nuxt to make typechecks pass.
- `bun run test:size` measures complete fixture output and enforces the existing Nuxt budgets. Native minify is enabled in fixtures, not forced by the module; only active provider entrypoints are generated. Compare equivalent configurations, and do not turn byte reductions into unsupported startup-performance claims.

## CI and release conclusion

- `packages/nuxt-files-sdk/package.json` version is owned by `uppt`. Do not edit it manually during feature work, dependency updates, or release preparation; let `uppt` set it during release versioning.
- Inspect the failing commit and first failed job before changing workflow logic. Required checks must run even for docs/workflow-only changes. Every blocking job must be a direct `ci-ok` dependency, and failure/cancellation/skipping must fail that gate; nightly is the explicit exception.
- Use `.github/workflows/release.yml` as the release procedure: successful push CI for the tagged SHA, exact `uppt/pack` archive verification, then publication of that same uploaded artifact. Verify this ordering without triggering a tag, push, or publish unless the user requested it.
- Finish with actual commands/results, compatibility selections, material warnings or failures, and what was not run. Distinguish local results, remote CI, and publication/OIDC readiness. Run `git diff --check` and inspect tracked changes; never present a historical report or a green local run as current remote CI evidence.
