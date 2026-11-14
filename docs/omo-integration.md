# OmO integration

`tokenjuice install omo` installs a self-contained extension for the standalone
[OmO](https://github.com/code-yeongyu/oh-my-openagent) launcher and its Senpi
engine. This is separate from the older OpenCode plugin: configure the OpenCode
adapter when using OmO inside OpenCode.

```sh
tokenjuice install omo
tokenjuice doctor omo
tokenjuice uninstall omo
```

Start a fresh OmO session after installing or removing the extension. The default
file is `~/.omo/agent/extensions/tokenjuice.js`. The installer follows the
launcher's `OMO_CODING_AGENT_DIR`, `SENPI_CODING_AGENT_DIR`, then
`PI_CODING_AGENT_DIR` overrides. Set the same environment for tokenjuice and OmO.
An explicit shared Pi directory means both hosts discover that extension; prefer
separate agent directories.

Install is idempotent. It refuses to replace foreign code or write through a
symlink; uninstall removes only its owned extension and preserves siblings and
backup files. Doctor validates the installed bytes, not host discovery.

## Runtime boundary

The extension uses native `tool_result` replacement. It accepts only successful
root `bash` calls whose single text block matches `structuredContent.output`,
with `exit_code: 0` and `truncated: false`. It replaces both text and structured
output together, retaining other fields. Failures, unknown status, nested
programmatic calls, mixed content, already-wrapped commands and truncated output
remain unchanged. The shared reducer preserves exact-read and raw-bypass rules.
For explicit raw output, use `tokenjuice wrap --raw -- <command>`.

Source inspection used Senpi commit
[`1f40baebd0cdfd120642bb6752a80c1976ef7fcf`](https://github.com/code-yeongyu/senpi/tree/1f40baebd0cdfd120642bb6752a80c1976ef7fcf):
[Bash result production](https://github.com/code-yeongyu/senpi/blob/1f40baebd0cdfd120642bb6752a80c1976ef7fcf/packages/coding-agent/src/core/tools/bash.ts),
[extension replacement](https://github.com/code-yeongyu/senpi/blob/1f40baebd0cdfd120642bb6752a80c1976ef7fcf/packages/coding-agent/src/core/extensions/runner.ts),
and [extension discovery](https://github.com/code-yeongyu/senpi/blob/1f40baebd0cdfd120642bb6752a80c1976ef7fcf/packages/coding-agent/src/core/resource-loader.ts).

Native acceptance is pending: in a disposable OmO home, verify extension loading,
a noisy successful command, exact reads, explicit raw output, failures, and
uninstall against the actual next model request. The terminal extension's PTY
result schema is not qualified by this adapter.
