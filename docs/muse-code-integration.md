# Muse Code integration

Run these commands from the project root used by Muse Code:

```sh
tokenjuice install muse-code
tokenjuice doctor muse-code
tokenjuice uninstall muse-code
```

The installer writes `.agents/skills/tokenjuice/SKILL.md`, a native project skill
location documented by [Muse Code](https://dev.meta.ai/docs/muse-code/extending#skills).
The library API accepts `projectDir` for an explicit root. Installation is
idempotent, refuses foreign content or unsafe paths, and backs up changed owned
content. Uninstall removes only the owned file; sibling files and backups remain.

This is guidance, not automatic interception. The skill asks Muse Code to check
`tokenjuice --version` in its tool environment, use `tokenjuice wrap` for noisy
output with complete failed output preserved, and use `--raw` for exact bytes.
Muse Code keeps control of tool execution and approvals. An installation on your
computer does not establish availability in a remote shell or container.

## Native verification

Inside the same project workspace, check discovery with Muse Code:

```sh
muse skills validate .agents/skills/tokenjuice
muse skills list
muse skills inspect tokenjuice
```

If needed, enable it with `muse skills enable tokenjuice --scope project`. Start a
fresh session in that project and invoke the skill. Respect Muse Code's workspace
trust and permission controls. Its [configuration guide](https://dev.meta.ai/docs/muse-code/configuration)
explains workspace selection and project context.

Verify a noisy command is wrapped, an exact file read retains its bytes, and a
failing command retains all output and its exit status. Inspect the next model
request when qualifying compaction. Doctor only checks the managed file; native
skill discovery, model adherence and execution remain unqualified.

Muse Code documents lifecycle hooks, but the reviewed public guide does not
establish an input-rewrite or output-replacement wire contract for tokenjuice.
This integration therefore uses its documented skill surface and does not modify
`.muse/hooks.json` or user settings.
