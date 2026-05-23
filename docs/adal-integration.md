# AdaL CLI integration

AdaL CLI support is beta.

`tokenjuice install adal` inserts a marker-delimited instruction block into
the current git/project root `AGENTS.md`. AdaL CLI documents `AGENTS.md`
project context, so tokenjuice uses that shared project instruction surface
instead of inventing a hook contract.

```bash
tokenjuice install adal
tokenjuice doctor adal
tokenjuice uninstall adal
```

By default, tokenjuice resolves the nearest git root before writing
`AGENTS.md`. Set `ADAL_PROJECT_DIR=/path/to/workspace` to override the target
workspace explicitly.

The installed block tells AdaL CLI to use `tokenjuice wrap -- <command>` for
terminal commands likely to produce long output, and to use
`tokenjuice wrap --raw -- <command>` only when raw bytes are required.

Existing `AGENTS.md` content is backed up before install and preserved outside
the managed tokenjuice block. Uninstall removes only the tokenjuice block.

`doctor adal` reports `ok` when the `AGENTS.md` block exists, includes
tokenjuice wrap guidance, includes the raw escape hatch, and does not suggest
the full-output escape hatch.

This integration is guidance-only. AdaL project instructions are prompts that
guide agent behavior; they do not intercept or replace terminal command output.
