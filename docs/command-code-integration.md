# Command Code integration

Automatic hook compaction is retired. Command Code's documented `PostToolUse`
`additionalContext` is appended to the original tool result. Adding a summary
there increases context instead of replacing the noisy output. `suppressOutput`
controls the hook audit log, not the model's tool result.

Use explicit wrapping when a shell command needs compaction:

```bash
tokenjuice wrap -- <command>
tokenjuice wrap --raw -- <command>
```

This is manual usage. It does not prove that Command Code automatically chooses
wrapping or that a native session has loaded an integration.

## Remove a legacy hook

```bash
tokenjuice doctor command-code
tokenjuice uninstall command-code
```

The deprecated installer rejects new installs before creating settings or
backups. A remaining generated hook is reported as broken. Its stale runtime
handler returns `{}` and adds no context.

Cleanup removes recognized generated `command-code-post-tool-use` command
entries from `PostToolUse`, preserving unrelated hooks, settings, file modes,
existing sidecars and concurrent edits. Malformed JSON and symlinked paths are
left unchanged. Custom scripts that merely mention the subcommand are retained.

The default cleanup scope is `~/.commandcode/settings.json`.
`COMMANDCODE_HOME` overrides that directory; `COMMANDCODE_PROJECT_DIR` selects
that project's `.commandcode/settings.json` and takes precedence. Clean each
previously used scope separately.

## Native acceptance status

Command Code `command-code@1.88.2` was installed in an isolated directory and
reported version `1.88.2` on macOS arm64. A fresh private HOME contained a custom
OpenAI-compatible loopback provider, with local-only mode enabled. The headless
CLI exited 3 with `Not authenticated. Please run "cmd login" first.` before any
provider request. No live tool execution or model-visible result claim is made.

The exact unblock is an authorized Command Code authentication setup for an
isolated native test. Until then, full host acceptance remains unqualified.
Lifecycle and cleanup tests validate tokenjuice's local behavior; they are not
native host E2E evidence.

Contract references: [hook output semantics](https://commandcode.ai/docs/hooks),
[BYOK and local-only mode](https://commandcode.ai/docs/byok), and
[headless CLI options](https://commandcode.ai/docs/reference/cli).
