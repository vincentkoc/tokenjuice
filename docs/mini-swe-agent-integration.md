# mini-SWE-agent integration

mini-SWE-agent support is beta.

`tokenjuice install mini-swe-agent` writes
`.mini-swe-agent/tokenjuice.yaml` in the current git/project root. This is a
YAML configuration fragment for mini-SWE-agent's observation template.

mini-SWE-agent recursively merges multiple config files when passed with `-c`.
Because setting `-c` replaces the default config list, load the default config
explicitly before the tokenjuice fragment:

```bash
mini -c mini.yaml -c .mini-swe-agent/tokenjuice.yaml
```

## Install

```bash
tokenjuice install mini-swe-agent
tokenjuice doctor mini-swe-agent
tokenjuice uninstall mini-swe-agent
```

Set `MINI_SWE_AGENT_PROJECT_DIR=/path/to/workspace` to override the target
workspace explicitly.

## Behavior

- The fragment keeps mini-SWE-agent command execution unchanged.
- Short observations are rendered as normal.
- Long observations keep deterministic head/tail slices and add guidance to
  retry noisy commands through `tokenjuice wrap -- <command>`.
- The fragment tells the agent to use `tokenjuice wrap --raw -- <command>` only
  when raw bytes are required.

## Current beta caveat

This is not a shell hook and does not run tokenjuice automatically. It is a
config-fragment bridge for mini-SWE-agent workflows that want the agent to learn
from long-output failures and rerun noisy commands through tokenjuice.
