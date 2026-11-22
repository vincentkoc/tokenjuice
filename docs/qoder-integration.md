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

Install and check the native user-level hook:

```bash
tokenjuice install qoder-cli
tokenjuice doctor qoder-cli
tokenjuice uninstall qoder-cli
```

The `qoder-cli` target manages only `~/.qoder/settings.json`; it leaves the
`qoder` instruction block intact. Use `--local` on install and doctor only when
pinning a development checkout. Restart Qoder CLI and verify in a fresh session.

For an advanced manual install in a project scope, merge this group into
`hooks.PostToolUse`, using your absolute tokenjuice executable path:

```json
{
  "matcher": "Bash",
  "hooks": [{ "type": "command", "command": "/absolute/path/to/tokenjuice qoder-post-tool-use", "async": false }]
}
```

Do not set the hook to asynchronous execution. The handler leaves nonzero exits,
interrupted/background jobs, unknown response shapes, exact file reads and
explicit tokenjuice wrappers unchanged. Malformed input or compaction failure
returns `{}`. User settings, `.qoder/settings.json` and
`.qoder/settings.local.json` merge their hook lists. Check all three before
migrating a manual installation; keep one tokenjuice hook. Native doctor checks
only its managed user file and reports duplicates there. Other replacement
hooks can overwrite its result; verify the final model-visible response.

To move from guidance to native replacement, install `qoder-cli`, verify it in
a fresh session, then optionally run `tokenjuice uninstall qoder` to remove the
guidance block. Explicitly wrapped commands remain untouched by the native hook.

Contract: [Qoder hooks](https://docs.qoder.com/cli/hooks) and
[SDK types](https://docs.qoder.com/cli/sdk/references-typescript).
The installed-hook contract runs the packaged CLI, reads its installed command,
executes that command as a child process, and checks serialized response
replacement, raw/exact-read bypass, failure/background preservation, reinstall
idempotence and surgical uninstall. This validates tokenjuice's installed
process boundary. Live Qoder execution has not yet been qualified.

## Native acceptance prerequisite

The published `@qoder-ai/qodercli@1.1.81` JavaScript entrypoint starts under Node
26 in an isolated home: `bundle/qodercli.js --version`, `--help` and
`hooks --help` succeed. The hook subcommand migrates Claude Code configuration;
it does not expose a credential-free tool-execution fixture. Startup and help
output therefore do not qualify hook loading or replacement in a model request.

Qoder's [SDK authentication guide](https://docs.qoder.com/cli/sdk/authentication)
requires a PAT, a service account or an existing local sign-in for SDK sessions.
Its [Custom Models guide](https://docs.qoder.com/cli/custom-models) requires the
`/model` Custom wizard and the catalog available to the current account. It
explicitly excludes manual BYOK configuration in `settings.json`. The hook
configuration example above is independent of BYOK configuration.

A live acceptance run needs an approved Qoder account session and a model route
available to that account. A loopback endpoint must be supported by its actual
catalog before using a credential-free provider fixture; a fabricated account
or undocumented model setting does not establish this support. No account sign-in,
credential lookup or paid model request is part of the automated hook contracts.

After that prerequisite is available, qualify a disposable project:

1. Record the actual CLI entrypoint/version, account-selected model route and
   effective user/project/local hook scopes. Keep one synchronous tokenjuice
   Bash replacement hook and preserve unrelated hooks.
2. Start a fresh native session. Exercise noisy Git status for 80 modified files,
   an exact read containing CRLF and trailing blank lines, explicit
   `tokenjuice wrap --raw`, and a command that emits 80 stdout lines plus stderr
   and exits 7.
3. Inspect the next model request or authoritative provider transcript after
   all replacement hooks. Verify compacted successful output, exact/raw bytes,
   unchanged failed output and exit status. A shorter terminal preview is
   insufficient.
4. Remove only the managed hook and confirm that unrelated configuration and
   native execution outcomes remain intact.

Until this run is recorded, support remains documented native-hook compatibility
with installed-process tests, rather than real-host acceptance.
