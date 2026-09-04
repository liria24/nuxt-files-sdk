# nuxt-files-sdk

Native-first integration of [Files SDK](https://github.com/haydenbleasel/files-sdk) with Nuxt and Nitro.

> This repository is under initial development. No `0.0.1` release has been published.

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ["nuxt-files-sdk"] });
```

```ts
// files.config.ts (project root)
import { defineFilesConfig } from "nuxt-files-sdk/config";
import { validation, versioning } from "nuxt-files-sdk/plugins";

export default defineFilesConfig({
  storage: {
    blob: {
      adapter: "r2",
      plugins: [validation({ maxSize: 10_000_000 }), versioning({ limit: 10 })],
    },
  },
  devStorage: { blob: { adapter: "fs", root: ".data/files/blob" } },
});
```

```ts
const files = await useServerFiles("blob");
await files.upload("hello.txt", "hello");
```

Detailed documentation lives in [`content/`](./content/).
