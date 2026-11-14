# Alma integration

Alma exposes a native `tool.willExecute` plugin event whose mutable output can
replace tool arguments. Tokenjuice uses it to wrap foreground `Bash` commands
on macOS and Linux. Alma retains control of permissions and execution.

## Install and remove

Build tokenjuice with `pnpm build`. Copy the **contents** of
`dist/hosts/alma/bundle/` to a `tokenjuice/` folder under Alma's plugin directory:

- macOS: `~/Library/Application Support/Alma/plugins/`
- Linux: `~/.config/Alma/plugins/`

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

Unit tests cover the native callback shape, composition, bypass and disposal.
Native Alma discovery, permission behavior and model-visible output remain
unverified. Before relying on the integration, compare a fresh baseline and
installed session using a noisy successful command, an exact file read, raw
bypass and a command that writes both streams and exits nonzero. Inspect the
next model request as well as the displayed result.

Contracts: [Alma hooks](https://alma.now/docs/plugins/hooks-events),
[plugin installation](https://alma.now/docs/plugins/), and
[public API types](https://github.com/yetone/alma-plugins/blob/main/packages/plugin-api/src/index.ts).
