# Release contracts

This table is the product contract registry for v0.0.1. `META-001` fails when an ID has no executable test reference, its mapped source/job is missing, or a test introduces an unregistered ID. Test titles carry IDs; parameterized negative cases carry them in their input records. All listed jobs block `ci-ok`.

| ID          | Guarantee                                                                                                        | Test source                               | CI job          |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------- |
| META-001    | Every registered contract has an executable test reference and a blocking job                                    | `test/unit/contracts.test.ts`             | `unit`          |
| CFG-001     | Nuxt discovers the root files.config.ts and initializes its declared storage                                     | `test/nuxt/suite.ts`                      | `test-nuxt4`    |
| CFG-002     | Explicit defaults work and ambiguous unnamed runtime access fails                                                | `test/unit/registry.test.ts`              | `unit`          |
| CFG-003     | Production initialization failures never use devStorage as fallback                                              | `test/unit/registry.test.ts`              | `unit`          |
| CFG-004     | Development overrides preserve base plugins and native hooks                                                     | `test/unit/registry.test.ts`              | `unit`          |
| CFG-005     | Single, named-default, and ambiguous storage types match default selection                                       | `test/unit/config.test.ts`                | `typecheck`     |
| CFG-006     | Provider initialization failure never attempts HTTP or another provider                                          | `test/unit/no-fallback.test.ts`           | `unit`          |
| CFG-007     | Native operation failure never switches storage or wraps its error                                               | `test/unit/no-fallback.test.ts`           | `unit`          |
| API-001     | useServerFiles returns the cached initialization Promise                                                         | `test/unit/registry.test.ts`              | `unit`          |
| API-002     | Named storage preserves native Files methods and plugin extensions                                               | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| API-003     | Explicit default storage preserves its plugin extensions                                                         | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| TYPE-001    | Actual generated consumer types preserve native and plugin surfaces                                              | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| TYPE-002    | Unknown storage names fail compilation with an argument type error                                               | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| TYPE-003    | Unknown adapter names fail compilation                                                                           | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| TYPE-004    | devStorage cannot replace plugins                                                                                | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| TYPE-005    | devStorage cannot replace hooks                                                                                  | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| TYPE-006    | Standalone Nitro generates storage, default/plugin, and major-specific hook declarations                         | `test/nitro/suite.ts`                     | `test-nitro3`   |
| ENV-001     | Native environment keys and aliases take precedence over NUXT aliases                                            | `test/unit/environment.test.ts`           | `unit`          |
| ENV-002     | Only keys declared by the selected provider may be injected                                                      | `test/unit/environment.test.ts`           | `unit`          |
| ENV-003     | Temporary aliases are removed on success and failure                                                             | `test/unit/environment.test.ts`           | `unit`          |
| ENV-004     | Concurrent bridge users cannot observe another initialization's cleanup                                          | `test/unit/environment.test.ts`           | `unit`          |
| RUNTIME-001 | 100 concurrent calls initialize one shared storage instance                                                      | `test/unit/registry.test.ts`              | `unit`          |
| RUNTIME-002 | Multiple storages initialize independently, including partial failure                                            | `test/unit/registry.test.ts`              | `unit`          |
| RUNTIME-003 | Failed initialization is evicted and can be retried                                                              | `test/unit/registry.test.ts`              | `unit`          |
| HOOK-001    | User and Nitro bridge hooks run in order; rejection does not break operations                                    | `test/unit/registry.test.ts`              | `unit`          |
| ERR-001     | Invalid config, unknown names, and ambiguous defaults have stable integration codes                              | `test/unit/registry.test.ts`              | `unit`          |
| ERR-002     | Native FilesError identity and code survive initialization failures                                              | `test/unit/registry.test.ts`              | `unit`          |
| NUXT-001    | Real Nuxt runtime routes receive the configured Files instances                                                  | `test/nuxt/suite.ts`                      | `test-nuxt4`    |
| NUXT-002    | Native Vue composable auto-imports compile and build                                                             | `test/nuxt/vue.test.ts`                   | `test-nuxt4`    |
| NITRO-001   | Nitro v2/v3 prepare, typecheck, build, and serve the Files route                                                 | `test/nitro/suite.ts`                     | `test-nitro2`   |
| DEV-001     | Production, module opt-out, and disabled Nuxt DevTools disable the DevFrame                                      | `test/nuxt/devtools.test.ts`              | `test-nuxt4`    |
| DEV-002     | DevTools v3 registers a single iframe for the shared UI                                                          | `test/nuxt/devtools.test.ts`              | `test-nuxt4`    |
| DEV-003     | DevTools v4 registers the native DevFrame-ready host                                                             | `test/nuxt/devtools.test.ts`              | `test-nuxt4`    |
| DEV-004     | The development host serves the shared UI and the actual configured registry snapshot                            | `test/nuxt/nuxt4-devframe.test.ts`        | `test-nuxt4`    |
| BUNDLE-001  | Server-only Nuxt does not include files-sdk/vue                                                                  | `test/bundle/bundle.test.ts`              | `test-size`     |
| BUNDLE-002  | Production excludes DevFrame and development host code                                                           | `test/bundle/bundle.test.ts`              | `test-size`     |
| BUNDLE-003  | fs consumers do not ship external AWS/Azure/Google SDK packages                                                  | `test/bundle/bundle.test.ts`              | `test-size`     |
| BUNDLE-004  | A versioning-only import excludes unrelated built-in plugin entrypoints                                          | `test/bundle/bundle.test.ts`              | `test-size`     |
| BUNDLE-005  | Standalone Nitro excludes Nuxt Kit, DevTools, and Files Vue runtime                                              | `test/bundle/bundle.test.ts`              | `test-size`     |
| BUNDLE-006  | Deployment sizes are measured; established Nuxt output budgets are enforced                                      | `test/bundle/bundle.test.ts`              | `test-size`     |
| SEC-001     | Dummy secrets are absent from production and generated outputs                                                   | `test/bundle/bundle.test.ts`              | `test-size`     |
| SEC-002     | DevFrame snapshots contain only safe metadata and diagnostics                                                    | `test/unit/registry.test.ts`              | `unit`          |
| SEC-003     | The packed artifact contains no dummy secret                                                                     | `test/consumer/packed.test.ts`            | `test-consumer` |
| PKG-001     | Required JavaScript and declaration entrypoints are packed                                                       | `test/consumer/packed.test.ts`            | `test-consumer` |
| PKG-002     | The tarball contains only distribution files and public package metadata                                         | `test/consumer/packed.test.ts`            | `test-consumer` |
| PKG-003     | Exports and dependency/optional-peer boundaries are explicit                                                     | `test/consumer/packed.test.ts`            | `test-consumer` |
| PKG-004     | Fresh Nuxt/Nitro consumers install the tarball, typecheck, build, and run with bundle/security boundaries intact | `test/consumer/packed.test.ts`            | `test-consumer` |
| PKG-005     | publint and ATTW validate the actual tarball                                                                     | `test/consumer/packed.test.ts`            | `test-consumer` |
| DOCS-001    | README examples and native public types compile against generated declarations                                   | `test/nuxt/nuxt4-generated-types.test.ts` | `test-nuxt4`    |
| REL-001     | Consumer verification leaves the release tarball SHA-256 unchanged                                               | `test/consumer/packed.test.ts`            | `test-consumer` |
| REL-002     | ci-ok directly gates every blocking job, and release verifies the tarball before publishing                      | `test/unit/contracts.test.ts`             | `unit`          |

See [release readiness](release-readiness.md) for the compatibility matrix, upstream constraints, and the limits of these guarantees. The future `content/` documentation site is outside this change; README examples are executable today.
