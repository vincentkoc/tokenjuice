# Contributing to tokenjuice

Thanks for helping. This file covers the local workflow; [AGENTS.md](AGENTS.md) has the full repository guide (layout, style, host integrations, release process).

## Setup

- Node.js 22 or newer.
- pnpm, at the version pinned in `package.json` (`packageManager`). With Corepack: `corepack enable`.

```bash
pnpm install
```

## Before you open a pull request

Run the same gates CI runs:

```bash
pnpm verify          # oxlint, madge (circular imports), tsc, full Vitest suite
pnpm verify:package  # build, publint, release tarball, checksums, Homebrew formula
```

While iterating, run one file: `pnpm exec vitest run test/hosts/codex.test.ts`.

## Guidelines

- Add or update tests with every behavior change. CLI output for every host's `install`, `doctor`, and `uninstall` is pinned in `test/cli/host-commands.test.ts`; if you change that output on purpose, update the snapshot with `pnpm exec vitest run test/cli/host-commands.test.ts -u` and explain the change in the PR.
- Host tests must not touch your real home directory. Point `HOME` and the host-specific env vars at a temp dir, and restore them afterwards (see `test/hosts/`).
- Adding a host: follow [docs/integration-playbook.md](docs/integration-playbook.md).
- Do not hand-edit generated files: `dist/`, `release/`, `src/core/builtin-rules.generated.ts`.
- Keep pull requests to one concern, with a short imperative, Conventional Commit-style title (for example `fix(cursor): keep raw output for exact file reads`).
- Add a line under `## Unreleased` in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.
