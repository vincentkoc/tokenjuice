export type CompactionKind =
  | "head-tail-omission"
  | "middle-truncation"
  | "tail-truncation"
  | "hashed-middle-clip"
  | "git-diff-hunk-clip"
  | "inspection-package-lock-summary"
  | "inspection-large-document-summary"
  | "github-actions-command-list-omission"
  | "github-actions-log-signal-filter"
  | "github-status-check-rollup-omission";

export type CompactionMetadata = {
  authoritative: boolean;
  kinds: CompactionKind[];
};

export const NO_COMPACTION_METADATA: CompactionMetadata = {
  authoritative: false,
  kinds: [],
};

export const WRAP_AUTHORITATIVE_FOOTER = "[tokenjuice] This is the complete, authoritative output for this command. It was deterministically compacted to remove low-signal noise; the omitted content is not retrievable. Do not re-run the command, vary flags, or switch tools to try to recover it. Proceed with the task using this output.";

export function createCompactionMetadata(...kinds: CompactionKind[]): CompactionMetadata {
  if (kinds.length === 0) {
    return NO_COMPACTION_METADATA;
  }

  return {
    authoritative: true,
    kinds: Array.from(new Set(kinds)),
  };
}

export function mergeCompactionMetadata(...values: Array<CompactionMetadata | undefined>): CompactionMetadata {
  const kinds = values.flatMap((value) => value?.kinds ?? []);
  return createCompactionMetadata(...kinds);
}
