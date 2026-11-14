# Snow CLI integration

Snow CLI support is beta. Install the native `afterToolCall` hook:

```sh
tokenjuice install snow-cli
tokenjuice doctor snow-cli
tokenjuice uninstall snow-cli
```

The installer updates `~/.snow/hooks/afterToolCall.json`, or
`$SNOW_CONFIG_DIR/hooks/afterToolCall.json` for an absolute configured directory.
It preserves unrelated rules and configuration and removes only tokenjuice's
hook. A non-empty project `.snow/hooks/afterToolCall.json` overrides global
rules; install into the effective file through the library's explicit path
argument if needed. Doctor checks the selected file, not a running session.

## Contract

Snow's `afterToolCall` hook receives `toolName`, `args`, `result`, and `error`.
For `terminal-execute`, `result.content` is the serialized terminal result.
Tokenjuice replaces only its successful `stdout`, preserving `stderr`, exit
status, command and other fields. The host preserves the surrounding tool
identity and status. Exit **1** requests replacement in Snow's documented
protocol; exit **0** with empty output leaves the result unchanged.

Malformed input, unknown result formats, failed commands, remote working
directories, interactive commands, AI-summarized output and background markers
pass through. Exact reads and `tokenjuice wrap --raw -- <command>` bypass
compaction. No hook approval decision is changed. Output already truncated by
Snow is not recovered by this adapter.

The runtime contract is grounded in the upstream [hook documentation](https://github.com/MayDay-wpf/snow-cli/blob/main/docs/usage/en/07.Hooks%20Configuration.md),
[replacement strategy](https://github.com/MayDay-wpf/snow-cli/blob/main/source/utils/execution/hookStrategies.ts),
and [tool result consumer](https://github.com/MayDay-wpf/snow-cli/blob/main/source/utils/execution/toolExecutor.ts).

## Verification

Regression tests cover the file lifecycle, malformed input, explicit success
status, complete failure passthrough, raw and exact reads. Run:

```sh
pnpm exec vitest run test/hosts/snow-cli.test.ts
pnpm verify
pnpm verify:package
```

Native Snow installation discovery, hook invocation and model-visible delivery
remain unqualified. Verify a fresh isolated Snow session with a noisy success,
an exact read, raw bypass and a long exit-7 failure before relying on automatic
compaction. A passing doctor only establishes configuration health.
