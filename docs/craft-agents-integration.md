# Craft Agents integration

Install the guidance skill into one existing Craft Agents workspace:

```bash
tokenjuice install craft-agents /path/to/craft-workspace
tokenjuice doctor craft-agents /path/to/craft-workspace
tokenjuice uninstall craft-agents /path/to/craft-workspace
```

Use the actual workspace directory, not the project working directory. The
documented default is `~/.craft-agent/workspaces/{id}`. A custom
`CRAFT_CONFIG_DIR` changes the Craft config root; choose the corresponding
workspace explicitly. Tokenjuice never chooses the first workspace or creates
one. `TOKENJUICE_CRAFT_WORKSPACE` can select the directory for all three commands
and `tokenjuice doctor hooks`; a positional directory takes precedence.

The installed file is `skills/tokenjuice/SKILL.md` inside that workspace.
It contains the required name and description, wrapper guidance, raw bypass,
and dependency checks. It grants no `alwaysAllow` permissions and enables no
sources. Invoke `@tokenjuice` in a fresh Craft conversation and confirm the skill
loads. Check `tokenjuice --version` inside Craft's actual execution environment
before relying on the wrapper.

This is instruction guidance, not a tool-output hook. Model adherence and native
execution are unqualified. File lifecycle tests cover explicit workspace
selection, idempotent installation, unrelated content, unsafe paths and removal.
Doctor verifies the managed file only. Uninstall removes only the owned skill;
it preserves sibling skills, workspace settings and custom files.

References: [Craft skills](https://thecraftagents.com/docs/skills/overview/),
[configuration paths](https://github.com/lukilabs/craft-agents-oss/blob/main/packages/shared/src/config/paths.ts).
