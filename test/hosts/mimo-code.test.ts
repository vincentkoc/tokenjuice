import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doctorMimoCodeHook, installMimoCodeHook, uninstallMimoCodeHook } from "../../src/hosts/mimo-code/index.js";
import { createTokenjuiceMimoCodeHook } from "../../src/hosts/mimo-code/extension/runtime.js";
import { listArtifactMetadata } from "../../src/core/artifacts.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-mimo-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("MIMOCODE_CONFIG_DIR", "");
  vi.stubEnv("MIMOCODE_HOME", "");
  vi.stubEnv("XDG_CONFIG_HOME", join(home, ".config"));
  vi.stubEnv("TOKENJUICE_ARTIFACT_DIR", join(home, "artifacts"));
  vi.stubEnv("TOKENJUICE_STATS", "1");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("MiMo Code file hook lifecycle", () => {
  it("installs an object export, is idempotent, diagnoses drift, and removes only its hook", async () => {
    const root = join(home, "custom");
    vi.stubEnv("MIMOCODE_CONFIG_DIR", root);
    expect((await doctorMimoCodeHook()).status).toBe("disabled");
    const result = await installMimoCodeHook({ local: true });
    expect(result.extensionPath).toBe(join(root, "hooks", "tokenjuice.js"));
    expect((await doctorMimoCodeHook({ local: true })).status).toBe("ok");
    expect((await installMimoCodeHook({ local: true })).backupPath).toBeUndefined();
    const hook = (await import(pathToFileURL(result.extensionPath).href)).default;
    expect(typeof hook).toBe("object");
    expect(typeof hook["tool.execute.after"]).toBe("function");
    await writeFile(join(root, "hooks", "custom.js"), "export default {};\n");
    await writeFile(result.extensionPath, (await readFile(result.extensionPath, "utf8")) + "// drift\n");
    expect((await doctorMimoCodeHook({ local: true })).status).toBe("warn");
    expect((await uninstallMimoCodeHook()).removed).toBe(true);
    expect(await readFile(join(root, "hooks", "custom.js"), "utf8")).toBe("export default {};\n");
    expect((await uninstallMimoCodeHook()).removed).toBe(false);
  });

  it("uses MIMOCODE_HOME before XDG and rejects relative homes", async () => {
    vi.stubEnv("MIMOCODE_HOME", join(home, "mimo"));
    expect((await doctorMimoCodeHook()).extensionPath).toBe(join(home, "mimo", "config", "hooks", "tokenjuice.js"));
    vi.stubEnv("MIMOCODE_HOME", "relative");
    await expect(installMimoCodeHook()).rejects.toThrow("absolute path");
  });

  it("uses the XDG default when no MiMo override exists", async () => {
    expect((await doctorMimoCodeHook()).extensionPath).toBe(join(home, ".config", "mimocode", "hooks", "tokenjuice.js"));
  });

  it("preserves unowned files and refuses symlinked hook directories", async () => {
    const root = join(home, "custom");
    const hooks = join(root, "hooks");
    await mkdir(hooks, { recursive: true });
    const path = join(hooks, "tokenjuice.js");
    await writeFile(path, "export default {};\n");
    const options = { configDir: root, local: true };
    await expect(installMimoCodeHook(options)).rejects.toThrow("unowned");
    expect((await uninstallMimoCodeHook(options)).removed).toBe(false);
    expect((await doctorMimoCodeHook(options)).status).toBe("broken");
    await rm(hooks, { recursive: true });
    const target = join(home, "target");
    await mkdir(target);
    await symlink(target, hooks, "dir");
    await expect(installMimoCodeHook(options)).rejects.toThrow("unsafe");
    await expect(uninstallMimoCodeHook(options)).rejects.toThrow("unsafe");
  });
});

const status = ["On branch feature", "", "Changes not staged for commit:",
  ...Array.from({ length: 50 }, (_, n) => `\tmodified:   src/component-${n}.ts`),
  "", "no changes added to commit"].join("\n");

function result(text = status, metadata: Record<string, unknown> = { exit: 0, truncated: false }) {
  return { title: "status", output: text, metadata: { output: text, custom: "preserved", ...metadata } };
}

describe("MiMo Code tool result contract", () => {
  it("compacts a successful Bash result and keeps metadata projections coherent", async () => {
    const output = result();
    await createTokenjuiceMimoCodeHook()["tool.execute.after"]({ tool: "bash", args: { command: "git status" } }, output);
    expect(output.output).toContain("tokenjuice compacted bash output");
    expect(output.output).toContain("component-0.ts");
    expect(output.output.length).toBeLessThan(status.length);
    expect(output.metadata).toMatchObject({ exit: 0, truncated: false, custom: "preserved", output: output.output,
      tokenjuice: { compacted: true } });
    expect((await listArtifactMetadata(join(home, "artifacts")))[0]?.metadata.source).toBe("mimo-code");
  });

  it.each([
    { exit: 7, truncated: false },
    { exit: null, truncated: false },
    { truncated: false },
    { exit: "0", truncated: false },
    { exit: 0, truncated: true, outputPath: "/untrusted/output" },
    { exit: 0 },
  ])("leaves failed, incomplete, and unknown results unchanged: %j", async (metadata) => {
    const output = result(status, metadata);
    const before = structuredClone(output);
    await createTokenjuiceMimoCodeHook()["tool.execute.after"]({ tool: "bash", args: { command: "git status" } }, output);
    expect(output).toEqual(before);
  });

  it.each(["cat file.txt", "find . -type f", "tokenjuice wrap --raw -- git status"])("preserves exact inspections and explicit wrapping: %s", async (command) => {
    const output = result(" first\r\n\tlast  \r\n".repeat(100));
    const before = structuredClone(output);
    await createTokenjuiceMimoCodeHook()["tool.execute.after"]({ tool: "bash", args: { command } }, output);
    expect(output).toEqual(before);
  });

  it("ignores other tools and malformed payloads", async () => {
    const output = result();
    const before = structuredClone(output);
    const hook = createTokenjuiceMimoCodeHook()["tool.execute.after"];
    await hook({ tool: "read", args: { command: "git status" } }, output);
    await hook(null, output);
    await hook({ tool: "bash", args: {} }, output);
    await hook({ tool: "bash", args: { command: "git status" } }, null);
    expect(output).toEqual(before);
  });
});
