#!/usr/bin/env bash
set -euo pipefail
fixture="test/fixtures/$1"
bun install --cwd "$fixture"
bun run --cwd packages/nuxt-files-sdk build
bun run --cwd "$fixture" prepare
if [[ "$1" == nuxt* ]]; then bun run --cwd "$fixture" typecheck; fi
bun run --cwd "$fixture" build
