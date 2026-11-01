import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import { createProcessRunner } from "../../scripts/e2e-process.mjs";

let cwd: string;
let run: ReturnType<typeof createProcessRunner>;

beforeEach(async () => {
  cwd = await realpath(await mkdtemp(join(tmpdir(), "tokenjuice-process-test-")));
  run = createProcessRunner({ cwd, env: { ...process.env, TOKENJUICE_RUNNER_FIXTURE: "fixture" } });
});
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

it("passes the fixture directory and environment while capturing separate streams", async () => {
  const result = await run(process.execPath, ["-e", "process.stdout.write(JSON.stringify([process.cwd(), process.env.TOKENJUICE_RUNNER_FIXTURE])); process.stderr.write('diagnostic');"]);
  expect(JSON.parse(result.stdout)).toEqual([cwd, "fixture"]);
  expect(result.stderr).toBe("diagnostic");
});

it("includes both streams in nonzero-exit diagnostics", async () => {
  await expect(run(process.execPath, ["-e", "process.stdout.write('output'); process.stderr.write('diagnostic'); process.exit(7);"]))
    .rejects.toThrow(`${process.execPath} exited 7\ndiagnostic\noutput`);
});

it("propagates spawn errors", async () => {
  await expect(run(join(cwd, "missing-command"), [])).rejects.toMatchObject({ code: "ENOENT" });
});

it("terminates a child that exceeds the requested timeout", async () => {
  await expect(run(process.execPath, ["-e", "setTimeout(() => {}, 30_000);"], 50))
    .rejects.toThrow(`timed out running ${process.execPath}`);
});
