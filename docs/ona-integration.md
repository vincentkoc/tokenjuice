# Ona integration

Ona support is beta.

`tokenjuice install ona` inserts a marker-delimited instruction block into the
current git/project root `AGENTS.md`. Ona documents `AGENTS.md` as a way to
teach agents codebase conventions, so tokenjuice uses that project instruction
surface instead of claiming command-output interception.

```bash
tokenjuice install ona
tokenjuice doctor ona
tokenjuice uninstall ona
```

By default, tokenjuice resolves the nearest git root before writing
`AGENTS.md`. Set `ONA_PROJECT_DIR=/path/to/workspace` to override the target
workspace explicitly.

The installed block tells Ona Agent to use `tokenjuice wrap -- <command>` for
terminal commands likely to produce long output, and to use
`tokenjuice wrap --raw -- <command>` only when raw bytes are required.

Existing `AGENTS.md` content is backed up before install and preserved outside
the managed tokenjuice block. Uninstall removes only the tokenjuice block.

`doctor ona` reports `ok` when the `AGENTS.md` block exists, includes
tokenjuice wrap guidance, includes the raw escape hatch, and does not suggest
the full-output escape hatch.

This integration is guidance-only. Ona can read project instructions, but those
instructions do not replace terminal command output.
