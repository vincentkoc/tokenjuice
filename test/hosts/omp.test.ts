import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as compactor from "../../src/core/integrations/compact-bash-result.js";
import { compactOmpResult } from "../../src/core/integrations/compact-omp-result.js";
import tokenjuiceOmpExtension, { type OmpExtensionAPI } from "../../src/hosts/omp/extension.js";

const originalArtifactDir = process.env.TOKENJUICE_ARTIFACT_DIR;
const originalStats = process.env.TOKENJUICE_STATS;
let artifacts: string;

beforeEach(async () => {
  artifacts = await mkdtemp(join(tmpdir(), "tokenjuice-omp-test-"));
  process.env.TOKENJUICE_ARTIFACT_DIR = artifacts;
  process.env.TOKENJUICE_STATS = "off";
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalArtifactDir === undefined) delete process.env.TOKENJUICE_ARTIFACT_DIR;
  else process.env.TOKENJUICE_ARTIFACT_DIR = originalArtifactDir;
  if (originalStats === undefined) delete process.env.TOKENJUICE_STATS;
  else process.env.TOKENJUICE_STATS = originalStats;
  await rm(artifacts, { recursive: true, force: true });
});

const output = ["On branch main", "Changes not staged for commit:",
  ...Array.from({ length: 80 }, (_, index) => `\tmodified:   src/module-${index}.ts`),
  "no changes added to commit"].join("\n");

function event() {
  return {
    type: "tool_result", toolName: "bash", toolCallId: "test-call",
    input: { command: "git status" }, isError: false,
    content: [{ type: "text", text: output, custom: "retained" }],
    details: { wallTimeNoticeEmitted: false, timeoutSeconds: 60, trace: { frames: [] } },
  };
}

describe("oh-my-pi native extension", () => {
  it("registers the result handler without rewriting tools or permission policy", () => {
    const on = vi.fn<OmpExtensionAPI["on"]>();
    tokenjuiceOmpExtension({ on });
    expect(on).toHaveBeenCalledExactlyOnceWith("tool_result", expect.any(Function));
  });

  it("compacts native successful Bash content and retains host metadata", async () => {
    const original = event();
    const before = structuredClone(original);
    const replacement = await compactOmpResult(original, "/workspace");
    expect(replacement?.content[0]?.text.length).toBeLessThan(output.length);
    expect(replacement?.content[0]?.text).toContain("src/module-0.ts");
    expect(replacement?.content[0]?.text).toContain("raw artifact:");
    expect(replacement?.content[0]?.custom).toBe("retained");
    expect(replacement).not.toHaveProperty("details");
    expect(replacement).not.toHaveProperty("isError");
    expect(original).toEqual(before);
  });

  it.each([
    { isError: true }, { isError: undefined }, { toolName: "read" },
    { input: {} }, { content: [{ type: "image", data: "image" }] },
    { content: [{ type: "text", text: output }, { type: "text", text: "policy notice" }] },
    { details: undefined },
  ])("preserves incompatible or failed native results: %j", async (patch) => {
    expect(await compactOmpResult({ ...event(), ...patch }, "/workspace")).toBeUndefined();
  });

  it.each([
    { wallTimeNoticeEmitted: true }, { async: { state: "running", jobId: "job" } },
    { timedOut: true }, { exitCode: 7 }, { meta: { truncation: { totalLines: 1000 } } },
    { meta: { minimized: { filter: "git" } } }, { requestedTimeoutSeconds: 900 },
    { replies: ["retained reply"] }, { spotlight: { experiment: true } },
  ])("preserves native notices and non-foreground metadata: %j", async (details) => {
    const original = event();
    expect(await compactOmpResult({ ...original, details: { ...original.details, ...details } }, "/workspace")).toBeUndefined();
  });

  it.each(["cat exact.txt", "tokenjuice wrap --raw -- git status", "/usr/local/bin/tokenjuice wrap --raw -- git status"])("keeps exact reads and raw bypass: %s", async (command) => {
    expect(await compactOmpResult({ ...event(), input: { command } }, "/workspace")).toBeUndefined();
  });

  it("contains compactor failures in the registered native handler", async () => {
    vi.spyOn(compactor, "compactBashResult").mockRejectedValueOnce(new Error("fixture failure"));
    const on = vi.fn<OmpExtensionAPI["on"]>();
    tokenjuiceOmpExtension({ on });
    const handler = on.mock.calls[0]![1];
    expect(await handler(event(), { cwd: "/workspace" })).toBeUndefined();
  });

  it("declares a built native plugin entry in the published package", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    expect(manifest.omp.extensions).toEqual(["./dist/hosts/omp/extension.js"]);
    expect(manifest.files).toContain("dist");
    expect(manifest.scripts.build).toContain("node scripts/build-omp-runtime.mjs");
  });
});
