# SWE-agent integration

SWE-agent support is beta.

`tokenjuice install swe-agent` writes `.swe-agent/tokenjuice.yaml` in the
current git/project root. This is a YAML configuration fragment for SWE-agent's
truncated-observation template.

SWE-agent accepts multiple `--config` files and merges them recursively. Load the
default config first, then the tokenjuice fragment:

```bash
tokenjuice install swe-agent
sweagent run --config config/default.yaml --config .swe-agent/tokenjuice.yaml
```

## commands

```bash
tokenjuice install swe-agent
tokenjuice doctor swe-agent
tokenjuice uninstall swe-agent
```

## behavior

- The fragment keeps SWE-agent command execution unchanged.
- It only overrides `agent.templates.next_step_truncated_observation_template`.
- When SWE-agent reports a clipped observation, the next prompt tells the agent
  to retry noisy commands with `tokenjuice wrap -- <command>`.
- `tokenjuice wrap --raw -- <command>` remains the escape hatch when exact bytes
  are required.
- The fragment intentionally does not suggest `tokenjuice wrap --full`.

SWE-agent is maintenance-only upstream and mini-SWE-agent is the newer
recommended tool. This integration exists for teams still running SWE-agent
configs who want a low-risk tokenjuice guidance bridge.

## path override

Set `SWE_AGENT_PROJECT_DIR` to install or inspect a config fragment for another
workspace:

```bash
SWE_AGENT_PROJECT_DIR=/path/to/repo tokenjuice install swe-agent
```
