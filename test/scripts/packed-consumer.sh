#!/usr/bin/env bash
set -euo pipefail
root="$PWD"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
bun run build
tarball="$(bun pm pack --cwd packages/nuxt-files-sdk --destination "$tmp" | tail -n 1)"
tarball="$(cd "$tmp" && pwd)/$(basename "$tarball")"
for fixture in nuxt4 nitro-v2 nitro-v3; do
  cp -R "test/fixtures/$fixture" "$tmp/$fixture"
  node -e "const fs=require('fs');const p='$tmp/$fixture/package.json';const j=require(p);j.dependencies['nuxt-files-sdk']='file:$tarball';fs.writeFileSync(p,JSON.stringify(j,null,2))"
  bun install --cwd "$tmp/$fixture"
  bun run --cwd "$tmp/$fixture" prepare
  if [[ "$fixture" == nuxt4 ]]; then bun run --cwd "$tmp/$fixture" typecheck; fi
  bun run --cwd "$tmp/$fixture" build
done
