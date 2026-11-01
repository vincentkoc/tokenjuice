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
