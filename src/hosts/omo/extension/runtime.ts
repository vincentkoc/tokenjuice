import { compactOmoResult } from "../../../core/integrations/compact-omo-result.js";

type OmoApi = {
  on(event: "tool_result", handler: (event: unknown, context: { cwd?: string }) => unknown): void;
};

export default function tokenjuiceOmoExtension(api: OmoApi): void {
  api.on("tool_result", async (event, context) => {
    try {
      return await compactOmoResult(event, context?.cwd);
    } catch {
      // A compaction failure leaves the host's original result intact.
      return undefined;
    }
  });
}
