# LocalCode integration

LocalCode support is beta.

`tokenjuice install localcode` writes a LocalCode plugin to
`~/.localcode/plugins/tokenjuice/`. The plugin exposes a slash command and an
LLM-callable tool that compact terminal output you provide through
`tokenjuice reduce-json`.

## Install

```bash
tokenjuice install localcode
tokenjuice doctor localcode
tokenjuice uninstall localcode
```

Set `LOCALCODE_HOME=/path/to/.localcode` to target a specific LocalCode home
directory during tests or scripted installs. Set `TOKENJUICE_BIN=/path/to/tokenjuice`
inside LocalCode's environment when validating a repo-local tokenjuice build.

## Behavior

- The plugin writes `localcode.plugin.json` and `index.js` under
  `~/.localcode/plugins/tokenjuice/`.
- The manifest advertises `/tokenjuice` and
  `tokenjuice_compact_terminal_output`.
- `/tokenjuice` treats the first input line as command metadata and the
  remaining lines as captured terminal output.
- The tool accepts `command`, `output`, optional `exitCode`, and optional
  `maxInlineChars`.
- The plugin runs `tokenjuice reduce-json` with `shell: false`.
- Existing plugin files are backed up without clobbering older backups;
  uninstall restores those exact pre-existing files when possible.

## Current beta caveat

LocalCode plugins expose commands and tools; they do not replace LocalCode's
built-in shell output. This integration never executes the provided command
string. The command is metadata for tokenjuice classification only.
