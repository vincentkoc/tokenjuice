# OpenCode V2 integration

The V2 runtime uses the default plugin object (`id`, `setup`) and
`ctx.tool.hook("execute.after", ...)`. It handles the `shell` tool, whose completed
result has structured output plus model-facing content. It replaces matching
text in both representations and preserves metadata and other result fields.

The contract is pinned to [OpenCode v2.0.18](https://github.com/anomalyco/opencode/tree/v2.0.18):
[plugin lifecycle](https://github.com/anomalyco/opencode/blob/v2.0.18/packages/plugin/src/promise/plugin.ts),
[tool hooks](https://github.com/anomalyco/opencode/blob/v2.0.18/packages/plugin/src/promise/tool.ts)
and [shell results](https://github.com/anomalyco/opencode/blob/v2.0.18/packages/core/src/tool/plugin/shell.ts).
The existing `opencode` installer and V1 runtime remain independent. V1 fixture
results do not establish V2 loading or model-visible replacement.

Only successful, untruncated foreground output with an unchanged single-text
projection is eligible. Errors, nonzero exits, timeouts, signals, background
results, mixed content and prior policy notices remain intact. Explicit
`tokenjuice wrap --raw -- <command>` and exact file reads bypass compaction.

The plugin instance directory does not identify every session's execution
directory. This runtime therefore skips inventory commands as well as file
reads, instead of inferring filesystem context from `ctx.location.directory`.

## Install and remove

```sh
tokenjuice install opencode-v2
tokenjuice doctor opencode-v2
tokenjuice uninstall opencode-v2
```

The V2 target writes a self-contained `plugins/tokenjuice-v2/index.js` beneath
`OPENCODE_CONFIG_DIR`, or the default `$XDG_CONFIG_HOME/opencode` (falling back to
`~/.config/opencode`). V2 discovers this plugin directory. Installation refuses
foreign files and symlink/hardlink targets, backs up owned updates, and preserves
V1's `plugins/tokenjuice.js`. Uninstall removes only the owned entrypoint; the
directory, sibling files and backups remain. Use `--local` for source-checkout
installation and doctor checks.

Restart the V2 server and start a fresh session. Inspect plugin status for
`tokenjuice`, then check a successful noisy command in the next model request,
an exact read, an explicit raw wrapper and a failure. Doctor checks local bundle
content, not server loading or execution. Real V2 acceptance remains unqualified.
V1 hooks do not run under V2; see the [official migration guide](https://dev.opencode.ai/v2/docs/build/plugins/migrate-v1).
After verifying V2, `tokenjuice uninstall opencode` can remove the old V1 file.
