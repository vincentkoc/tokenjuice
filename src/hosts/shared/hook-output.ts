export function buildCompactionHint(rawRefId?: string): string {
  if (rawRefId) {
    return `raw saved: \`tokenjuice cat ${rawRefId}\`.`;
  }
  return "need raw? `tokenjuice wrap --raw -- <command>`.";
}

export function buildCompactedOutputContext(inlineText: string): string {
  return `${inlineText}\n\n${buildCompactionHint()}`;
}

export function writeHookJsonLine(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function writeEmptyHookJsonLine(): void {
  writeHookJsonLine({});
}
