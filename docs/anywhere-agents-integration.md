# anywhere-agents integration

anywhere-agents support is beta.

`tokenjuice install anywhere-agents` inserts a marker-delimited instruction
block into the current git/project root `AGENTS.local.md`. anywhere-agents
layers that file after its generated `AGENTS.md`, so tokenjuice writes to the
durable local override instead of the generated root file or downstream files.

```bash
tokenjuice install anywhere-agents
tokenjuice doctor anywhere-agents
tokenjuice uninstall anywhere-agents
```

By default, tokenjuice resolves the nearest git root before writing
`AGENTS.local.md`. Set `ANYWHERE_AGENTS_PROJECT_DIR=/path/to/workspace` to
override the target workspace explicitly.

The installed block tells agents that receive anywhere-agents-deployed
instructions to use `tokenjuice wrap -- <command>` for terminal commands likely
to produce long output, and to use `tokenjuice wrap --raw -- <command>` only
when raw bytes are required. Run `anywhere-agents` after install or uninstall
so generated downstream agent files receive the updated guidance.

Existing `AGENTS.local.md` content is backed up before install and preserved
outside the managed tokenjuice block. Uninstall removes only the tokenjuice
block.

`doctor anywhere-agents` reports `ok` when the `AGENTS.local.md` block exists,
includes tokenjuice wrap guidance, includes the raw escape hatch, includes
anywhere-agents sync guidance, and does not suggest the full-output escape
hatch.

This integration is guidance-only. anywhere-agents handles composition and
deployment; it does not intercept or replace terminal command output for the
downstream tools.
