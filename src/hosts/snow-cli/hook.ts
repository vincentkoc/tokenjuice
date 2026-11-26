import { compactSnowCliResult } from "../../core/integrations/compact-snow-cli-result.js";

export async function runSnowCliAfterToolCallHook(rawText: string): Promise<number> {
  try {
    const replacement = await compactSnowCliResult(JSON.parse(rawText) as unknown);
    if (replacement !== undefined) {
      // Snow reserves exit 1 for a replacement and keeps the tool's status fields.
      process.stdout.write(replacement);
      return 1;
    }
  } catch {
    // Empty stdout and exit 0 leave the original tool result in place.
  }
  return 0;
}
