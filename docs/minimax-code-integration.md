# MiniMax Code integration

The local plugin rewrites native foreground `bash` inputs through
`tokenjuice wrap --keep-failures`. MiniMax keeps ownership of permissions and
execution. Raw or already wrapped commands, background requests and native
Windows sessions pass through unchanged.

The source contract was checked against MiniMax Code `0.7.2`, revision
`3c21163c85a9684030cb147bfef48c6284fa3c46`:

- [native plugin reader](https://github.com/MiniMax-AI/minimax-code/blob/3c21163c85a9684030cb147bfef48c6284fa3c46/packages/local-runtime-v2/src/service/plugin-system/plugin/package/minimax-reader.ts)
- [hook input and output parser](https://github.com/MiniMax-AI/minimax-code/blob/3c21163c85a9684030cb147bfef48c6284fa3c46/packages/agent-modules/plugin-hooks/src/runner.ts)
- [validated input application before permission checks](https://github.com/MiniMax-AI/minimax-code/blob/3c21163c85a9684030cb147bfef48c6284fa3c46/packages/local-runtime-v2/src/service/turn-system/agent-host/execution/plugin-hook-tool-lifecycle.ts)
- [local plugin management](https://github.com/MiniMax-AI/minimax-code/blob/3c21163c85a9684030cb147bfef48c6284fa3c46/docs/examples.md#4-manage-plugins)

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
```

The tests exercise synthetic native payloads and the packaged command. They do
not prove real MiniMax plugin discovery, permission behavior or model-visible
delivery. Native Windows, other host versions, desktop sessions and cloud
environments remain unqualified.
