import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Import an isolated copy: the vendor profile cannot rely on tokenjuice's tree.
const temporary = await mkdtemp(join(tmpdir(), "tokenjuice-deepseek-bundle-"));
try {
  const bundle = join(temporary, "bundle");
  await cp(new URL("../dist/hosts/deepseek-harness/bundle", import.meta.url), bundle, { recursive: true });
  const manifest = JSON.parse(await readFile(join(bundle, "package.json"), "utf8"));
  const project = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, project.version);
  assert.equal(manifest.engines.dsh, "0.2.2-alpha.2");
  assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(await readFile(join(bundle, "cordis.patch.yml"), "utf8"),
    "- insert:\n    - id: tokenjuice\n      name: tokenjuice-deepseek-harness\n");
  const plugin = await import(pathToFileURL(join(bundle, manifest.main)).href);
  assert.equal(plugin.name, "tokenjuice");
  assert.deepEqual(plugin.inject, ["tools"]);
  let listener;
  plugin.apply({ on(event, callback) { assert.equal(event, "tools/post-execute"); listener = callback; } });
  assert.equal(typeof listener, "function");
  const stdout = ["On branch main", "Changes not staged for commit:",
    ...Array.from({ length: 40 }, (_, i) => `\tmodified:   src/file-${i}.ts`), "no changes added to commit"].join("\n");
  const value = { kind: "foreground", cwd: temporary, exitCode: 0, signal: null, timedOut: false,
    aborted: false, timeoutMs: 1000, stdout: { text: stdout, truncated: false }, stderr: { text: "", truncated: false } };
  const result = { isError: false, value, content: [{ type: "text", text: stdout }] };
  const decision = await listener({ name: "bash", arguments: { command: "git status" }, signal: new AbortController().signal },
    result, async () => ({ kind: "accept" }));
  assert.ok(decision.content[0].text.length < stdout.length);
  assert.equal(result.value, value);
  assert.equal(result.content[0].text, stdout);
  assert.equal(decision.value, undefined);
  console.log("DeepSeek isolated bundle contract passed (vendor profile activation unqualified)");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
