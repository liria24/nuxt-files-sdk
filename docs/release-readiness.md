# Release readiness

A successful `ci-ok` means every blocking job ran successfully for that commit. `failure`, `cancelled`, and `skipped` all fail the gate. Path detection remains available for diagnostics, but does not skip verification: documentation and workflow-only changes can affect release contracts too.

The [contract registry](contracts.md) is checked by the unit project. Root typecheck also compiles unit type assertions. Nuxt integration uses Vitest and `@nuxt/test-utils/e2e`; generated declarations have separate positive and negative compilation checks. Nitro uses major-isolated fixtures and native CLIs. The three former shell test harnesses are removed.

## Blocking compatibility

| Surface    | Coverage                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node / Bun | Node 24, Bun 1.4.0 in CI                                                                                                                                                  |
| Nuxt       | 4.0.0 minimum and newest version within ^4.0.0 in packed consumers; locked Nuxt 4 integration on Linux and Windows                                                        |
| Nitro v2   | 2.13.0 minimum and newest version within ^2.13.0 in packed consumers; isolated integration fixture                                                                        |
| Nitro v3   | Current fixture resolution of ^3.0.0-alpha.0, including generated storage and hook types, without installing Nuxt                                                         |
| Files SDK  | 2.3.0 minimum and newest version within ^2.3.0, forced throughout each fresh consumer using an override                                                                   |
| TypeScript | Consumer declarations are checked with the fixture's TypeScript 6 toolchain; source declarations are built/checked with TypeScript 7. No support claim for older versions |

Nuxt 5 nightly is visible but non-blocking. The compatibility jobs deliberately resolve the latest version within each supported major; the workspace toolchain uses the committed lockfile. Fixture dependency trees are separate and heavy tests run serially to prevent generated files from racing.

## Exact artifact gate

The release workflow requires successful push CI, including `ci-ok`, for the tagged commit. The existing `uppt` release and preview flows are retained. After `uppt/pack` creates and uploads a tarball, `NUXT_FILES_TARBALL` supplies that same file to the consumer project; it does not rebuild the package. The project runs publint, ATTW, contents/exports/dependency checks, then installs it into fresh Nuxt 4, Nitro v2, and Nitro v3 apps. Those apps prepare, typecheck, build, run a real route, and undergo bundle/secret checks. A SHA-256 comparison proves testing did not mutate the archive. Only a successful pack-and-verify job permits `uppt/publish` to download and publish the uploaded archive.

This is release-time exact-artifact verification, rather than cross-workflow reuse of a development CI tarball. A release tag may contain its own version metadata, but its final archive must pass the same packed consumer tests before publication.

## Known limits and upstream work

- Files SDK's provider-aware loader retains provider modules and optional import metadata in the production trace, even for fs-only apps. Both integration and native packages are inlined using Nitro's native external configuration so unused plugin exports are tree-shaken, including in installed tarball consumers. External AWS/Azure/Google SDK packages and unrelated plugin entrypoints/implementations are forbidden; a claim of one-provider-only code is not made. An upstream statically resolvable provider loader is needed to reduce that graph without a duplicate provider registry here.
- Native provider option types are not fully represented by `LoadFilesOptions`. Adapter names use `ProviderSlug`; an upstream generic provider-options mapping is needed for complete option inference.
- Temporary NUXT environment aliases are serialized across this module's bridge users. Native aliases win, and injected keys are removed on success and failure. Unrelated code that reads or writes the same global environment during initialization remains outside that lock. Replace the bridge with an upstream injectable environment resolver when available; keep credentials in native environment variables or explicit options where possible.
- Nitro 2.13.0 and current v3 omit `meta.majorVersion`; the shared integration distinguishes those versions using v3's native routing API. Nitro v3 disables tsconfig generation by default and requires explicit runtime imports. Its fixture enables native tsconfig generation and supplies `hookable` as a development dependency because Nitro's published hook declarations import it without declaring a runtime dependency.
- DevTools v3 iframe registration and v4 native dock/static-host registration are tested. An actual Nuxt development server serves the shared UI and the Nitro-worker snapshot. Local generated plugins/config are inlined in development, but the native Files SDK loader stays external to preserve lazy provider imports in Nitro's single-file dev output. A full interactive browser session is not a release guarantee. The shared DevFrame exposes metadata only, with no File Explorer.
- Nuxt deployment size baselines were measured at roughly 2.81 MB server / 178 KB public, with 3.5 MB / 250 KB initial ceilings. Nitro measured roughly 1.01 MB and is reported without a hard budget until its cross-version baseline is stable. These are complete fixture outputs, not isolated package contribution. Base-versus-head size comparison remains informational future work.

CI does not guarantee real cloud provider availability, unknown future upstream regressions, application authorization rules, or every consumer-specific deployment environment. Cloud network tests, a documentation website under `content/`, File Explorer, gateway helpers, UI components, MCP, and advanced telemetry are outside v0.0.1's current scope.
