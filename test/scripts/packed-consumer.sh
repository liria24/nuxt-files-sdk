#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
bun run build
bun pm pack --cwd packages/nuxt-files-sdk --destination "$tmp"
tarball="$(find "$tmp" -maxdepth 1 -name '*.tgz' -print -quit)"
for fixture in nuxt4 nitro-v2 nitro-v3; do
  cp -R "test/fixtures/$fixture" "$tmp/$fixture"
  node -e "const fs=require('fs');const [p,t]=process.argv.slice(1);const j=require(p);j.dependencies['nuxt-files-sdk']='file:'+t;fs.writeFileSync(p,JSON.stringify(j,null,2))" "$tmp/$fixture/package.json" "$tarball"
  bun install --cwd "$tmp/$fixture" --ignore-scripts
  bun run --cwd "$tmp/$fixture" prepare
  if [[ "$fixture" == nuxt4 ]]; then bun run --cwd "$tmp/$fixture" typecheck; fi
  bun run --cwd "$tmp/$fixture" build
done
