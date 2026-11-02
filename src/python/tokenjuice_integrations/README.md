# tokenjuice Hermes plugin

This directory is a self-contained Hermes plugin. It registers the public
`transform_terminal_output` hook and needs Hermes 0.22.5 or newer. Optional
LangChain and FastMCP modules are not loaded by Hermes.

Install the [tokenjuice CLI](https://github.com/vincentkoc/tokenjuice) separately
with `npm install --global tokenjuice` (Node.js 22 or newer), then install this
plugin through Hermes using the repository's `src/python/tokenjuice_integrations`
subdirectory. Use an exact commit when installing from Git. Enable it with
`hermes plugins enable tokenjuice` and check `hermes plugins doctor tokenjuice`.
See the [setup guide](https://github.com/vincentkoc/tokenjuice/blob/main/docs/framework-integrations.md#hermes)
for the bundled release alternative.

The plugin passes captured terminal output to the local `tokenjuice
compact-shell-result` subprocess. It never executes the command supplied in the
hook payload. Only successful foreground output is eligible; failures, background
polls, exact file reads, and explicit raw requests retain their original output.
Missing executables, invalid responses, inputs over 2 MB, and five-second timeouts
also preserve the original output.

The CLI reads tokenjuice's local configuration and rules. Bridge calls disable
statistics and require no credentials or network service. Keep `tokenjuice` on
PATH, or set `TOKENJUICE_BIN` to its executable path. No Hermes permissions are
changed. Disable with `hermes plugins disable tokenjuice`; remove with
`hermes plugins remove tokenjuice`.

Maintained by [vincentkoc](https://github.com/vincentkoc). MIT-licensed; see the
[repository license](https://github.com/vincentkoc/tokenjuice/blob/main/LICENSE).
