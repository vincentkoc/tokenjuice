export function buildCompactedOutputContext(inlineText: string): string {
  return `${inlineText}\n\ncompacted. if output looks incomplete, rerun with \`tokenjuice wrap --raw -- <command>\`.`;
}
