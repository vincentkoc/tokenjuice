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

This change supplies the runtime and contract tests. V2 directory packaging,
installation and live-host acceptance are separate work. V1 hooks do not run
under V2; see the [official migration guide](https://dev.opencode.ai/v2/docs/build/plugins/migrate-v1).
