# Cline integration

`tokenjuice install cline` installs an executable `~/.cline/hooks/PreToolUse`
script. Cline CLI 3.0.74 discovers that filename and accepts `overrideInput`
from its `tool_call` hook to replace the complete `run_commands` input.
The hook wraps each command through the shared `tokenjuice wrap` pipeline before
execution, so compacted output reaches the next model request.

## Install

```bash
tokenjuice install cline
tokenjuice doctor cline
```

Restart Cline after installation. For a repository build, run `pnpm build` and
use `node dist/cli/main.js install cline --local` instead.
`CLINE_HOOKS_DIR` overrides the installation directory; Cline must also discover
that directory. Custom hook paths must end in `PreToolUse` or `PreToolUse.sh`.

Installation preserves an existing unmanaged `PreToolUse` script and reports a
conflict. Merge wrapping into that script manually instead of overwriting it.
Reinstallation removes only the exact old tokenjuice-generated
`~/Documents/Cline/Hooks/tokenjuice-post-tool-use` script. Current Cline does not
discover that old filename. Its stale handler returns no additional context.
Uninstall removes recognized generated hooks and preserves custom files.
Symlink hook files and directories are rejected for mutation.

## Behavior

- Only native `tool_call` events for `run_commands` with a nonempty string
  `commands` array are rewritten. Other input fields are retained.
- Already wrapped commands, including explicit `--raw` / `--full`, stay unchanged.
- Successful noisy commands can shrink; exact file reads preserve their bytes.
- Automatic wrapping uses `--keep-failures`: failed commands preserve stdout,
  stderr and their exit status within the normal capture limit.
- Native Windows installation is unsupported; use explicit wrapping there.

```bash
tokenjuice wrap --raw -- <command>
tokenjuice wrap --keep-failures -- <command>
```

## Native acceptance

`scripts/cline-e2e.mjs <pinned-cline-binary>` runs real Cline CLI 3.0.74 against
a disposable loopback OpenAI-compatible provider. No account credentials are
needed. Baseline, ignored legacy-hook and installed-hook sessions capture the
actual hook requests and follow-up model requests. They check an 80-file listing,
exact CRLF content, explicit wrapping, raw bypass, complete exit-7 output with
stderr, and a batch containing both compacted and raw commands. The fixture also
checks migration and uninstall. Linux CI runs the pinned native package; macOS
arm64 is checked locally.

This qualifies the pinned CLI version. Desktop sessions, other versions, remote
providers and interactive permission modes need separate acceptance. A healthy
`doctor` report checks installation, not whether a desktop session loaded it.

Contract references: [CLI reference](https://docs.cline.bot/cli/cli-reference.md),
[hook filename discovery](https://github.com/cline/cline/blob/main/sdk/packages/core/src/hooks/hook-file-config.ts),
and [input override handling](https://github.com/cline/cline/blob/main/sdk/packages/core/src/hooks/hook-file-hooks.ts).
