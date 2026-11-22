# distribution

Token Glace ships as a compiled JavaScript CLI and library. All distribution formats require Node.js.

that means:

- `tsc` builds the runnable CLI into `dist/`
- the npm package ships both `token-glace` and `tokenjuice` launchers for `dist/cli/main.js`
- release builds produce a tarball with:
  - `dist/`
  - `bin/token-glace` and `bin/tokenjuice`
  - `package.json`
  - `README.md`
  - `LICENSE`
- Homebrew installs that tarball and wraps `dist/cli/main.js` with the brewed `node`
- nfpm builds `.deb` and `.rpm` packages that require `nodejs >= 22.12.0`

## runtime and release checks

Requires Node.js 22.12.0 or newer. The CLI uses the same compiled JavaScript entry point across distribution formats.
Host bundles have separate build steps within `pnpm build`.

Use the package manager version pinned in `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm release:local
```

`release:local` runs `verify` and `verify:package`.
These commands check lint, circular dependencies, types, tests, package exports, the release tarball, checksums, and the Homebrew formula.
CI also runs installed-hook contracts and pinned native-host acceptance fixtures.
The CI package job and Release workflow run `node scripts/build-linux-packages.mjs`
to build DEB/RPM artifacts with nfpm and verify their Node.js minimum using
`dpkg-deb` and `rpm`. Release completes this check before publishing any package.

The [repository release procedure](../AGENTS.md#release-process) defines version, commit, and tag ordering.
The tag-driven Release workflow builds Linux packages and publishes GitHub assets and the npm package.
Check that the tag and `package.json` versions agree before publication.

normal formula generation verifies that the selected checksum entry matches the
actual local tarball before writing Ruby. For formula-only recovery against an
existing published tarball, first verify its published checksum, then run:

```bash
pnpm release:formula -- --published-tarball-sha256 <64-lowercase-hex> --release-version <published-version>
```

the recovery override is intentionally offline and does not require or rebuild a
local tarball.

that writes:

- `release/token-glace-v<version>.tar.gz`
- `release/sha256sums.txt`
- `release/Formula/token-glace.rb`

## npm

Build and install a local npm archive from this checkout:

```bash
pnpm build
npm pack
npm install -g ./token-glace-*.tgz
token-glace --help
```

## Python adapters and PyPI

`node scripts/build-framework-adapters.mjs` prepares `dist/python`, including
the `tokenjuice-integrations` project metadata, README, license, and adapters.
It uses the version in `package.json`. Python requires 3.11 or newer; the
tokenjuice CLI remains a separate Node.js dependency.

Build and validate a wheel and source distribution:

```sh
python -m pip install build==1.6.1 twine==7.0.0
python -m build dist/python --outdir /path/to/python-dist
python -m twine check --strict /path/to/python-dist/*
python scripts/python-package-e2e.py /path/to/python-dist
```

CI also runs the native LangChain and FastMCP contracts against the installed
wheel. Install the [published Python package](https://pypi.org/project/tokenjuice-integrations/)
as described in
[framework integrations](framework-integrations.md#package-paths-and-python-setup).

The manual **Publish Python** workflow publishes independently of npm tags. It
accepts the full `source_sha` of the workflow's current `main` commit with a
successful main CI run, plus a stable `version` that matches that commit's
`package.json`. The checkout uses the workflow's immutable GitHub SHA and rejects
a different input SHA. It rebuilds and checks both distributions, then uploads
them from a separate OIDC-enabled publish job.

The PyPI project's GitHub trusted publisher uses these exact fields:

| Field | Value |
| --- | --- |
| PyPI project | `tokenjuice-integrations` |
| GitHub owner | `vincentkoc` |
| Repository | `tokenjuice` |
| Workflow filename | `publish-python.yml` |
| Environment | `pypi` |

The GitHub `pypi` environment permits deployments from the `main` branch only.
No API token is stored in the repository. For a new PyPI project, configure a
[pending trusted publisher](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/)
before its first upload. Publication fails on existing versions;
do not replace artifacts or skip that failure. After publishing, verify the
registry's version, hashes, install, and imports before submitting a LangChain
integration listing.

## Homebrew

the release pipeline generates a formula file that targets the GitHub release tarball.

the release workflow attaches `token-glace.rb` and `sha256sums.txt` to the
GitHub release. The formula installs both the `token-glace` and legacy
`tokenjuice` commands.

this fork does not publish a Homebrew tap by default. To sync one:

- set the `HOMEBREW_TAP_GITHUB_TOKEN` secret and the
  `HOMEBREW_TAP_REPOSITORY` variable
- manually dispatch `.github/workflows/homebrew-tap.yml` with the published tag;
  without both settings the workflow fails
- the tap formula points at the GitHub release tarball

the release workflow no longer dispatches the tap sync itself.

## apt / dnf / yum

linux packages are built from the same compiled payload:

- `.deb` and `.rpm` require Node.js 22.12.0 or newer
- payload lives under `/usr/lib/token-glace`
- `/usr/bin/tokenjuice` is a thin wrapper

Cloudsmith publication is optional:

- main release workflow can push to Cloudsmith for the fixed `vincentkoc/tokenjuice` repo
- manual `publish-apt.yml` and `publish-rpm.yml` workflows exist for retries/backfills
