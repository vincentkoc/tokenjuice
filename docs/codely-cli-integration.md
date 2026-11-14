# Tuanjie Codely CLI integration

```bash
tokenjuice install codely-cli
tokenjuice doctor codely-cli
```

The integration uses Codely CLI's native `BeforeTool` hook to wrap
`run_shell_command` through `tokenjuice wrap --keep-failures`. It preserves the
other tool arguments and leaves permission decisions to Codely. The host
[rechecks its policy after an input rewrite](https://codely-docs.tuanjie.cn/en/features-introduction/Hooks/).

This targets the CLI configuration at `~/.codely-cli/settings.json`. Tuanjie
Cowork desktop uses the same product family, but its hook discovery and
model-visible execution have not been verified. Its `~/.codely/settings.json`
provider configuration is not a substitute for the CLI hook file.

## Configuration and lifecycle

The installer adds one named `tokenjuice-codely-cli` command under
`hooks.BeforeTool`, with an anchored shell-tool matcher and sequential execution.
It sets `hooks.enabled` when the setting is absent. An explicit `false`, disabled
mode, or disabled hook name remains unchanged and doctor reports the hook as
broken; enable it through Codely's `/hooks` controls before use. Project and
system settings can override the user scope, so check the effective hook state
in Codely as well.

Existing settings and unrelated hooks are preserved. Settings symlinks and file
permissions are retained; malformed settings and dangling links are rejected.
The installer saves a settings backup before replacement. Avoid concurrent
settings edits while installing or uninstalling.

```bash
tokenjuice uninstall codely-cli
```

Uninstall removes only the named tokenjuice command, including when it shares a
matcher group with custom commands. It leaves Codely's global hook controls and
other settings unchanged. Restart Codely CLI after configuration changes.

## Runtime requirements

Use macOS, Linux, or WSL with Bash and Node.js available. Native Windows wrapping
is not supported. `TOKENJUICE_CODELY_CLI_SHELL` selects a different POSIX shell;
the default is Bash, independent of the user's login shell.

The automatic wrapper retains failing command output and exit status within the
normal capture limit. For exact full output or troubleshooting, use the explicit
bypass:

```bash
tokenjuice wrap --raw -- <command>
```

Already wrapped commands pass through unchanged. Invalid hook input, other tools,
other events, missing commands, and an unavailable shell return an empty hook
response without changing tool input. The hook does not grant permission.

## Verification boundary

Adapter tests cover the documented JSON contract, lifecycle, custom settings,
disable controls, symlinks, raw bypass, and preservation of other tool arguments.
These fixtures do not prove Codely's configuration discovery or model-visible
results.

A native probe used the public
[`@unity-china/codely-cli@1.0.0-rc.73`](https://www.npmjs.com/package/@unity-china/codely-cli/v/1.0.0-rc.73)
distribution, an empty temporary home and project, and a loopback HTTP endpoint.
The package tarball was verified against its registry SHA-512 integrity:

```text
sha512-Df8STLvf9qOiZj8S0UX8vW+pu/F20ZX7mIcIDeZpJPGoP6985F00HupudOYmSH+SnaAsWIbn93vjKY6FUzHzRQ==
```

With `CUSTOM_AUTH=1`, a dummy `OPENAI_API_KEY`, and `OPENAI_BASE_URL` pointing to
the loopback endpoint, the native invocation was:

```bash
codely --auth openai --wire-api responses -m fixture \
  -p 'Run pwd with run_shell_command, then finish.' \
  --output-format json --approval-mode yolo
```

It exited with status 1 because Codely OAuth was required first. The loopback
endpoint received zero requests. Custom provider configuration therefore does
not provide credential-free native acceptance for this release. No credentials
or authentication state were fabricated for the probe.

An authorized, authenticated Codely session must still verify settings and hook
discovery, policy checks after rewriting, a noisy successful command, an exact
read, raw bypass, a long failing command, and hook removal in subsequent model
requests. These checks remain unverified. Cowork desktop requires its own
acceptance session.
