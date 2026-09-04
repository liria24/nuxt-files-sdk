import { describe, expect, test } from "vitest";

import { defineFilesConfig } from "../src/config";
import { FilesRegistry, withNuxtEnvironment } from "../src/runtime/registry";

describe("configuration", () => {
  test("preserves inferred configuration", () => {
    const config = defineFilesConfig({ storage: { blob: { adapter: "memory" } } });
    expect(config.storage.blob.adapter).toBe("memory");
  });

  test("rejects an empty registry", () => {
    expect(() => new FilesRegistry({ storage: {} })).toThrow("invalid-config");
  });

  test("never treats devStorage as a production fallback", async () => {
    const registry = new FilesRegistry({
      storage: { blob: { adapter: "not-a-provider" } },
      devStorage: { blob: { adapter: "fs", root: ".data/test-files" } },
    });
    await expect(registry.get("blob")).rejects.toThrow("unknown provider");
  });

  test("uses an explicit development override", async () => {
    const registry = new FilesRegistry(
      {
        storage: { blob: { adapter: "not-a-provider" } },
        devStorage: { blob: { adapter: "fs", root: ".data/test-files" } },
      },
      { development: true },
    );
    await expect(registry.get("blob")).resolves.toMatchObject({ adapter: { name: "fs" } });
  });

  test("bridges generic NUXT_ aliases without overriding native env", () => {
    process.env.NUXT_FILES_SDK_TEST_TOKEN = "nuxt";
    delete process.env.FILES_SDK_TEST_TOKEN;
    withNuxtEnvironment({});
    expect(process.env.FILES_SDK_TEST_TOKEN).toBe("nuxt");
    process.env.FILES_SDK_TEST_TOKEN = "native";
    withNuxtEnvironment({});
    expect(process.env.FILES_SDK_TEST_TOKEN).toBe("native");
  });
});
