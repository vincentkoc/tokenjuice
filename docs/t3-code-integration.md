# T3 Code compatibility

T3 Code runs provider agents. Configure tokenjuice for the selected provider on
the machine executing its tools. Installing it on a desktop does not configure
a remote environment or external provider server. There is no separate
`tokenjuice install t3` command.

| Provider | Setup | Configuration to match |
| --- | --- | --- |
| Codex | Explicit `tokenjuice wrap -- <command>` in native `0.166.0`; its hook lacks shell exit status and automatic compaction stays off. | The provider instance's selected `CODEX_HOME`; check shadow-home propagation separately. |
| Claude Code | `tokenjuice install claude-code` | The instance's `CLAUDE_CONFIG_DIR`, including custom instances. |
| OpenCode V1 | `tokenjuice install opencode` | The configuration directory on the OpenCode server's machine. |
| OpenCode V2 | `tokenjuice install opencode-v2` | The V2 server's configuration directory; qualify loading separately from V1. |

For a custom home, pass the same environment variable to install and doctor:

```bash
CLAUDE_CONFIG_DIR=/path/to/provider-config tokenjuice install claude-code
CLAUDE_CONFIG_DIR=/path/to/provider-config tokenjuice doctor claude-code
```

T3's Codex shadow homes share configuration with their configured primary home;
they retain separate authentication. Do not copy a Codex home or change login
storage to install tokenjuice. [T3 Codex configuration](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-codex.md)

Claude custom instances set `CLAUDE_CONFIG_DIR` while retaining `HOME`. Set the
configuration variable rather than redirecting the whole home directory.
[T3 Claude configuration](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-claude.md)

After changing OpenCode plugins, restart the relevant server. T3 may retain a
local helper; its documentation describes configuration reload after 30 seconds
without refresh or generation activity. External servers need their own reload.
T3 supports both OpenCode 1 and 2. Use tokenjuice's separate V2 target for
OpenCode 2; V1 fixture results do not establish V2 or T3 propagation. [T3 OpenCode configuration](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-opencode.md)

## Verify the complete route

1. Record T3, provider and tokenjuice versions, execution machine and selected
   configuration directory. Run the provider's tokenjuice doctor there.
2. Start a fresh T3 thread with that provider. In a disposable project, produce
   noisy Git status or test output, then read a small file exactly. OpenCode V2
   skips inventory commands, so a directory listing is not its compaction check.
3. Inspect the provider transcript: confirm the compaction reached the next
   model request and exact file bytes remain intact. UI appearance alone is
   insufficient. Codex's context hook is additive; do not count it as replacement.
4. Check `tokenjuice wrap --raw -- <command>` and a failing command's status.
   Repeat for each custom instance or remote environment you intend to use.

## Native custom Codex acceptance

After building, run:

```bash
node scripts/t3-codex-e2e.mjs /path/to/t3 /path/to/codex
```

The fixture runs real T3 `0.1.6` and Codex `0.166.0`, with a private T3 base
and HOME, a custom provider instance, an explicitly selected Codex home and a
credential-free loopback Responses provider. It starts one local server and
one fresh T3 thread through the native CLI. It does not use existing accounts,
copy authentication, install a service, or expose a LAN listener.

Actual follow-up model requests verify an 80-entry listing, explicit wrapping
compaction, exact CRLF and blank lines, raw bypass, and all 80 failure lines plus
stderr and exit 7 with `--keep-failures`. The provider endpoint and model catalog
come from the selected custom Codex home. CI verifies the official Linux T3
archive digest before running the same fixture.

This qualifies explicit wrapping through that custom Codex instance. It does
not establish automatic Codex hook compaction. Shadow-home authentication,
OpenCode, other providers, remote environments and desktop sessions remain
unqualified. The separate Claude fixture below qualifies its custom instance. Provider adapter tests establish their separate contracts;
repeat the complete route for each selected T3 instance.

Native CLI contract: [scripts on the host](https://github.com/pingdotgg/t3code/blob/v0.1.6/docs/user/outside-agents.md#scripts-on-the-host).

## Native custom Claude acceptance

After building, run:

```bash
node scripts/t3-claude-e2e.mjs /path/to/t3 /path/to/claude
```

Real T3 `0.1.6` starts three fresh threads through Claude Code `2.1.316`:
baseline, installed and uninstalled. A private T3 base and HOME isolate the
fixture. The selected custom instance sets `CLAUDE_CONFIG_DIR` without changing
HOME and supplies its loopback Anthropic endpoint and disposable token through
its environment settings. No existing login or paid provider is used. The
custom settings allow Bash only for this disposable project.

Actual follow-up model requests verify automatic hook loading and 80-entry
listing compaction. Exact reads preserve Claude's native normalization of CRLF
and surrounding whitespace; raw bypass and all 80 failure lines, stderr and
exit-7 metadata match the baseline. Uninstall preserves custom settings and a
fresh thread returns to the complete baseline. The same pinned fixture runs
in Linux CI alongside the custom Codex fixture, reusing the T3 archive.

This qualifies that custom Claude instance's native CLI route. Other versions,
permission settings, accounts, remote environments and desktop sessions require
separate acceptance. Provider health checks and doctor output alone do not
establish hook loading or model-visible tool output.
