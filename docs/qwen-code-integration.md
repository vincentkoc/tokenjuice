# Qwen Code integration

Qwen Code support is beta. The native session test pins Qwen Code 0.26.4.

`tokenjuice install qwen-code` writes a project-local `PreToolUse` command hook
into `.qwen/settings.json`. It wraps shell commands through `tokenjuice wrap`
before execution so the model receives compacted terminal output. Qwen Code
retains its permission policy; the hook does not grant permission.

## Install

```bash
tokenjuice install qwen-code
tokenjuice doctor qwen-code
```

Trust the project and enable hooks in Qwen Code. `disableAllHooks: true` prevents
the hook from running. Native Windows wrapping is unsupported; run both Qwen Code
and tokenjuice inside WSL.

Legacy post-tool entrypoints now return `{}` without adding context, writing
diagnostics or storing artifacts. Reinstall to enable the supported pre-tool path.

Reinstall after upgrading from the old `PostToolUse` integration. The installer
removes tokenjuice's legacy entries and preserves unrelated settings and hooks.
The old hook only added context and could not replace the original shell result.

## Behavior

- Matches `run_shell_command`, `Bash`, and `Shell` pre-tool inputs.
- Preserves other input fields and the command's exit status.
- Leaves existing `tokenjuice wrap` commands alone, including raw bypasses:

  ```bash
  tokenjuice wrap --raw -- <command>
  ```

- Uses Bash to match the native tool regardless of the login `SHELL`.
  `TOKENJUICE_QWEN_CODE_SHELL` provides an explicit interpreter override; choose a
  Bash-compatible shell.
- Leaves input unchanged when it cannot resolve a shell or parse the hook payload.
- Uses the current workspace by default; `QWEN_PROJECT_DIR` overrides the project
  directory for scripted installs and tests.

## Native session verification

```bash
pnpm build
node scripts/qwen-e2e.mjs /path/to/qwen
```

The test runs the real host in a disposable trusted project against a loopback
OpenAI-compatible model endpoint. It compares baseline and installed sessions,
checking listing compaction, exact file reads, Bash syntax independent of the login
shell, raw bypass, failure output, and
native failure flags and exit status in subsequent model requests. Qwen Code
normalizes CRLF and trims trailing whitespace in PTY output; exact reads are
compared against its baseline result. Raw results exclude only the native
process group ID from comparison. No model credentials are passed through.

This verifies host loading and model-visible delivery, not remote provider
availability or model reasoning quality. The test allows only the shell tool in
its disposable environment using Qwen Code's native `--allowed-tools` option.

The test explicitly enables Qwen Code's PTY shell mode. The pinned host's default
headless buffered pipe mode intermittently lost output before tokenjuice was
installed, including a file listing and a builtin-only Bash command. That mode
remains unqualified. The Bash case observes array expansion through an external
Node process.
