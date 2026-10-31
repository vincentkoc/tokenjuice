# T3 Code compatibility

T3 Code runs provider agents. Configure tokenjuice for the selected provider on
the machine executing its tools. Installing it on a desktop does not configure
a remote environment or external provider server. There is no separate
`tokenjuice install t3` command.

| Provider | Setup | Configuration to match |
| --- | --- | --- |
| Codex | `tokenjuice install codex` | The provider instance's shared `CODEX_HOME`; check shadow-home propagation separately. |
| Claude Code | `tokenjuice install claude-code` | The instance's `CLAUDE_CONFIG_DIR`, including custom instances. |
| OpenCode | `tokenjuice install opencode` | The configuration directory on the OpenCode server's machine. Check its major version. |

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
T3 supports both OpenCode 1 and 2; tokenjuice's V1 plugin does not establish V2
compatibility. [T3 OpenCode configuration](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-opencode.md)

## Verify the complete route

1. Record T3, provider and tokenjuice versions, execution machine and selected
   configuration directory. Run the provider's tokenjuice doctor there.
2. Start a fresh T3 thread with that provider. In a disposable project, ask it to
   list a directory containing many files, then read a small file exactly.
3. Inspect the provider transcript: confirm the compaction reached the next
   model request and exact file bytes remain intact. UI appearance alone is
   insufficient. Codex's context hook is additive; do not count it as replacement.
4. Check `tokenjuice wrap --raw -- <command>` and a failing command's status.
   Repeat for each custom instance or remote environment you intend to use.

Provider adapter tests establish their own contracts. T3 propagation through
these configuration paths remains unqualified until this check is completed
in T3 itself.
