import { compactDeepSeekResult } from "../../core/integrations/compact-deepseek-result.js";

/** Structural boundary for the Cordis tools/post-execute waterfall. */
export async function onDeepSeekPostExecute(
  execution: unknown,
  result: unknown,
  next: () => Promise<unknown>,
): Promise<unknown> {
  // Delegate first: downstream policy failures and replacements remain authoritative.
  const decision = await next();
  if (typeof decision !== "object" || decision === null || Array.isArray(decision)) return decision;
  const accepted = decision as Record<string, unknown>;
  if (accepted.kind !== "accept" || "content" in accepted || "value" in accepted) return decision;
  try {
    const content = await compactDeepSeekResult(execution, result);
    return content ? { ...accepted, content } : decision;
  } catch {
    return decision;
  }
}

export const name = "tokenjuice";
export const inject = ["tools"];

export function apply(context: {
  on(event: "tools/post-execute", listener: typeof onDeepSeekPostExecute): unknown;
}): void {
  context.on("tools/post-execute", onDeepSeekPostExecute);
}
