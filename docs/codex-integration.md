# Codex CLI integration

Use `tokenjuice wrap -- <command>` for compaction in Codex CLI 0.166.0. The native
`PostToolUse` Bash payload supplies plain output without the command's exit
status. Replacing that output could remove the failure status that Codex adds
before its next model request. The hook therefore leaves these results intact
and adds no duplicate summary.

```sh
tokenjuice wrap -- find src -type f
tokenjuice wrap --raw -- find src -type f
```

The optional hook installer remains available for payloads that supply an
explicit exit code:

```sh
tokenjuice install codex
tokenjuice doctor codex
tokenjuice uninstall codex
```

Review the installed hook through Codex's `/hooks` interface before enabling it.
Doctor checks the installed configuration; an `ok` result does not establish that
the native host supplies the status needed for compaction. The local debug record
reports `missing-exit-code` when the hook keeps a result for this reason.

For eligible successful payloads, the hook returns `continue: false` with a
delimited observation in `stopReason`. This replaces the original result without
adding a second developer message or rejecting a nested tool promise. Explicit
failures, raw bypasses, and exact reads retain their existing guards. See the
[official hook output contract](https://learn.chatgpt.com/docs/hooks).

## Native acceptance test

```sh
pnpm build
node scripts/codex-e2e.mjs /path/to/codex
```

The fixture runs pinned Codex CLI 0.166.0 against a loopback Responses API endpoint
in a disposable home and project. It captures the next model request after each
real shell command, comparing baseline and installed sessions for a complete
80-file listing, exact CRLF content, explicit wrapping, raw bypass, and a failed
listing with exit code 7. It checks native command status events, verifies that
the installed hook actually ran its status guard, and rejects duplicate
observations. Chunk IDs and elapsed time are excluded from comparisons; output
and exit status remain exact.

The fixture uses a local model catalog, file-based authentication storage, and no
provider credentials. Its one-off `--dangerously-bypass-hook-trust` invocation is
limited to the freshly installed hook after checking its exact executable,
arguments, matcher, and sole hook entry. The native read-only sandbox remains
enabled. Real user hook trust and configuration are untouched.

This qualifies the pinned foreground shell path and explicit wrapping. Remote
provider availability, reasoning quality, and code-mode execution are outside
this test.
