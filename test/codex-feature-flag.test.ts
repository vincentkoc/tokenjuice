import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectCodexHooksFeatureFlag,
  installCodexHook,
  parseCodexFeatureFlag,
} from "../src/core/codex.js";

async function withTempCodexHome<T>(
  fn: (paths: { hooksPath: string; configPath: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "tj-codex-"));
  try {
    await mkdir(dir, { recursive: true });
    return await fn({
      hooksPath: join(dir, "hooks.json"),
      configPath: join(dir, "config.toml"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("parseCodexFeatureFlag", () => {
  it("returns keyPresent=false when file has no features section", () => {
    expect(parseCodexFeatureFlag("[other]\nfoo = 1\n", "codex_hooks")).toEqual({
      keyPresent: false,
      value: null,
    });
  });

  it("parses a scoped [features] section", () => {
    const source = "[features]\ncodex_hooks = true\n";
    expect(parseCodexFeatureFlag(source, "codex_hooks")).toEqual({
      keyPresent: true,
      value: true,
    });
  });

  it("parses explicit false", () => {
    const source = "[features]\ncodex_hooks = false\n";
    expect(parseCodexFeatureFlag(source, "codex_hooks")).toEqual({
      keyPresent: true,
      value: false,
    });
  });

  it("parses dotted features.codex_hooks at top level", () => {
    const source = "features.codex_hooks = true\n[other]\nfoo = 1\n";
    expect(parseCodexFeatureFlag(source, "codex_hooks")).toEqual({
      keyPresent: true,
      value: true,
    });
  });

  it("ignores the key when outside [features]", () => {
    const source = "[other]\ncodex_hooks = true\n";
    expect(parseCodexFeatureFlag(source, "codex_hooks")).toEqual({
      keyPresent: false,
      value: null,
    });
  });

  it("ignores commented-out assignments", () => {
    const source = "[features]\n# codex_hooks = true\n";
    expect(parseCodexFeatureFlag(source, "codex_hooks")).toEqual({
      keyPresent: false,
      value: null,
    });
  });
});

describe("inspectCodexHooksFeatureFlag", () => {
  it("reports configExists=false when the config is missing", async () => {
    await withTempCodexHome(async ({ configPath }) => {
      const status = await inspectCodexHooksFeatureFlag(configPath);
      expect(status.configExists).toBe(false);
      expect(status.keyPresent).toBe(false);
      expect(status.value).toBe(null);
      expect(status.enabled).toBe(false);
      expect(status.fixHint).toContain("codex_hooks");
    });
  });

  it("reports enabled=true when [features] codex_hooks = true", async () => {
    await withTempCodexHome(async ({ configPath }) => {
      await writeFile(configPath, "[features]\ncodex_hooks = true\n", "utf8");
      const status = await inspectCodexHooksFeatureFlag(configPath);
      expect(status.configExists).toBe(true);
      expect(status.keyPresent).toBe(true);
      expect(status.value).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.fixHint).toBe("");
    });
  });

  it("reports enabled=false when codex_hooks is explicitly disabled", async () => {
    await withTempCodexHome(async ({ configPath }) => {
      await writeFile(configPath, "[features]\ncodex_hooks = false\n", "utf8");
      const status = await inspectCodexHooksFeatureFlag(configPath);
      expect(status.configExists).toBe(true);
      expect(status.keyPresent).toBe(true);
      expect(status.value).toBe(false);
      expect(status.enabled).toBe(false);
      expect(status.fixHint).toContain("codex_hooks");
    });
  });
});

describe("installCodexHook feature-flag surface", () => {
  it("returns featureFlag.enabled=false when config.toml is missing", async () => {
    await withTempCodexHome(async ({ hooksPath }) => {
      const result = await installCodexHook(hooksPath);
      expect(result.featureFlag.enabled).toBe(false);
      expect(result.featureFlag.configExists).toBe(false);
      expect(result.featureFlag.fixHint).toContain("codex_hooks");
      // sanity: hooks.json was still written as usual
      const hooks = JSON.parse(await readFile(hooksPath, "utf8"));
      expect(hooks.hooks.PostToolUse).toBeDefined();
    });
  });
});
