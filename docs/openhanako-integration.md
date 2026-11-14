# OpenHanako / HanaAgent integration

Tokenjuice provides a native Pi extension plugin for HanaAgent (the project
published under the OpenHanako repository). It compacts completed successful
`exec_command` results, preserving the native execution metadata.

## Install and remove

Build tokenjuice with `pnpm build`. Copy `dist/hosts/openhanako/bundle/` as
`${HANA_HOME}/plugins/tokenjuice/` (`HANA_HOME` defaults to `~/.hanako`).
Hana's Settings → Plugins also accepts a plugin folder or ZIP.

Enable the plugin and allow full-access plugins in Hana's plugin settings.
Extensions require this native permission; tokenjuice does not change it.
Start a fresh session. Disable the plugin through Hana to stop compaction;
uninstall it through the same plugin manager or remove its `tokenjuice/` folder
after disabling it. No `tokenjuice install openhanako` command is needed.

## Scope and verification

The adapter requires native `details.execCommand` completion, exit code zero,
no transport error, and `tty: false`. Failed, partial, truncated, mixed-content,
PTY and `write_stdin` results pass through. Exact reads and explicit
`tokenjuice wrap --raw -- <command>` calls retain their output. Existing
content fields and execution metadata survive replacement.

Unit tests cover the callback contract and all of these exclusions. Real Hana
plugin loading, full-access admission, final model requests and UI consistency
remain unverified. Qualify a fresh disposable session with a noisy successful
command, an exact read, raw bypass, nonzero exit and an interactive command
before relying on a given Hana version. Do not infer support from standalone
Pi: Hana has its own `exec_command` schema and plugin lifecycle.

Contracts: [plugin SDK](https://github.com/liliMozi/openhanako/blob/main/PLUGIN_SDK.md),
[plugin lifecycle](https://github.com/liliMozi/openhanako/blob/main/PLUGINS_EN.md),
[native tool](https://github.com/liliMozi/openhanako/blob/main/lib/exec-command/tool.ts),
and [result construction](https://github.com/liliMozi/openhanako/blob/main/lib/exec-command/runner.ts).
