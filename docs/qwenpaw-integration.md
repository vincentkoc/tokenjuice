# QwenPaw workspace skill

Import the packaged [tokenjuice skill](../packaging/skills/qwenpaw/tokenjuice/SKILL.md)
into an explicitly selected QwenPaw agent workspace. This is instruction
guidance, not an automatic tool-output hook. QwenPaw owns import, enablement and
removal; there is no `tokenjuice install qwenpaw` command.

## Import into one workspace

Install the tokenjuice CLI in the environment where the selected agent executes
commands. Then use QwenPaw's native GitHub skill importer, replacing `AGENT_ID`
with the intended agent's ID:

```bash
qwenpaw skills install https://github.com/vincentkoc/tokenjuice/tree/main/packaging/skills/qwenpaw/tokenjuice --agent-id AGENT_ID
qwenpaw skills list --status enabled --agent-id AGENT_ID
qwenpaw skills test tokenjuice --agent-id AGENT_ID
```

Omitting `--agent-id` targets the shared skill pool, which is not the workspace's
runtime copy. Imports reject a conflicting skill name rather than silently
replacing it. Inspect an existing `tokenjuice` skill before deciding to remove or
replace it. Imported workspace skills are enabled by default.

The skill declares `metadata.requires.bins: [tokenjuice]`. QwenPaw checks the
effective tool-environment PATH; a missing binary prevents the skill from
loading. The skill also asks the agent to check `tokenjuice --version` inside
that environment before wrapping commands.

## Local file alternative

For a local reviewed checkout, copy the `tokenjuice` directory into the selected
workspace's `skills/` directory only after confirming that destination has no
existing skill with that name. The documented default is
`$QWENPAW_WORKING_DIR/workspaces/{agent_id}/skills/`, with
`QWENPAW_WORKING_DIR` usually `~/.qwenpaw`. Agents can have custom workspace
directories; use the directory configured for the chosen agent instead of
guessing from its ID. Legacy roots and the shared pool are different locations.

Manually added skills are discovered on manifest reconciliation as **disabled**.
Enable the selected workspace's copy explicitly:

```bash
qwenpaw skills enable tokenjuice --agent-id AGENT_ID
qwenpaw skills test tokenjuice --agent-id AGENT_ID
```

Do not edit `skill.json` or change other agents' copies to complete this setup.

## Verify and remove

Start a fresh session in the selected workspace and explicitly invoke the
tokenjuice skill. Verify a noisy successful command uses
`tokenjuice wrap --keep-failures -- <command>`, an exact read uses the raw escape
hatch, and a failing command preserves stderr and its failure status. Inspect
the authoritative tool result or next model request; a shorter UI preview is
not proof of reduced model input.

Use QwenPaw's native lifecycle for this same workspace:

```bash
qwenpaw skills disable tokenjuice --agent-id AGENT_ID
qwenpaw skills enable tokenjuice --agent-id AGENT_ID
qwenpaw skills uninstall tokenjuice --agent-id AGENT_ID
```

The package metadata and guidance have static tests. Native import, enablement,
dependency checks and model-visible command execution remain unqualified.
QwenPaw's dispatch/response plugin hooks do not establish per-tool result
replacement, and this skill makes no such claim.

Contract: [QwenPaw skills](https://github.com/agentscope-ai/QwenPaw/blob/main/website/public/docs/skills.en.md).
