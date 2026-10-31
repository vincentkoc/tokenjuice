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
content, not server loading or execution. An installed-bundle contract imports
the generated entrypoint outside the source tree and checks registration,
coherent replacement, raw/failure preservation and removal.

## Native acceptance

```sh
pnpm build
node scripts/opencode-v2-e2e.mjs /path/to/opencode
```

The fixture uses native **v2.0.18**, with baseline and installed-plugin sessions
in an isolated home and disposable Git repository. Each `opencode run
--standalone` invocation owns a private server. A loopback Chat Completions
endpoint supplies fixed `shell` calls and captures the next model request.
No real credentials or user settings are used.

The installed plugin must shorten Git status containing 80 modified files.
Exact reads retain CRLF and trailing newlines; inventory commands, explicit raw
wrapping and large failed output remain identical to baseline. Explicit wrapping
also shortens output. Native CLI events must agree with the model-facing content
and preserve exit status 7, all 80 failure lines, stderr and the host's exit
notice. This establishes native plugin discovery and model-visible replacement
for the pinned host, beyond the separate installed-bundle contract.

Remote provider availability, other versions, interactive permissions and
propagation into an existing shared or T3 server remain unqualified.
V1 hooks do not run under V2; see the [official migration guide](https://dev.opencode.ai/v2/docs/build/plugins/migrate-v1).
After verifying V2, `tokenjuice uninstall opencode` can remove the old V1 file.
