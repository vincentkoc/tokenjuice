export function buildCompactionHint(rawRefId?: string): string {
  if (rawRefId) {
    return `raw saved: \`tokenjuice cat ${rawRefId}\`.`;
  }
  return "need raw? `tokenjuice wrap --raw -- <command>`.";
}

export function buildCompactedOutputContext(inlineText: string): string {
  return `${inlineText}\n\n${buildCompactionHint()}`;
}
