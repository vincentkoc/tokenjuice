import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function bundleExtensionRuntimeSource(
  host: string,
  resolveEntryPoint: () => Promise<string>,
): Promise<string> {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch (error) {
    throw new Error(`unable to load esbuild to bundle the ${host} runtime from source: ${String(error)}`);
  }

  const entryPoint = await resolveEntryPoint();
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    write: false,
  });

  const runtimeSource = result.outputFiles[0]?.text;
  if (!runtimeSource) {
    throw new Error(`failed to bundle the ${host} runtime: esbuild produced no output`);
  }

  return runtimeSource;
}

async function resolveRuntimeEntryPoint(host: string, moduleUrl: string): Promise<string> {
  const candidates = [
    fileURLToPath(new URL("./extension/runtime.ts", moduleUrl)),
    fileURLToPath(new URL(`../../../src/hosts/${host}/extension/runtime.ts`, moduleUrl)),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`unable to resolve ${host} runtime source entrypoint from ${candidates.join(", ")}`);
}

export async function loadExtensionRuntimeSource(host: string, moduleUrl: string, local = false): Promise<string> {
  if (local) {
    return await bundleExtensionRuntimeSource(host, () => resolveRuntimeEntryPoint(host, moduleUrl));
  }

  const runtimeAssetUrl = new URL("./extension/runtime.js", moduleUrl);

  try {
    return await readFile(runtimeAssetUrl, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return await bundleExtensionRuntimeSource(host, () => resolveRuntimeEntryPoint(host, moduleUrl));
}
