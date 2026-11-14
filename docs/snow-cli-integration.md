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

The `snow-native` CI job pins `snow-ai@0.9.15` and uses isolated home/config
paths plus a loopback chat-completions server with a dummy credential. It runs
Snow's native `--ask` mode, discovers `terminal-execute` through `tool_search`,
and checks actual next-model requests before installation, after installation,
and after uninstall. The hook receipt must report exit 1 for the compacted
listing and exit 0 for exact reads, raw bypass and a long exit-7 failure. Those
three outputs retain complete stdout, stderr and status. No paid provider or
existing host configuration is used.

After building tokenjuice, run the same fixture with a separately installed
pinned host:

```sh
node scripts/snow-cli-e2e.mjs /path/to/snow-ai/bundle/cli.mjs
```

Native acceptance is pending the hosted fixture result. A passing doctor alone
establishes configuration health, not model-visible delivery.
