# Repository guide

## Sources of truth

- Package/tool versions and compatibility ranges belong in `package.json`, package and fixture manifests, lockfiles, and `.github/workflows/ci.yml`, not prose. CI reads Bun from the root `packageManager` field.
- Run `bun run test`, not `bun test`: the former selects this repository's Vitest projects; the latter invokes Bun's separate test runner.
- Tests stay under `test/`. `test/contracts.ts` owns the contract ID, guarantee, test source, and blocking-job mapping. Keep IDs on executable tests or negative compilation cases; the unit project checks registration and CI coverage.
- For verification and release readiness, use `.agents/skills/verify-release/SKILL.md`. Keep durable repository constraints here and reproducible procedures in that skill, without duplicating reports under `docs/`.
- Canonical public examples live in `test/fixtures/nuxt4/`; generated-type tests compile them both locally and in a packed consumer. README prose is not a test input. Do not expand the README or create a documentation website unless requested.

## Architecture and invariants

- Keep Nuxt and standalone Nitro wiring in `packages/nuxt-files-sdk/src/integration/nitro.ts`. Use native framework generation hooks for runtime plugins and per-project declarations; normalize generated import paths for Windows.
- Preserve the public root/config/nitro/plugins/runtime entrypoints. Reuse native Files SDK methods, errors, provider names, plugin types, and factories instead of maintaining parallel implementations or a provider registry.
- `useServerFiles` synchronously constructs and memoizes the selected native client. Failed construction is not cached; native file operations remain asynchronous.
- Single-storage configuration is direct and supports unnamed access. Multiple storages are named and always require a name. Neither construction nor native operation failures switch provider or use devStorage. Development overrides retain the base plugins, hooks, and common options.
- Native environment keys and aliases take priority over NUXT aliases. Inject only the selected provider's declared keys during synchronous construction and remove them on success and failure.
- Keep native error identity and user-before-bridge hook order. A hook rejection must not replace a native operation result.
- Generated declarations augment the public runtime entrypoint and the installed Nitro hook namespace. Standalone fixtures use their native prepare/typecheck/build commands without installing Nuxt; retain the fixture's explicit type dependencies.
- Development uses one shared DevFrame UI and a metadata-only snapshot from the Nitro worker. Keep production, module opt-out, and disabled Nuxt DevTools paths inactive. Never expose storage config, credentials, or file contents in snapshots.
- Generate public static imports only for providers used by the active runtime mode. Keep credentials and provider construction lazy until `useServerFiles`; never restore the all-provider native loader as a runtime fallback. Fixture minification is explicit; do not override a consuming app's Nitro minify setting.

## Verification boundaries

- Keep GitHub's default CodeQL setup enabled for JavaScript/TypeScript and Actions; the main ruleset requires its code-scanning results before merging.
- `ci-ok` must directly await every blocking job and accept only `success`; failed, cancelled, or skipped jobs fail the gate. Nightly is visible but non-blocking. No change-detection job is needed: required checks also run for documentation/workflow changes.
- The supported matrix and runner/toolchain choices are defined by CI and manifests. Locked integration fixtures, minimum/latest-supported packed consumers, and platform coverage are distinct evidence; nightly resolution does not prove support for a future stable release.
- Release verifies successful push CI for the tagged commit, then tests the exact archive produced by `uppt/pack` through `NUXT_FILES_TARBALL`. Do not rebuild on that path. Only a successful artifact verification permits publishing the same uploaded archive; its SHA-256 must remain unchanged.
- Package checks cover exports, declarations, dependency boundaries, publint/ATTW, permitted contents, fresh consumer compilation/build/HTTP routes, and secret absence. Root typecheck also checks the unit type assertions; generated declarations have positive and negative compiler checks.
- Bundle checks exclude unused Vue, production DevFrame, standalone Nuxt Kit, unrelated native plugins, unused provider entrypoints, and external cloud SDK packages in fs-only apps. Provider entrypoints can retain their own optional internal engines, such as R2's AWS SDK path.
- Sizes are complete fixture deployment outputs, not this package's isolated contribution. Keep budgets in executable bundle tests; do not loosen them to conceal regressions. Optional SDK warnings are not by themselves runtime failures, but real route and output checks must pass.
- CI does not guarantee real cloud credentials/network access, every deploy preset, application authorization, unknown upstream changes, or complete interactive GUI coverage. File Explorer, gateway helpers, UI components, MCP, advanced telemetry, and a documentation website are outside the implemented scope.

## Historical summary

The local Windows verification on 2026-09-05–06 recorded 49 passing tests across 16 files and a separate 8-test minimum-compatible tarball run. Format, lint, source/test typecheck, workspace checks, unused checks, build-time package validators, benchmark, and whitespace checks passed. This is a historical result, not proof of current GitHub CI or publication.

That work replaced three shell harnesses with Vitest projects, shared the Nuxt/Nitro integration, added generated positive/negative type contracts, tested concurrent initialization and environment cleanup, and verified actual tarball consumers and exact-artifact release gating. DevFrame checks covered both native host registration paths and a real development-server snapshot, not full browser interaction. Initial unminified fixture measurements were roughly 2.81 MB server / 178 KB public for Nuxt and 1.01 MB server for Nitro; current measurements and ceilings belong in tests.

The subsequent 2026-09-06 investigation found two separate failures: CI's unused path-filter job tried to fetch an unavailable pre-rewrite commit, and the local public-example check expected code snippets removed from the README. The fixes remove that job and compile canonical fixture examples instead. Bun setup follows the manifest, the SDK consumer matrix follows the declared supported range, and native minify is enabled only in fixtures. These changes still require CI on the eventual pushed commit; local success does not establish release environment/OIDC readiness.

## Provider generation

[Issue #5: prepare-time provider imports](https://github.com/liria24/nuxt-files-sdk/issues/5) motivated the generated provider map. Nuxt/Nitro preparation evaluates only configuration structure, emits public imports for active providers, and leaves synchronous config resolvers untouched until runtime. Measure provider-owned optional engine imports separately from integration-wide provider inclusion.
