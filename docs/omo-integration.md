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
separate agent directories. Aggregate doctor counts the file as an OmO installation
only when it contains the OmO ownership marker.

Install is idempotent. It refuses to replace foreign code or write through a
symlink; uninstall removes only its owned extension and preserves siblings and
backup files. Doctor validates the installed bytes, not host discovery.

## Runtime boundary

The extension uses native `tool_result` replacement for successful root `bash`
calls with one text block. OmO 5.1.70 emits `isError: false` and
`details.status: "completed"` without structured output. The adapter compacts
that text without creating a structured field. When Senpi supplies structured
output, `structuredContent.output` must match the text, with `exit_code: 0` and
`truncated: false`; both projections are then replaced together.

Failures, unknown status, nested programmatic calls, mixed content,
already-wrapped commands and reported truncation remain unchanged. The shared
reducer preserves exact-read and raw-bypass rules. For explicit raw output, use
`tokenjuice wrap --raw -- <command>`.

Source inspection used Senpi commit
[`1f40baebd0cdfd120642bb6752a80c1976ef7fcf`](https://github.com/code-yeongyu/senpi/tree/1f40baebd0cdfd120642bb6752a80c1976ef7fcf):
[Bash result production](https://github.com/code-yeongyu/senpi/blob/1f40baebd0cdfd120642bb6752a80c1976ef7fcf/packages/coding-agent/src/core/tools/bash.ts),
[extension replacement](https://github.com/code-yeongyu/senpi/blob/1f40baebd0cdfd120642bb6752a80c1976ef7fcf/packages/coding-agent/src/core/extensions/runner.ts),
and [extension discovery](https://github.com/code-yeongyu/senpi/blob/1f40baebd0cdfd120642bb6752a80c1976ef7fcf/packages/coding-agent/src/core/resource-loader.ts).

## Native acceptance

`scripts/omo-e2e.mjs` exercises the actual `omo-ai@5.1.70` launcher and its pinned
`@code-yeongyu/senpi@2026.11.13` engine with a loopback model endpoint and dummy
credentials. The local macOS run uses Node 26.7.0 and an isolated build of the
current source. The CI job repeats it with the normal package build on Linux.

Four fresh sessions with locally generated model responses verify the default `.omo/agent`
discovery path, the `OMO_CODING_AGENT_DIR` override ahead of Senpi/Pi decoys,
noisy Git status compaction, long exact reads, explicit raw output, full exit-7
output and uninstall restoring the baseline. A read-only observer loaded from
the same native extension directory checks post-tool output against the next
model request. Native Bash normalizes CRLF and trims trailing whitespace; the
adapter preserves that native baseline for exact/raw/failure cases.

This pinned launcher emits text-only results; the adapter preserves that shape.
The coherent structured variant is covered by core tests, not a claim that this
launcher emits it. Other host versions, platforms and the terminal extension's
PTY result schema require separate acceptance.
