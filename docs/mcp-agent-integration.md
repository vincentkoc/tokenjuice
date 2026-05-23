# mcp-agent integration

mcp-agent support is beta.

`tokenjuice install mcp-agent` writes `.mcp-agent/agents/tokenjuice.md` in
the current workspace. The file is a Markdown agent definition with YAML
frontmatter that can be loaded by mcp-agent projects that enable file-based
agent discovery.

## commands

```bash
tokenjuice install mcp-agent
tokenjuice doctor mcp-agent
tokenjuice uninstall mcp-agent
```

## behavior

- The agent definition keeps command execution unchanged.
- It tells mcp-agent workflows and subagents to use `tokenjuice wrap -- <command>` for noisy terminal commands.
- `tokenjuice wrap --raw -- <command>` remains the escape hatch when exact bytes are required.
- The definition intentionally does not suggest `tokenjuice wrap --full`.
- Existing `.mcp-agent/agents/tokenjuice.md` content is backed up before install.
- Reinstalling a current tokenjuice definition is idempotent and does not create a backup.
- Uninstall only removes tokenjuice-owned definitions. When install replaced a custom definition, uninstall restores that exact backup.

## loading

Enable file-based agents in `mcp_agent.config.yaml`:

```yaml
agents:
  enabled: true
  search_paths:
    - .mcp-agent/agents
```

Set `MCP_AGENT_PROJECT_DIR` to install or inspect the agent definition for
another workspace.
