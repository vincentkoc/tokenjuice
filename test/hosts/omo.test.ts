import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doctorOmoExtension, getOmoExtensionPath, installOmoExtension, uninstallOmoExtension } from "../../src/hosts/omo/index.js";
import { compactOmoResult } from "../../src/core/integrations/compact-omo-result.js";

let home: string;
const savedEnv = { ...process.env };
beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-omo-")));
  process.env.OMO_CODING_AGENT_DIR = home;
  process.env.TOKENJUICE_ARTIFACT_DIR = join(home, "artifacts");
});
afterEach(async () => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  await rm(home, { recursive: true, force: true });
});

describe("OmO native integration", () => {
  it("resolves launcher overrides in order without changing Pi's own directory", () => {
    process.env.SENPI_CODING_AGENT_DIR = join(home, "senpi");
    process.env.PI_CODING_AGENT_DIR = join(home, "pi");
    expect(getOmoExtensionPath()).toBe(join(home, "extensions", "tokenjuice.js"));
    delete process.env.OMO_CODING_AGENT_DIR;
    expect(getOmoExtensionPath()).toBe(join(home, "senpi", "extensions", "tokenjuice.js"));
    delete process.env.SENPI_CODING_AGENT_DIR;
    expect(getOmoExtensionPath()).toBe(join(home, "pi", "extensions", "tokenjuice.js"));
  });

  it("installs idempotently, diagnoses modified bytes, and removes only its extension", async () => {
    expect((await doctorOmoExtension()).status).toBe("disabled");
    const first = await installOmoExtension({ local: true });
    expect((await installOmoExtension({ local: true })).backupPath).toBeUndefined();
    expect((await doctorOmoExtension({ local: true })).status).toBe("ok");
    await writeFile(first.extensionPath, `${await readFile(first.extensionPath, "utf8")}\n// changed`);
    expect((await doctorOmoExtension({ local: true })).status).toBe("warn");
    const sibling = join(dirname(first.extensionPath), "user.js");
    await writeFile(sibling, "user code");
    expect((await uninstallOmoExtension()).removed).toBe(true);
    expect((await uninstallOmoExtension()).removed).toBe(false);
    expect(await readFile(sibling, "utf8")).toBe("user code");
  });

  it("refuses foreign files and symlinks", async () => {
    const path = getOmoExtensionPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "user code");
    await expect(installOmoExtension()).rejects.toThrow("unowned");
    expect((await uninstallOmoExtension()).removed).toBe(false);
    await rm(path);
    await symlink(join(home, "target.js"), path);
    await expect(installOmoExtension()).rejects.toThrow("unsafe");
    expect((await doctorOmoExtension()).status).toBe("broken");
  });
});

function event(command = "git status --short", output = Array.from({ length: 80 }, (_, i) => ` M src/file-${i}.ts`).join("\n")) {
  return { toolName: "bash", toolCallId: "call", input: { command }, isError: false,
    content: [{ type: "text", text: output, custom: "keep" }],
    structuredContent: { output, truncated: false, exit_code: 0, wall_time_seconds: 1, custom: "keep" } };
}

describe("OmO result replacement", () => {
  it("replaces matching root projections together and preserves their metadata", async () => {
    const input = event();
    const before = structuredClone(input);
    const result = await compactOmoResult(input, home);
    expect(result).toBeDefined();
    expect(await compactOmoResult(input)).toBeDefined();
    expect(result!.content[0].text.length).toBeLessThan(input.content[0].text.length);
    expect(result!.content[0].text).toBe(result!.structuredContent.output);
    expect(result!.content[0].custom).toBe("keep");
    expect(result!.structuredContent).toMatchObject({ exit_code: 0, truncated: false, wall_time_seconds: 1, custom: "keep" });
    expect(input).toEqual(before);
  });

  it("preserves failures, nested calls, incomplete output and mismatched projections", async () => {
    for (const input of [
      { ...event(), isError: true }, { ...event(), parentToolCallId: "parent" },
      { ...event(), structuredContent: { ...event().structuredContent, exit_code: 7 } },
      { ...event(), structuredContent: { ...event().structuredContent, truncated: true } },
      { ...event(), structuredContent: { ...event().structuredContent, output: "other" } },
      { ...event(), details: { fullOutputPath: "/fixture/output" } },
      { ...event(), content: [...event().content, { type: "text", text: "notice", custom: "keep" }] },
    ]) expect(await compactOmoResult(input, home)).toBeUndefined();
  });

  it("preserves exact reads and explicit raw commands", async () => {
    expect(await compactOmoResult(event("cat file.txt"), home)).toBeUndefined();
    expect(await compactOmoResult(event("tokenjuice wrap --raw -- git status --short"), home)).toBeUndefined();
  });
});
