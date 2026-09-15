# nuxt-files-sdk

Native-first [Files SDK](https://files-sdk.dev/docs) integration for Nuxt and Nitro.

- [Documentation source](./docs/content/index.md)
- [Installation](./docs/content/1.getting-started/2.installation.md)
- [Canonical compiled examples](./test/fixtures/nuxt4)

```bash
bun add nuxt-files-sdk
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['nuxt-files-sdk'] })
```

Run `bun run dev` to build the package once, then start the documentation site with both Nuxt DevTools integrations. Restart it after package source changes. Production serves the Markdown directly from GitHub through the Cloudflare Worker, so content-only updates do not require a new app deployment.

Cloudflare deployment settings are documented in [`docs/README.md`](./docs/README.md).
