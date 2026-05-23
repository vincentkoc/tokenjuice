# Docker Agent integration

Docker Agent support is beta.

`tokenjuice install docker-agent` writes `.docker-agent/tokenjuice.md` in the
current git/project root. The file is prompt guidance for Docker Agent configs.

Load it from the relevant agent config with `add_prompt_files`:

```yaml
agents:
  root:
    add_prompt_files:
      - .docker-agent/tokenjuice.md
```

## commands

```bash
tokenjuice install docker-agent
tokenjuice doctor docker-agent
tokenjuice uninstall docker-agent
```

## behavior

- The prompt file keeps Docker Agent command execution unchanged.
- Docker Agent still owns tools, shell execution, approvals, and output handling.
- The prompt tells agents to use `tokenjuice wrap -- <command>` for noisy terminal commands.
- `tokenjuice wrap --raw -- <command>` remains the escape hatch when exact bytes are required.
- The prompt intentionally does not suggest `tokenjuice wrap --full`.

## path override

Set `DOCKER_AGENT_PROJECT_DIR` to install or inspect a prompt file for another
workspace:

```bash
DOCKER_AGENT_PROJECT_DIR=/path/to/repo tokenjuice install docker-agent
```

`CAGENT_PROJECT_DIR` is also accepted as a compatibility alias for older cagent
workflows.
