import { Files, type ExtensionsOf, type FilesPlugin } from "files-sdk";
import { loadFiles } from "files-sdk/loader";

import type { FilesConfig, StorageConfig } from "../config";

export type FilesForStorage<T extends StorageConfig> = Files &
  ExtensionsOf<NonNullable<T["plugins"]>>;

export type StorageRegistry<C extends FilesConfig> = {
  [Name in keyof C["storage"]]: FilesForStorage<C["storage"][Name]>;
};

export interface FilesRuntimeHooks {
  onError?: (event: unknown, storage: string) => void;
  onAction?: (event: unknown, storage: string) => void;
  onRetry?: (event: unknown, storage: string) => void;
}

export class FilesRegistry<const C extends FilesConfig = FilesConfig> {
  readonly #config: C;
  readonly #development: boolean;
  readonly #hooks: FilesRuntimeHooks;
  readonly #instances = new Map<string, Promise<Files>>();

  constructor(config: C, options: { development?: boolean; hooks?: FilesRuntimeHooks } = {}) {
    if (!config.storage || Object.keys(config.storage).length === 0) {
      throw new Error("[nuxt-files-sdk:invalid-config] At least one storage is required.");
    }
    this.#config = config;
    this.#development = options.development ?? false;
    this.#hooks = options.hooks ?? {};
  }

  get<Name extends keyof C["storage"] & string>(name?: Name): Promise<StorageRegistry<C>[Name]> {
    const resolvedName = name ?? this.#defaultName();
    if (!(resolvedName in this.#config.storage)) {
      throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${resolvedName}".`);
    }
    let instance = this.#instances.get(resolvedName);
    if (!instance) {
      instance = this.#create(resolvedName);
      this.#instances.set(resolvedName, instance);
    }
    return instance as Promise<StorageRegistry<C>[Name]>;
  }

  #defaultName(): string {
    if (this.#config.default) return this.#config.default;
    const names = Object.keys(this.#config.storage);
    if (names.length === 1 && names[0]) return names[0];
    if ("default" in this.#config.storage) return "default";
    throw new Error("[nuxt-files-sdk:storage-name-required] A storage name is required.");
  }

  async #create(name: string): Promise<Files> {
    const base = this.#config.storage[name];
    const override = this.#development ? this.#config.devStorage?.[name] : undefined;
    const selected = override ?? base;
    if (!selected) throw new Error(`[nuxt-files-sdk:unknown-storage] Unknown storage "${name}".`);
    const { adapter, plugins, ...options } = selected;
    const loaded = await loadFiles({ ...withNuxtEnvironment(options), provider: adapter });
    return new Files({
      adapter: loaded.files.adapter,
      hooks: {
        onAction: (event) => this.#hooks.onAction?.(event, name),
        onError: (event) => this.#hooks.onError?.(event, name),
        onRetry: (event) => this.#hooks.onRetry?.(event, name),
      },
      plugins: plugins as readonly FilesPlugin[] | undefined,
      prefix: options.prefix,
      retries: options.retries,
      timeout: options.timeout,
    });
  }
}

/** Add generic NUXT_ aliases without duplicating provider-specific metadata. */
export const withNuxtEnvironment = <T extends Record<string, unknown>>(options: T): T => {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("NUXT_") || value === undefined) continue;
    const nativeKey = key.slice(5);
    if (process.env[nativeKey] === undefined) process.env[nativeKey] = value;
  }
  return options;
};
