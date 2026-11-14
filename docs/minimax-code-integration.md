# MiniMax Code integration

The local plugin rewrites native foreground `bash` inputs through
`tokenjuice wrap --keep-failures`. MiniMax keeps ownership of permissions and
execution. Raw or already wrapped commands, background requests and native
Windows sessions pass through unchanged.

The source contract and native headless fixture use MiniMax Code `0.7.2`, release
revision `c6c7f28e73921d7295b9c060dee478ced75cf438`:

- [native plugin reader](https://github.com/MiniMax-AI/minimax-code/blob/c6c7f28e73921d7295b9c060dee478ced75cf438/packages/local-runtime-v2/src/service/plugin-system/plugin/package/minimax-reader.ts)
- [hook input and output parser](https://github.com/MiniMax-AI/minimax-code/blob/c6c7f28e73921d7295b9c060dee478ced75cf438/packages/agent-modules/plugin-hooks/src/runner.ts)
- [validated input application before permission checks](https://github.com/MiniMax-AI/minimax-code/blob/c6c7f28e73921d7295b9c060dee478ced75cf438/packages/local-runtime-v2/src/service/turn-system/agent-host/execution/plugin-hook-tool-lifecycle.ts)
- [local plugin management](https://github.com/MiniMax-AI/minimax-code/blob/c6c7f28e73921d7295b9c060dee478ced75cf438/docs/examples.md#4-manage-plugins)

## Install and verify

Install tokenjuice on the same execution machine as MiniMax Code. Both
`tokenjuice` and Bash must be available on the hook and tool process PATH.

`pnpm build` creates `dist/hosts/minimax-code/bundle`, included in npm and release
packages. For a global npm install, find it beneath
`$(npm root -g)/tokenjuice/dist/hosts/minimax-code/bundle`.

1. Run `mcode plugin marketplace list` to find the active profile's local plugin
   directory. Do not infer it from the default data directory.
2. Copy the contents of the bundle into a new `tokenjuice` child directory there,
   including the hidden `.minimax-plugin` directory. Preserve other plugins. The
   native scanner requires an actual directory, not a symlink.
3. Refresh `/plugins` or run `mcode plugin list --available --marketplace local`.
4. Run `mcode plugin enable tokenjuice@local` and start a fresh session.

`mcode plugin add <path>` is not a supported local import route in this version.
There is no `tokenjuice install minimax-code` or file-based doctor: the native
plugin manager owns activation, disablement and removal.

Test a noisy command, an exact file read, explicit raw wrapping and a failed
command in an isolated session. Verify the actual next model request contains
the expected results. A catalog entry or enabled indicator is insufficient.

## Disable and remove

```sh
mcode plugin disable tokenjuice@local
mcode plugin remove tokenjuice@local
```

The remove command deletes the installed plugin directory. Keep the packaged
source if it will be installed again. Confirm removal in the local plugin list
and start a fresh session before checking that ordinary output is restored.

## Boundaries and tests

The plugin uses `hookSpecificOutput.updatedInput` without a permission verdict.
It preserves native input fields and uses Bash for Bash syntax. Successful
output is eligible for compaction; `--keep-failures` preserves failed stdout,
stderr and exit status within the normal wrapper capture ceiling. Exact reads
and explicit `tokenjuice wrap --raw -- <command>` retain their shared behavior.

Native MiniMax-format hooks currently do not accept a result replacement even
though the internal decision type declares one. This plugin uses input
rewriting and does not claim post-tool result replacement.

```sh
pnpm exec vitest run test/hosts/minimax-code.test.ts
pnpm build
node scripts/minimax-plugin-contract.mjs
node scripts/minimax-e2e.mjs /path/to/mcode
```

The unit and packaged-command tests use synthetic native payloads. The separate
[native fixture](../scripts/minimax-e2e.mjs) runs the released `mcode` binary with
an isolated HOME, data directory and workspace, plus a loopback OpenAI-compatible
provider. It copies the built plugin into the discovered local catalog and uses
the native enable, disable and remove commands. It checks the actual next model
request for compacted noisy output, byte-exact reads, raw bypass, all failed
stdout/stderr and exit code 7. Disabled and removed sessions must restore the
baseline output. No account or paid provider is used.

CI qualifies this path on Ubuntu with Node 24. The release archive is pinned by
SHA-256 `aa055b696945286cbab62f8b748835de1428e4d08a598bbf5de4c8a5de71f4e4`.
The fixture explicitly selects `--permission full` for its disposable commands;
it does not qualify default permission decisions. Native Windows, other host
versions, desktop sessions and cloud environments remain unqualified.
