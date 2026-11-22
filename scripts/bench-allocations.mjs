#!/usr/bin/env node
// Build both revisions first, then pass their dist directories. Each arm is a
// fresh process; CPU and allocation sampling run separately in alternating order.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Session } from "node:inspector/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const cases = [
  ["small git status", "git status --short", " M src/core/text.ts\n?? test/core/text.test.ts\n"],
  ["large git log", "git log -200", Array.from({ length: 200 }, (_, i) => `commit ${i.toString(16).padStart(40, "0")}\nAuthor: Example <example@example.com>\nDate: Thu Nov 5 10:00:00 2026 +0000\n\n    Preserve Unicode é 👩🏽‍💻 and deterministic output ${i}\n`).join("\n")],
  ["large git diff", "git diff", Array.from({ length: 160 }, (_, i) => `diff --git a/src/file${i}.ts b/src/file${i}.ts\n--- a/src/file${i}.ts\n+++ b/src/file${i}.ts\n@@ -1,2 +1,2 @@\n-export const value = ${i};\n+export const value = ${i + 1};\n // unchanged\n`).join("")],
  ["unmatched build", "build-project --verbose", Array.from({ length: 600 }, (_, i) => `[build ${i}] compiled src/module${i}.ts successfully (é 👩🏽‍💻)`).join("\n")],
  ["large JSON", "fetch-records --json", JSON.stringify({ records: Array.from({ length: 300 }, (_, i) => ({ id: i, name: `record ${i}`, description: "Combining é, family 👨‍👩‍👧‍👦, flag 🇦🇹", enabled: true })) }, null, 2)],
  ["exact file read", "cat src/core/example.ts", "export const value = 'é 👩🏽‍💻';\n".repeat(1000)],
];

async function runArm(directory, mode, iterations) {
  const moduleUrl = (name) => pathToFileURL(resolve(directory, "core", name)).href;
  const { compactBashResult } = await import(moduleUrl("integrations/compact-bash-result.js"));
  const session = new Session();
  if (mode === "allocation") session.connect();
  const results = [];
  for (const [name, command, visibleText] of cases) {
    const input = { source: "openclaw", command, visibleText, exitCode: 0,
      inspectionPolicy: "allow-safe-inventory", recordStats: false, storeRaw: false,
      maxInlineChars: 1200 };
    const run = () => compactBashResult(input);
    const expected = JSON.stringify(await run());
    for (let i = 0; i < 60; i += 1) await run();
    globalThis.gc?.();
    if (mode === "allocation") {
      await session.post("HeapProfiler.startSampling", { samplingInterval: 4096,
        includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    }
    const cpuUsage = process.threadCpuUsage ?? process.cpuUsage;
    const start = cpuUsage();
    let last;
    for (let i = 0; i < iterations; i += 1) last = await run();
    const cpu = cpuUsage(start);
    let bytes;
    if (mode === "allocation") {
      const { profile } = await session.post("HeapProfiler.stopSampling");
      const sum = (node) => node.selfSize + node.children.reduce((total, child) => total + sum(child), 0);
      bytes = sum(profile.head) / iterations;
    }
    assert.equal(JSON.stringify(last), expected);
    results.push({ name, hash: createHash("sha256").update(expected).digest("hex"),
      ...(mode === "allocation" ? { bytes } : { cpuUs: (cpu.user + cpu.system) / iterations }) });
  }
  if (mode === "allocation") session.disconnect();
  return results;
}

if (process.argv[2] === "arm") {
  console.log(JSON.stringify(await runArm(process.argv[3], process.argv[4], Number(process.argv[5]))));
} else {
  const [base, candidate, count = "400", pairs = "3"] = process.argv.slice(2);
  if (!base || !candidate) throw new Error("usage: node scripts/bench-allocations.mjs BASE_DIST CANDIDATE_DIST [iterations=400] [pairs=3]");
  const results = [];
  for (const mode of ["cpu", "allocation"]) {
    for (let pair = 0; pair < Number(pairs); pair += 1) {
      const arms = pair % 2 === 0 ? [["base", base], ["candidate", candidate]] : [["candidate", candidate], ["base", base]];
      for (const [arm, directory] of arms) {
        const child = spawnSync(process.execPath, ["--expose-gc", process.argv[1], "arm", directory, mode, count], { encoding: "utf8" });
        if (child.status !== 0) throw new Error(child.stderr || `arm exited ${child.status}`);
        const rows = JSON.parse(child.stdout);
        results.push({ mode, pair, arm, rows });
        process.stderr.write(`${mode} pair ${pair + 1} ${arm} complete\n`);
      }
    }
  }
  const summary = cases.map(([name]) => {
    const values = (arm, metric) => results.filter((run) => run.arm === arm).flatMap((run) => run.rows.filter((row) => row.name === name && row[metric] !== undefined).map((row) => row[metric]));
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
    const hashes = results.flatMap((run) => run.rows.filter((row) => row.name === name).map((row) => row.hash));
    assert.equal(new Set(hashes).size, 1, `${name}: output changed`);
    return { name, baseCpuUs: mean(values("base", "cpuUs")), candidateCpuUs: mean(values("candidate", "cpuUs")), baseBytes: mean(values("base", "bytes")), candidateBytes: mean(values("candidate", "bytes")) };
  });
  console.log(JSON.stringify({ node: process.version, iterations: Number(count), pairs: Number(pairs), summary, results }, null, 2));
}
