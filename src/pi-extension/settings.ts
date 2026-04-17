import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isRecord } from "./pi-types.js";
import { formatErrorMessage } from "./utils.js";

export function getAutoCompactionEnabled(projectRoot: string): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
  const settingsPaths = [join(agentDir, "settings.json"), join(projectRoot, ".pi", "settings.json")];
  let enabled = true;

  for (const settingsPath of settingsPaths) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw new Error(`tokenjuice failed to load pi settings from ${settingsPath}: ${formatErrorMessage(error)}`);
    }

    if (isRecord(parsed) && isRecord(parsed.compaction) && typeof parsed.compaction.enabled === "boolean") {
      enabled = parsed.compaction.enabled;
    }
  }

  return enabled;
}
