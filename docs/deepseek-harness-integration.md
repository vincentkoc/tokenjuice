# DeepSeek Harness integration

The native runtime plugin listens to Cordis `tools/post-execute` and replaces
the model-facing content of successful foreground `bash` results. It compacts
stdout while preserving stderr and leaves canonical values unchanged. It does
not change approvals, command arguments or execution status.

The contract is pinned to DeepSeek Harness `0.2.2-alpha.2`, source revision
`ce7073d51254c26cd63b22a60835b8f948deb447`:
[post-execute waterfall](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/tools/src/events.ts),
[decision types](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/tools/src/contracts.ts),
[Bash rendering](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/shell/tool-bash/src/render.ts).

## Preserved outcomes

The plugin delegates to downstream policies first. Blocks, content/value
replacements and policy errors remain authoritative; additional contexts are
retained. Compaction errors accept the original result.

Nonzero exits, infrastructure failures, timeouts, cancellation, stopped jobs,
background/promoted jobs, truncated streams, sandbox denials and unfamiliar
projections remain intact. Exact file reads and explicit
`tokenjuice wrap --raw -- <command>` bypass compaction.

## Native and PTC modes

Native mode consumes the content projection. PTC scripts consume canonical
values such as `result.stdout.text`; changing those values could break parsers.
The plugin therefore skips PTC sub-dispatches. In PTC workflows, explicitly run
`tokenjuice wrap -- <command>` for output intended for model consumption and use
`--raw` for exact data. Do not count this plugin as transparent PTC compaction.

This change supplies the runtime module. Bundle packaging and profile activation
are separate work; installing a dependency alone does not activate a Cordis
plugin. Live Harness execution remains unqualified.
