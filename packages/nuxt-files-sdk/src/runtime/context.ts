import type { Files } from "files-sdk";

import type { FilesConfig } from "../config";
import { FilesRegistry, type StorageRegistry } from "./registry";

let registry: FilesRegistry | undefined;

export const setFilesRegistry = <C extends FilesConfig>(value: FilesRegistry<C>): void => {
  registry = value as FilesRegistry;
};

export const configureFiles = <const C extends FilesConfig>(
  config: C,
  options?: ConstructorParameters<typeof FilesRegistry<C>>[1],
): FilesRegistry<C> => {
  const value = new FilesRegistry(config, options);
  setFilesRegistry(value);
  return value;
};

export interface NuxtFilesStorageRegistry {
  default: Files;
}

export function useServerFiles(): Promise<NuxtFilesStorageRegistry["default"]>;
export function useServerFiles<Name extends keyof NuxtFilesStorageRegistry & string>(
  name: Name,
): Promise<NuxtFilesStorageRegistry[Name]>;
export function useServerFiles(name?: string): Promise<Files> {
  if (!registry) {
    throw new Error("[nuxt-files-sdk:not-configured] The Files registry has not been configured.");
  }
  return registry.get(name);
}

export type { StorageRegistry };
