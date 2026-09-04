import {
  addImports,
  addServerPlugin,
  addTemplate,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";
import { resolve } from "node:path";

export interface ModuleOptions {
  /** Files configuration path, relative to the Nuxt root. */
  config: string;
  /** Enable development diagnostics integrations. */
  devtools: boolean;
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "nuxt-files-sdk",
    configKey: "files",
    compatibility: { nuxt: "^4.0.0 || >=5.0.0-0" },
  },
  defaults: {
    config: "files.config.ts",
    devtools: true,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    const configPath = resolve(nuxt.options.rootDir, options.config);
    const runtime = resolver.resolve("./runtime/context");

    const plugin = addTemplate({
      filename: "nuxt-files-sdk/server-plugin.mjs",
      getContents: () => `
import config from ${JSON.stringify(configPath)}
import { configureFiles } from ${JSON.stringify(runtime)}

export default defineNitroPlugin((nitroApp) => {
  configureFiles(config, {
    development: import.meta.dev,
    hooks: {
      onAction: (event, storage) => nitroApp.hooks.callHook('files:action', { event, storage }),
      onError: (event, storage) => nitroApp.hooks.callHook('files:error', { event, storage }),
      onRetry: (event, storage) => nitroApp.hooks.callHook('files:retry', { event, storage }),
    },
  })
})`,
    });
    addServerPlugin(plugin.dst);
    addImports({ name: "useServerFiles", from: runtime });
    for (const name of ["useFiles", "useFile", "useList", "useSearch"]) {
      addImports({ name, from: "files-sdk/vue" });
    }

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: resolver.resolve("./types") });
    });
  },
});

export * from "files-sdk";
export { configureFiles, useServerFiles } from "./runtime/context";
export { FilesRegistry } from "./runtime/registry";
export type { FilesForStorage, StorageRegistry } from "./runtime/registry";
