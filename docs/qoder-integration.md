# Qoder integration

`tokenjuice install qoder` inserts a marker-delimited instruction block into
the current git/project root `AGENTS.md`. Qoder rules are compatible with
`AGENTS.md`, so this gives Qoder the same terminal-output guidance as other
instruction-based agents. This remains the default compatibility mode.

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

## Native output replacement

Qoder documents synchronous `PostToolUse` replacement through
`hookSpecificOutput.updatedToolOutput`. Its value must be a **string**. The
`qoder-post-tool-use` entrypoint serializes the complete Bash response, changing
only `stdout`; stderr, exit status and extra fields remain present.

For an advanced manual install, merge this group into `hooks.PostToolUse` in
`~/.qoder/settings.json`, using your absolute tokenjuice executable path:

```json
{
  "matcher": "Bash",
  "hooks": [{ "type": "command", "command": "/absolute/path/to/tokenjuice qoder-post-tool-use" }]
}
```

Do not set the hook to asynchronous execution. The handler leaves nonzero exits,
interrupted/background jobs, unknown response shapes, exact file reads and
explicit tokenjuice wrappers unchanged. Malformed input or compaction failure
returns `{}`. The instruction installer and doctor above manage `AGENTS.md`;
they do not install or validate this manual hook. A native CLI lifecycle will
follow separately.

Contract: [Qoder hooks](https://docs.qoder.com/cli/hooks) and
[SDK types](https://docs.qoder.com/cli/sdk/references-typescript).
Live Qoder execution has not yet been qualified.
