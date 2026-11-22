# Crush integration

Crush support is beta.

`tokenjuice install crush` writes a project-local Agent Skill:

```text
.crush/skills/tokenjuice/SKILL.md
```

The skill tells Crush how to use `tokenjuice wrap -- <command>` for noisy
terminal commands and `tokenjuice wrap --raw -- <command>` as the raw-output
escape hatch.

## Install

```bash
tokenjuice install crush
tokenjuice doctor crush
```

## Behavior

- This is guidance-only. It does not install Crush hooks and does not rewrite
  shell commands before execution.
- Crush remains responsible for command approval, shell state, and any existing
  project or global hook policy.
- The skill explicitly tells Crush not to wrap commands that intentionally
  change shell state, such as `cd`, `export`, `source`, shell option changes,
  or activation scripts.
- Existing `SKILL.md` content at the tokenjuice skill path is backed up before
  replacement.

## Native verification

`scripts/crush-e2e.mjs` runs the actual pinned Crush `0.99.0` CLI against a
deterministic loopback provider. It starts a private persistent server and Unix
socket in an isolated HOME and project; it does not attach to a running user
server. The fixture grants only its native `bash` and `view` tool permissions.

Fresh baseline, installed, disabled and uninstalled sessions verify that Crush
discovers the skill in its native catalog and loads its body through `view`.
The fixture model chooses wrappers from that returned body. It inspects actual
follow-up model requests for an 80-entry listing summary, unchanged raw bypass,
exact CRLF reads with trailing blank lines, and complete 80-line stdout,
stderr and exit 7 from a failed command using explicit `--keep-failures`.
Repeated installation preserves the backup; uninstall restores the original
custom skill and its native loading behavior.

To reproduce after building:

```bash
pnpm build
node scripts/crush-e2e.mjs /path/to/crush
```

CI checks the official Linux archive digest before running this fixture. A
digest-checked macOS ARM64 run covers the same flow. This qualifies native skill
discovery, loading and tool transport with the fixture provider. Other models'
adherence, host versions, desktop sessions, remote providers and permission
modes need separate acceptance. `option disable-skill tokenjuice` removes the
skill from the native catalog even if its file passes tokenjuice doctor.

## Why this is not a hook

Crush `PreToolUse` hooks can return `updated_input`, but hook composition and
config merge behavior make a project-local command-rewrite hook risky: it can
compete with other input rewriters, mask parent or global hook arrays, and break
stateful shell commands by moving side effects into a child shell. The
tokenjuice integration therefore uses an Agent Skill instead of intercepting
command execution.

## Uninstall

```bash
tokenjuice uninstall crush
```
