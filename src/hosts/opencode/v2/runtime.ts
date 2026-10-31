import { compactOpenCodeV2Result } from "../../../core/integrations/compact-opencode-v2-result.js";

export async function onOpenCodeV2ToolResult(event: unknown): Promise<void> {
  if (typeof event !== "object" || event === null || Array.isArray(event)) return;
  const mutable = event as Record<string, unknown>;
  const original = mutable.result;
  try {
    const replacement = await compactOpenCodeV2Result(event);
    if (replacement && mutable.result === original) mutable.result = replacement;
  } catch {
    // Optional compaction cannot turn a completed tool call into a failure.
  }
}

type Context = {
  tool: {
    hook(name: "execute.after", callback: typeof onOpenCodeV2ToolResult): Promise<{ dispose(): Promise<void> }>;
  };
};

const plugin = {
  id: "tokenjuice",
  async setup(context: Context): Promise<() => Promise<void>> {
    const registration = await context.tool.hook("execute.after", onOpenCodeV2ToolResult);
    return () => registration.dispose();
  },
};

export default plugin;
