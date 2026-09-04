#!/usr/bin/env bash
set -euo pipefail
bun run test:nuxt4
output=test/fixtures/nuxt4/.output
for forbidden in 'files-sdk/vue' 'devframe' '@vitejs/devtools' '@nuxt/devtools-kit'; do
  if rg -l --fixed-strings "$forbidden" "$output"; then
    echo "Forbidden client/DevTools runtime found: $forbidden" >&2
    exit 1
  fi
done
