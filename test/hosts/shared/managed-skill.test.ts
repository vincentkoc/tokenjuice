import { access, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildManagedSkill, doctorManagedSkill, installManagedSkill, uninstallManagedSkill, type ManagedSkillSpec } from "../../../src/hosts/shared/managed-skill.js";

let root: string;
let spec: ManagedSkillSpec;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tokenjuice-skill-"));
  spec = { rootDir: root, relativePath: "skills/tokenjuice/SKILL.md", hostId: "fixture", hostLabel: "Fixture",
    advisory: "Guidance only; live discovery unqualified", fixCommand: "tokenjuice install fixture" };
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("managed guidance skills", () => {
  it("writes frontmatter first, checks runtime availability and retains exact-read guidance", () => {
    const text = buildManagedSkill(spec);
    expect(text.startsWith("---\nname: tokenjuice\n")).toBe(true);
    expect(text).toContain("command -v tokenjuice");
    expect(text).toContain("tokenjuice --version");
    expect(text).toContain("tokenjuice wrap --raw -- <command>");
    expect(text).not.toContain("wrap --full");
  });

  it("supports idempotent install, refresh backup, doctor and file-only uninstall", async () => {
    expect((await doctorManagedSkill(spec)).status).toBe("disabled");
    const { skillPath } = await installManagedSkill(spec);
    expect((await installManagedSkill(spec)).backupPath).toBeUndefined();
    expect((await doctorManagedSkill(spec)).status).toBe("ok");
    const edited = `${buildManagedSkill(spec)}local note\n`;
    await writeFile(skillPath, edited);
    expect((await doctorManagedSkill(spec)).status).toBe("warn");
    const refreshed = await installManagedSkill(spec);
    expect(await readFile(refreshed.backupPath!, "utf8")).toBe(edited);
    const sibling = join(dirname(skillPath), "reference.md");
    await writeFile(sibling, "retained");
    expect((await uninstallManagedSkill(spec)).removed).toBe(true);
    expect(await readFile(sibling, "utf8")).toBe("retained");
    expect(await readFile(refreshed.backupPath!, "utf8")).toBe(edited);
    expect((await uninstallManagedSkill(spec)).removed).toBe(false);
  });

  it("refuses to overwrite or uninstall a foreign skill", async () => {
    const path = join(root, spec.relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "foreign skill\n");
    await expect(installManagedSkill(spec)).rejects.toThrow("unowned skill");
    expect((await doctorManagedSkill(spec)).status).toBe("broken");
    expect((await uninstallManagedSkill(spec)).removed).toBe(false);
    expect(await readFile(path, "utf8")).toBe("foreign skill\n");
  });

  it.each(["directory", "file", "hardlink"])("rejects unsafe paths: %s", async (kind) => {
    const outside = join(root, "outside");
    await mkdir(outside);
    const target = join(outside, "SKILL.md");
    await writeFile(target, buildManagedSkill(spec));
    const path = join(root, spec.relativePath);
    if (kind === "directory") await symlink(outside, join(root, "skills"));
    else {
      await mkdir(dirname(path), { recursive: true });
      if (kind === "file") await symlink(target, path);
      else await link(target, path);
    }
    await expect(installManagedSkill(spec)).rejects.toThrow("unsafe managed skill path");
    await expect(uninstallManagedSkill(spec)).rejects.toThrow("unsafe managed skill path");
    expect((await doctorManagedSkill(spec)).status).toBe("broken");
    expect(await readFile(target, "utf8")).toBe(buildManagedSkill(spec));
  });

  it("rejects path escapes without creating output", async () => {
    await expect(installManagedSkill({ ...spec, relativePath: "../SKILL.md" })).rejects.toThrow("below its configured root");
    await expect(access(join(root, "skills"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
