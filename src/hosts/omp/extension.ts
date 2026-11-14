import { compactOmpResult, type OmpResultReplacement } from "../../core/integrations/compact-omp-result.js";

export type OmpExtensionAPI = {
  on(event: "tool_result", handler: (event: unknown, context: { cwd: string }) => Promise<OmpResultReplacement | undefined>): void;
};

/** Loaded by OMP's package.json#omp.extensions native plugin manager. */
export default function tokenjuiceOmpExtension(omp: OmpExtensionAPI): void {
  omp.on("tool_result", async (event, context) => {
    try {
      return await compactOmpResult(event, context.cwd);
    } catch {
      return undefined;
    }
  });
}
