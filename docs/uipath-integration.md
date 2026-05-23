# UiPath integration

UiPath support is beta.

`tokenjuice install uipath` inserts a marker-delimited instruction block into
the current git/project root `AGENTS.md`. UiPath for Coding Agents supports
agents that use the `AGENTS.md` open format, so tokenjuice uses that shared
project instruction surface instead of claiming command-output interception.

```bash
tokenjuice install uipath
tokenjuice doctor uipath
tokenjuice uninstall uipath
```

By default, tokenjuice resolves the nearest git root before writing
`AGENTS.md`. Set `UIPATH_PROJECT_DIR=/path/to/workspace` to override the target
workspace explicitly.

The installed block tells coding agents working through UiPath to use
`tokenjuice wrap -- <command>` for terminal commands likely to produce long
output, and to use `tokenjuice wrap --raw -- <command>` only when raw bytes are
required.

Existing `AGENTS.md` content is backed up before install and preserved outside
the managed tokenjuice block. Uninstall removes only the tokenjuice block.

`doctor uipath` reports `ok` when the `AGENTS.md` block exists, includes
tokenjuice wrap guidance, includes the raw escape hatch, and does not suggest
the full-output escape hatch.

This integration is guidance-only. UiPath-compatible coding agents can read
project instructions, but those instructions do not replace terminal command
output.
