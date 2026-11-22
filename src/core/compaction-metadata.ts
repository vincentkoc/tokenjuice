export type CompactionKind =
  | "failure-signal-filter"
  | "head-tail-omission"
  | "middle-truncation"
  | "tail-truncation"
  | "hashed-middle-clip"
  | "git-diff-hunk-clip"
  | "inspection-package-lock-summary"
  | "repeated-emoji-banner-omission"
  | "github-actions-command-list-omission"
  | "github-actions-log-signal-filter"
  | "github-status-check-rollup-omission"
  | "no-omit-head-tail-passthrough"
  | "no-omit-char-clip-passthrough"
  | "no-omit-domain-passthrough"
  | "rule-line-filter"
  | "rule-output-replacement";

export type CompactionMetadata = {
  authoritative: boolean;
  kinds: CompactionKind[];
};

export const NO_COMPACTION_METADATA: CompactionMetadata = {
  authoritative: false,
  kinds: [],
};

export const WRAP_COMPACTION_FOOTER_PREFIX = "[tokenjuice]";

/**
 * Build the neutral marker appended to compacted wrap output.
 *
 * It states only facts: that output was compacted to save tokens and how many
 * characters were omitted. It contains no agent-directed instructions and makes
 * no claim that the omitted content is unrecoverable, so it never discourages
 * the reader from verifying or re-running. This keeps tokenjuice a transparent
 * output adapter rather than a source of do-not-verify directives. The caller
 * appends a factual pointer to stored output when one exists.
 */
export function buildCompactionFooter(rawChars: number, reducedChars: number): string {
  const omitted = Math.max(0, rawChars - reducedChars);
  return `${WRAP_COMPACTION_FOOTER_PREFIX} Output compacted to save tokens (${omitted} of ${rawChars} characters omitted).`;
}

function buildCompactionMetadata(authoritative: boolean, ...kinds: CompactionKind[]): CompactionMetadata {
  if (kinds.length === 0) {
    return NO_COMPACTION_METADATA;
  }

  return {
    authoritative,
    kinds: Array.from(new Set(kinds)),
  };
}

export function createCompactionMetadata(...kinds: CompactionKind[]): CompactionMetadata {
  return buildCompactionMetadata(true, ...kinds);
}

export function createPassthroughCompactionMetadata(...kinds: CompactionKind[]): CompactionMetadata {
  return buildCompactionMetadata(false, ...kinds);
}

export function mergeCompactionMetadata(...values: Array<CompactionMetadata | undefined>): CompactionMetadata {
  const presentValues = values.filter((value): value is CompactionMetadata => Boolean(value) && (value?.kinds.length ?? 0) > 0);
  if (presentValues.length === 0) {
    return NO_COMPACTION_METADATA;
  }

  const kinds = presentValues.flatMap((value) => value.kinds);
  return buildCompactionMetadata(presentValues.every((value) => value.authoritative), ...kinds);
}
