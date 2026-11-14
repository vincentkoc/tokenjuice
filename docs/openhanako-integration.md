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

Unit tests cover the callback contract and all of these exclusions. The
`openhanako-native` CI job runs `scripts/openhanako-e2e.mjs` against pinned Hana
v0.450.0 app-core source (`9a6cabf8c513db5edc6cf8179a538c9075885c6e`). It uses the
real `PluginManager`, preferences, resource loader, session adapter and
`exec_command` implementation with a loopback model endpoint. The fixture
checks permission denial, grant and revocation, successful reduction, exact
reads, raw bypass, nonzero exits and host truncation in isolated temporary
state. It installs the delivered plugin bundle outside the source tree.

Desktop UI consistency and interactive PTY behavior remain unverified. Qualify
those in a fresh disposable desktop session before relying on a given Hana
version. Do not infer support from standalone Pi: Hana has its own
`exec_command` schema and plugin lifecycle.

Contracts: [plugin SDK](https://github.com/liliMozi/openhanako/blob/main/PLUGIN_SDK.md),
[plugin lifecycle](https://github.com/liliMozi/openhanako/blob/main/PLUGINS_EN.md),
[native tool](https://github.com/liliMozi/openhanako/blob/main/lib/exec-command/tool.ts),
and [result construction](https://github.com/liliMozi/openhanako/blob/main/lib/exec-command/runner.ts).
