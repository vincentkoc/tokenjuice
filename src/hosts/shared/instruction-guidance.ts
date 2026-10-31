import { collectGuidanceIssues } from "./instruction-file.js";

export const TOKENJUICE_WRAP_COMMAND = "tokenjuice wrap -- <command>";
export const TOKENJUICE_RAW_COMMAND = "tokenjuice wrap --raw -- <command>";
export const TOKENJUICE_FULL_COMMAND = "tokenjuice wrap --full -- <command>";

export function collectTokenjuiceGuidanceIssues(
  text: string,
  options: { configuredLabel: string; singular?: boolean },
): string[] {
  const { configuredLabel, singular = false } = options;
  return collectGuidanceIssues(text, {
    required: [
      {
        requiredText: TOKENJUICE_WRAP_COMMAND,
        missingIssue: `configured ${configuredLabel} ${singular ? "is" : "are"} missing tokenjuice wrap guidance`,
      },
      {
        requiredText: TOKENJUICE_RAW_COMMAND,
        missingIssue: `configured ${configuredLabel} ${singular ? "is" : "are"} missing the raw escape hatch`,
      },
    ],
    forbidden: [
      {
        forbiddenText: TOKENJUICE_FULL_COMMAND,
        presentIssue: `configured ${configuredLabel} still ${singular ? "suggests" : "suggest"} the full escape hatch`,
      },
    ],
  });
}

export type TokenjuiceGuidanceOptions = {
  wrapBullet?: string;
};

export function buildTokenjuiceGuidanceBullets(options: TokenjuiceGuidanceOptions = {}): string[] {
  const wrapBullet = options.wrapBullet ?? `- For terminal commands likely to produce long output, run them through \`${TOKENJUICE_WRAP_COMMAND}\`.`;
  return [
    wrapBullet,
    "- Treat compacted tokenjuice output as authoritative unless it explicitly says raw output is required.",
    `- If raw bytes are required, rerun the command with exactly \`${TOKENJUICE_RAW_COMMAND}\`.`,
    "- Do not suggest both raw and full reruns; use the raw escape hatch.",
  ];
}
