# ZCode integration

ZCode supports native `PreToolUse` input replacement. Tokenjuice wraps its `Bash`
command with `tokenjuice wrap --keep-failures`, preserving the complete tool input
and leaving permission decisions to ZCode. Successful output can be compacted;
failed stdout, stderr and exit status pass through the shared wrapper.

```bash
tokenjuice install zcode
tokenjuice doctor zcode
tokenjuice uninstall zcode
```

The installer adds one synchronous hook under `hooks.events.PreToolUse` in
`~/.zcode/cli/config.json`. It preserves unrelated configuration and custom hooks,
including custom entries in the same matcher group. Updates preserve settings
symlinks and permissions. A malformed or dangling settings file is not overwritten.

Start a new ZCode session after installation. ZCode snapshots hooks at session
startup. If `hooks.enabled` was explicitly false, installation preserves that
setting: enable hooks in ZCode settings when you want to activate them. Doctor
checks the persisted entry and launcher paths, not a running session.

This integration supports POSIX commands on macOS, Linux or WSL. Native Windows
shells are not wrapped. The wrapper prefixes simple external commands so argument
expansion remains in ZCode's selected shell, rather than launching another shell.
Compound commands, redirections, builtins and shell-state changes such as `cd`
and `export` are left unchanged: ZCode carries working-directory changes into
later calls. Custom shell functions and aliases are not qualified. Explicit
`tokenjuice wrap --raw -- <command>` is left unchanged.
Project-level ZCode hooks and imported `.claude/settings.json` entries are not a
substitute for the user-level configuration.

## Contract and verification

The [official hook contract](https://zcode.z.ai/en/docs/hooks) documents synchronous
command hooks, the `tool_name` / `tool_input` aliases, and a full
`hookSpecificOutput.updatedInput` replacement that ZCode revalidates. The
[native Bash schema](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/contracts/src/tools/bash.ts)
defines `command`, `timeout`, `description`, `run_in_background`, and
`dangerouslyDisableSandbox`; only `command` changes. The hook does not return an
allow/deny decision. `PostToolUse` adds context and cannot replace output.

Run the adapter and CLI tests:

```bash
pnpm exec vitest run test/hosts/zcode.test.ts test/cli/host-commands.test.ts
pnpm verify
pnpm verify:package
```

Unit tests cover configuration lifecycle, mixed custom hooks, disabled settings,
symlink safety, full input preservation, malformed input and raw bypass.

The [native fixture](../scripts/zcode-e2e.mjs) runs the actual agent from the
official ZCode **3.18.2 macOS arm64** package (agent version **0.17.1**), against
a loopback OpenAI-compatible endpoint. It uses temporary home, data and project
directories and a fixture-only key. It observes all eight tool results in the
next model requests across baseline, installed and uninstalled sessions:

- automatic hook discovery and 80-file listing compaction;
- exact CRLF content and explicit raw output, relative to native delivery;
- all 80 failed stdout lines, stderr and exit status 7;
- `cd`, a compound command and working-directory state between tool calls;
- restored baseline results after uninstall and disabled doctor status.

ZCode itself trims trailing whitespace from model-visible results; the fixture
compares exact reads to that native baseline. CI runs this fixture with Bash and
Zsh. It extracts the bundled Node agent and provider definitions without launching
the desktop app. The pinned
[official package](https://cdn-zcode.z.ai/zcode/electron/releases/3.18.2/macos-arm64/ZCode-3.18.2-mac-arm64.dmg)
has SHA-256 `0fd13032e3c24dc172615a0c6b3e9477b0af287d87af0c973129ee15c32f7d40`.

Other ZCode versions, desktop UI sessions, Linux/WSL, Windows, custom shell
functions and aliases remain unqualified by this fixture.
