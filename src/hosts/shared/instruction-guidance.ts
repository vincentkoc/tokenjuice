export const TOKENJUICE_WRAP_COMMAND = "tokenjuice wrap -- <command>";
export const TOKENJUICE_RAW_COMMAND = "tokenjuice wrap --raw -- <command>";
export const TOKENJUICE_FULL_COMMAND = "tokenjuice wrap --full -- <command>";

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
