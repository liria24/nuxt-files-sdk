<p align="center">
  <img alt="nuxt-files-sdk" src="https://shieldcn.dev/header/transparent.svg?title=Nuxt+Files+SDK&amp;subtitle=Native-first+Files+SDK+integration+for+Nuxt+and+Nitro.&amp;logo=nuxt&amp;mode=dark&amp;font=geist&amp;border=false" />
</p>

<p align="center">
  <a href="https://npmx.dev/package/nuxt-files-sdk"><img alt="badge" src="https://shieldcn.dev/npm/nuxt-files-sdk.svg?size=xs&amp;font=geist&amp;split=true" /></a>
  <a href="https://github.com/liria24/nuxt-files-sdk"><img alt="license" src="https://shieldcn.dev/github/liria24/nuxt-files-sdk/license.svg?size=xs&amp;font=geist&amp;split=true" /></a>
  <a href="https://github.com/liria24/nuxt-files-sdk/actions"><img alt="CI" src="https://shieldcn.dev/github/liria24/nuxt-files-sdk/ci.svg?size=xs&amp;font=geist&amp;split=true" /></a>
  <a href="https://github.com/liria24/nuxt-files-sdk/commits"><img alt="last commit" src="https://shieldcn.dev/github/liria24/nuxt-files-sdk/last-commit.svg?size=xs&amp;font=geist&amp;split=true" /></a>
</p>

<p align="center">
Unofficial <a href="https://files-sdk.dev">Files SDK</a> integration for Nuxt and Nitro.
</p>

<p align="center">
Docs: <a href="https://nuxt-files-sdk.liria.me">https://nuxt-files-sdk.liria.me</a>
</p>

This unofficial project includes independent Vue ports based on the MIT-licensed [Files SDK UI](https://files-sdk.dev/docs/ui). It is not affiliated with, endorsed by, or maintained by Files SDK or its maintainers.

```bash
npm i nuxt-files-sdk
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['nuxt-files-sdk'],
})

// files.config.ts
export default defineFilesConfig({
    storage: {
        adapter: 'fs',
        config: { root: '.data/files-devtools' },
    },
})
```

<p align="center">
  <a href="https://github.com/liria24/nuxt-files-sdk/graphs/contributors"><img alt="contributors" src="https://shieldcn.dev/contributors/liria24/nuxt-files-sdk.svg?title=false&amp;mode=dark&amp;font=geist" /></a>
</p>

<p align="center">
  <img alt="npm downloads chart" src="https://shieldcn.dev/chart/npm/nuxt-files-sdk.svg?font=geist&amp;logo=false&amp;height=300" />
</p>
