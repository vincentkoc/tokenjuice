import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorAiMemoryProtocolMemory,
  installAiMemoryProtocolMemory,
  uninstallAiMemoryProtocolMemory,
} from "../../src/index.js";
import { isInstalledHookIntegration } from "../../src/hosts/shared/hook-doctor.js";

const tempDirs: string[] = [];
const originalMemoryDir = process.env.MEMORY_DIR;
const originalAiMemoryProtocolDir = process.env.AI_MEMORY_PROTOCOL_DIR;

afterEach(async () => {
  if (originalMemoryDir === undefined) {
    delete process.env.MEMORY_DIR;
  } else {
    process.env.MEMORY_DIR = originalMemoryDir;
  }
  if (originalAiMemoryProtocolDir === undefined) {
    delete process.env.AI_MEMORY_PROTOCOL_DIR;
  } else {
    process.env.AI_MEMORY_PROTOCOL_DIR = originalAiMemoryProtocolDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-ai-memory-protocol-test-"));
  tempDirs.push(dir);
  return dir;
}

async function createMemoryWorkspace(memoryDir: string): Promise<void> {
  await mkdir(join(memoryDir, "memory"), { recursive: true });
  await writeFile(
    join(memoryDir, "conf.py"),
    [
      'extensions = ["sphinx_needs"]',
      'needs_types = [{"directive": "pref", "title": "Preference", "prefix": "PREF_"}]',
      'needs_extra_options = ["source", "confidence", "scope", "created_at", "review_after"]',
      "needs_build_json = True",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(memoryDir, "index.rst"), "Test\n====\n\n.. toctree::\n\n   memory/index\n", "utf8");
  await writeFile(join(memoryDir, "memory", "index.rst"), "Memory\n======\n\n.. toctree::\n\n   preferences\n", "utf8");
}

describe("AI Memory Protocol memory", () => {
  it("installs an RST preference memory", async () => {
    const memoryDir = await createTempDir();
    await createMemoryWorkspace(memoryDir);

    const result = await installAiMemoryProtocolMemory(undefined, { memoryDir });
    const text = await readFile(result.memoryPath, "utf8");

    expect(result.memoryPath).toBe(join(memoryDir, "memory", "preferences.rst"));
    expect(result.backupPath).toBeUndefined();
    expect(text).toContain("Preferences");
    expect(text).toContain(".. pref:: tokenjuice terminal output compaction");
    expect(text).toContain(":id: PREF_TOKENJUICE_TERMINAL_OUTPUT_COMPACTION");
    expect(text).toContain(":status: draft");
    expect(text).toContain(":tags: topic:terminal-output, topic:tokenjuice, intent:coding-style");
    expect(text).toContain("tokenjuice wrap -- <command>");
    expect(text).toContain("tokenjuice wrap --raw -- <command>");
    expect(text).toContain("memory rebuild");
  });

  it("preserves existing memories and reports health", async () => {
    const memoryDir = await createTempDir();
    const memoryPath = join(memoryDir, "memory", "preferences.rst");
    await createMemoryWorkspace(memoryDir);
    await writeFile(memoryPath, "===========\nPreferences\n===========\n\n.. pref:: Existing\n :id: PREF_existing\n\n Body.\n", "utf8");

    const installed = await installAiMemoryProtocolMemory(undefined, { memoryDir });
    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });
    const text = await readFile(memoryPath, "utf8");

    expect(installed.backupPath).toBe(`${memoryPath}.bak`);
    expect(text).toContain("PREF_existing");
    expect(doctor.status).toBe("ok");
    expect(doctor.hasTokenjuiceMarker).toBe(true);
    expect(isInstalledHookIntegration(doctor)).toBe(true);
  });

  it("uses AI_MEMORY_PROTOCOL_DIR before MEMORY_DIR", async () => {
    const preferred = await createTempDir();
    const fallback = await createTempDir();
    await createMemoryWorkspace(preferred);
    process.env.AI_MEMORY_PROTOCOL_DIR = preferred;
    process.env.MEMORY_DIR = fallback;

    const result = await installAiMemoryProtocolMemory();
    const doctor = await doctorAiMemoryProtocolMemory();

    expect(result.memoryPath).toBe(join(preferred, "memory", "preferences.rst"));
    expect(doctor.memoryPath).toBe(join(preferred, "memory", "preferences.rst"));
    expect(doctor.status).toBe("ok");
  });

  it("uninstalls only the tokenjuice memory block", async () => {
    const memoryDir = await createTempDir();
    const memoryPath = join(memoryDir, "memory", "preferences.rst");
    await createMemoryWorkspace(memoryDir);
    await writeFile(memoryPath, "===========\nPreferences\n===========\n\n.. pref:: Existing\n :id: PREF_existing\n\n Body.\n", "utf8");
    await installAiMemoryProtocolMemory(undefined, { memoryDir });

    const removed = await uninstallAiMemoryProtocolMemory(undefined, { memoryDir });
    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });
    const text = await readFile(memoryPath, "utf8");

    expect(removed.removed).toBe(true);
    expect(text).toContain("PREF_existing");
    expect(text).not.toContain("PREF_TOKENJUICE_TERMINAL_OUTPUT_COMPACTION");
    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
  });

  it("rejects symlinked memory files before install, doctor, or uninstall", async () => {
    const memoryDir = await createTempDir();
    const outside = await createTempDir();
    const memoryPath = join(memoryDir, "memory", "preferences.rst");
    await createMemoryWorkspace(memoryDir);
    await writeFile(join(outside, "preferences.rst"), "private memory\n", "utf8");
    await rm(memoryPath, { force: true });
    await symlink(join(outside, "preferences.rst"), memoryPath);

    await expect(installAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(/symlinked memory file/u);
    await expect(uninstallAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(/symlinked memory file/u);
    await expect(readFile(join(outside, "preferences.rst"), "utf8")).resolves.toBe("private memory\n");

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });
    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(doctor.issues[0]).toContain("symlinked memory file");
  });

  it("rejects symlinked memory directories before writing", async () => {
    const memoryDir = await createTempDir();
    const outside = await createTempDir();
    await createMemoryWorkspace(memoryDir);
    await rm(join(memoryDir, "memory"), { recursive: true, force: true });
    await symlink(outside, join(memoryDir, "memory"));

    await expect(installAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(/symlinked memory directory/u);
  });

  it("rejects symlinked workspace files before reading them", async () => {
    const memoryDir = await createTempDir();
    const outside = await createTempDir();
    const outsideConf = join(outside, "conf.py");
    await createMemoryWorkspace(memoryDir);
    await writeFile(outsideConf, "private config\n", "utf8");
    await rm(join(memoryDir, "conf.py"));
    await symlink(outsideConf, join(memoryDir, "conf.py"));

    await expect(installAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(/symlinked workspace config file/u);
    await expect(readFile(outsideConf, "utf8")).resolves.toBe("private config\n");

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });
    expect(doctor.status).toBe("broken");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(doctor.issues[0]).toContain("symlinked workspace config file");
  });

  it("reports malformed tokenjuice markers as broken", async () => {
    const memoryDir = await createTempDir();
    const memoryPath = join(memoryDir, "memory", "preferences.rst");
    await createMemoryWorkspace(memoryDir);
    await writeFile(memoryPath, ".. tokenjuice:ai-memory-protocol begin\n", "utf8");

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues[0]).toContain("start marker without an end marker");
  });

  it("reports mixed complete and dangling tokenjuice markers as broken", async () => {
    const memoryDir = await createTempDir();
    const memoryPath = join(memoryDir, "memory", "preferences.rst");
    await createMemoryWorkspace(memoryDir);
    await installAiMemoryProtocolMemory(undefined, { memoryDir });
    await writeFile(
      memoryPath,
      `${await readFile(memoryPath, "utf8")}\n.. tokenjuice:ai-memory-protocol begin\n`,
      "utf8",
    );

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("broken");
    expect(doctor.issues).toContain(
      "configured AI Memory Protocol memory has mismatched tokenjuice marker counts; remove unmatched tokenjuice markers before reinstalling",
    );
  });

  it("refuses to install into an uninitialized memory workspace", async () => {
    const memoryDir = await createTempDir();

    await expect(installAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(
      "AI Memory Protocol workspace is not initialized",
    );
    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.missingPaths).toContain(join(memoryDir, "conf.py"));
    expect(doctor.fixCommand).toContain("memory init");
  });

  it("reports a file at the memory workspace path as disabled instead of throwing", async () => {
    const root = await createTempDir();
    const memoryDir = join(root, ".memories");
    await writeFile(memoryDir, "not a directory\n", "utf8");

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });
    const removed = await uninstallAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(doctor.missingPaths).toContain(join(memoryDir, "conf.py"));
    expect(removed.removed).toBe(false);
  });

  it("reports directories at required workspace file paths as disabled instead of throwing", async () => {
    const memoryDir = await createTempDir();
    await mkdir(join(memoryDir, "conf.py"), { recursive: true });
    await mkdir(join(memoryDir, "memory"), { recursive: true });
    await writeFile(join(memoryDir, "index.rst"), "Test\n====\n\n.. toctree::\n\n   memory/index\n", "utf8");
    await writeFile(join(memoryDir, "memory", "index.rst"), "Memory\n======\n\n.. toctree::\n\n   preferences\n", "utf8");

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(doctor.missingPaths).toContain(join(memoryDir, "conf.py"));
  });

  it("handles a directory at the preferences memory path without raw filesystem errors", async () => {
    const memoryDir = await createTempDir();
    const memoryPath = join(memoryDir, "memory", "preferences.rst");
    await createMemoryWorkspace(memoryDir);
    await mkdir(memoryPath);

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });
    const removed = await uninstallAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.hasTokenjuiceMarker).toBe(false);
    expect(isInstalledHookIntegration(doctor)).toBe(false);
    expect(removed.removed).toBe(false);
    await expect(installAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(/preferences\.rst file/u);
  });

  it("quotes targeted repair commands for memory paths", async () => {
    const root = await createTempDir();
    const memoryDir = join(root, "memory dir");

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.fixCommand).toBe(
      `memory init '${memoryDir}' --install && AI_MEMORY_PROTOCOL_DIR='${memoryDir}' tokenjuice install ai-memory-protocol`,
    );
  });

  it("targets the diagnosed workspace in disabled repair commands", async () => {
    const root = await createTempDir();
    const memoryDir = join(root, "memory dir");
    await createMemoryWorkspace(memoryDir);

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.fixCommand).toBe(`AI_MEMORY_PROTOCOL_DIR='${memoryDir}' tokenjuice install ai-memory-protocol`);
  });

  it("refuses non-AI Memory Protocol Sphinx workspaces", async () => {
    const memoryDir = await createTempDir();
    await mkdir(join(memoryDir, "memory"), { recursive: true });
    await writeFile(join(memoryDir, "conf.py"), "project = 'not memory'\n", "utf8");
    await writeFile(join(memoryDir, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   memory/index\n", "utf8");
    await writeFile(join(memoryDir, "memory", "index.rst"), "Memory\n======\n\n.. toctree::\n\n   preferences\n", "utf8");

    await expect(installAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(
      "workspace is not initialized or incompatible",
    );
    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.missingPaths).toEqual([]);
    expect(doctor.issues).toContain("AI Memory Protocol workspace conf.py is missing the sphinx_needs extension");
  });

  it("refuses Sphinx-Needs workspaces without AI Memory Protocol metadata fields", async () => {
    const memoryDir = await createTempDir();
    await mkdir(join(memoryDir, "memory"), { recursive: true });
    await writeFile(
      join(memoryDir, "conf.py"),
      'extensions = ["sphinx_needs"]\nneeds_types = [{"directive": "pref"}]\nneeds_build_json = True\n',
      "utf8",
    );
    await writeFile(join(memoryDir, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   memory/index\n", "utf8");
    await writeFile(join(memoryDir, "memory", "index.rst"), "Memory\n======\n\n.. toctree::\n\n   *\n", "utf8");

    await expect(installAiMemoryProtocolMemory(undefined, { memoryDir })).rejects.toThrow(
      "workspace is not initialized or incompatible",
    );
    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("AI Memory Protocol workspace conf.py is missing needs_extra_options");
    expect(doctor.issues).toContain("AI Memory Protocol workspace conf.py is missing the review_after metadata option");
  });

  it("refuses workspaces that do not build needs JSON", async () => {
    const memoryDir = await createTempDir();
    await createMemoryWorkspace(memoryDir);
    await writeFile(
      join(memoryDir, "conf.py"),
      [
        'extensions = ["sphinx_needs"]',
        'needs_types = [{"directive": "pref"}]',
        'needs_extra_options = ["source", "confidence", "scope", "created_at", "review_after"]',
        "needs_build_json = False",
        "",
      ].join("\n"),
      "utf8",
    );

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain("AI Memory Protocol workspace conf.py must enable needs_build_json");
  });

  it("refuses wildcard memory indexes without glob expansion", async () => {
    const memoryDir = await createTempDir();
    await createMemoryWorkspace(memoryDir);
    await writeFile(join(memoryDir, "memory", "index.rst"), "Memory\n======\n\n.. toctree::\n\n   *\n", "utf8");

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain(
      "AI Memory Protocol workspace memory/index.rst does not include preferences or a :glob: memory toctree",
    );
  });

  it("requires glob expansion in the same toctree as wildcard memory entries", async () => {
    const memoryDir = await createTempDir();
    await createMemoryWorkspace(memoryDir);
    await writeFile(
      join(memoryDir, "memory", "index.rst"),
      "Memory\n======\n\n.. toctree::\n   :glob:\n\n   observations\n\n.. toctree::\n\n   *\n",
      "utf8",
    );

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain(
      "AI Memory Protocol workspace memory/index.rst does not include preferences or a :glob: memory toctree",
    );
  });

  it("rejects unglobbed wildcard entries even with explicit preferences", async () => {
    const memoryDir = await createTempDir();
    await createMemoryWorkspace(memoryDir);
    await writeFile(
      join(memoryDir, "memory", "index.rst"),
      "Memory\n======\n\n.. toctree::\n\n   preferences\n   *\n",
      "utf8",
    );

    const doctor = await doctorAiMemoryProtocolMemory(undefined, { memoryDir });

    expect(doctor.status).toBe("disabled");
    expect(doctor.issues).toContain(
      "AI Memory Protocol workspace memory/index.rst does not include preferences or a :glob: memory toctree",
    );
  });
});
