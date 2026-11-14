# nanobot integration

`tokenjuice install nanobot` installs a guidance skill at
`<workspace>/skills/tokenjuice/SKILL.md`, matching nanobot's
[native SkillsLoader](https://github.com/HKUDS/nanobot/blob/main/nanobot/agent/skills.py).

```sh
tokenjuice install nanobot
tokenjuice doctor nanobot
tokenjuice uninstall nanobot
```

The default workspace is `~/.nanobot/workspace`. Initialize it with nanobot first.
For a custom workspace, set `NANOBOT_WORKSPACE=/path/to/workspace` for each command,
matching nanobot's `agents.defaults.workspace` configuration. This is a tokenjuice
override: nanobot itself does not read this variable. The library accepts
`{ workspaceDir }`. Tokenjuice does not inspect or change nanobot configuration,
and does not infer the active workspace of a running process.

Installation is idempotent. A custom skill at this path is backed up and restored
on uninstall. Symlinked skills or workspace directories are rejected. Other
skills and nanobot configuration are preserved.

This is model guidance, not an execution hook. It asks nanobot to invoke
`tokenjuice wrap -- <command>` for noisy shell commands and retains the explicit
`--keep-failures` and `--raw` routes. Restart nanobot after installation and check
that the skill is enabled in the intended workspace. Tokenjuice must be available
in nanobot's execution environment; a desktop PATH does not establish a remote
or container PATH.

Local lifecycle tests do not establish native discovery or model adherence.
Those remain unqualified until an isolated nanobot session loads the skill and
its follow-up model request contains the expected wrapped output.
