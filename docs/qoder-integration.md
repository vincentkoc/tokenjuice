# Qoder integration

`tokenjuice install qoder` inserts a marker-delimited instruction block into
the current git/project root `AGENTS.md`. Qoder rules are compatible with
`AGENTS.md`, so this gives Qoder the same terminal-output guidance as other
instruction-based agents without claiming a hook capability it does not document
for output replacement.

```bash
tokenjuice install qoder
tokenjuice doctor qoder
tokenjuice uninstall qoder
```

By default, tokenjuice resolves the nearest git root before writing
`AGENTS.md`. Set `QODER_PROJECT_DIR=/path/to/workspace` to override the target
workspace explicitly.

The installed block tells Qoder CLI to use `tokenjuice wrap -- <command>` for
terminal commands likely to produce long output, and to use
`tokenjuice wrap --raw -- <command>` only when raw bytes are required.

`doctor qoder` reports `ok` when the `AGENTS.md` block exists, includes
tokenjuice wrap guidance, includes the raw escape hatch, and does not suggest
the full-output escape hatch.

This integration is guidance-only. Qoder has a documented hooks system, but its
documented `PostToolUse` hook examples do not establish that a hook can replace
terminal output after execution. A future hook-backed adapter should only be
added when that contract is verified against Qoder itself.
