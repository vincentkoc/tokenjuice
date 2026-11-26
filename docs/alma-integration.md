# Alma integration

Alma exposes a native `tool.willExecute` plugin event whose mutable output can
replace tool arguments. Tokenjuice uses it to wrap foreground `Bash` commands
on macOS and Linux. Alma retains control of permissions and execution.

## Install and remove

Build tokenjuice with `pnpm build`. Copy the **contents** of
`dist/hosts/alma/bundle/` to a `tokenjuice/` folder under Alma's plugin directory:

- macOS: `~/Library/Application Support/Alma/plugins/`
- Linux Alma Server 0.4.1176: `~/.config/alma/plugins/` by default. Its local
  `GET /api/plugins-path` returns the active directory.

Install the tokenjuice CLI on the PATH visible to the Alma process, with `bash`
available there too. Enable the plugin in Alma and start a fresh session.
Disable the plugin in Alma to stop wrapping; remove only its `tokenjuice/`
folder to uninstall. There is no `tokenjuice install alma` target: Alma owns
plugin activation. Native Windows shell wrapping is not supported.

## Behavior and verification

The plugin composes with earlier argument changes and never clears cancellation.
It preserves unrelated argument fields, skips background calls and already
wrapped commands, and leaves the call unchanged if its prerequisites are absent.
Automatic wrapping uses `--keep-failures`, preserving failing stdout/stderr and
exit status. For raw output, ask Alma to run `tokenjuice wrap --raw -- <command>`.

The `alma-native` CI job runs [Alma Server 0.4.1176](https://github.com/yetone/alma-releases/releases/tag/v0.4.1176)
on Linux x86-64 with a fresh profile and a loopback model fixture. It installs
the built bundle in the directory Alma reports, then enables and disables it
through the server's plugin manager. The next model request receives shorter
output for a 160-line command. Exact file reads and explicit raw output retain
their bytes. Both output streams from a failed command remain visible along
with exit code 7. Disabling the plugin restores the original 160-line output.

Alma Server uses its headless automatic-approval mode in this test. Interactive
approval dialogs and the macOS desktop application still need a separate check.
Callback tests cover earlier argument edits, cancellation, bypass and disposal.

Contracts: [Alma hooks](https://alma.now/docs/plugins/hooks-events),
[plugin installation](https://alma.now/docs/plugins/), and
[public API types](https://github.com/yetone/alma-plugins/blob/main/packages/plugin-api/src/index.ts).
