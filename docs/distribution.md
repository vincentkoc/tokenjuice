# distribution

tokenjuice ships as a compiled JavaScript CLI and library. All distribution formats require Node.js.

that means:

- `tsc` builds the runnable CLI into `dist/`
- npm publishes the package with `bin.tokenjuice -> dist/cli/main.js`
- release builds produce a tarball with:
  - `dist/`
  - `bin/tokenjuice`
  - `package.json`
  - `README.md`
  - `LICENSE`
- Homebrew installs that tarball and wraps `dist/cli/main.js` with the brewed `node`
- nfpm builds `.deb` and `.rpm` packages that require `nodejs >= 22`

## runtime and release checks

Requires Node.js 22 or newer. The CLI uses the same compiled JavaScript entry point across distribution formats.
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
pnpm release:formula -- --published-tarball-sha256 <64-lowercase-hex>
```

the recovery override is intentionally offline and does not require or rebuild a
local tarball.

that writes:

- `release/tokenjuice-v<version>.tar.gz`
- `release/sha256sums.txt`
- `release/Formula/tokenjuice.rb`

## npm

npm, pnpm, and yarn already work off the published package:

```bash
npm install -g tokenjuice
pnpm add -g tokenjuice
yarn global add tokenjuice
npx tokenjuice --help
```

## Homebrew

the release pipeline generates a formula file that targets the GitHub release tarball.

expected shape:

```bash
brew tap vincentkoc/tap
brew install tokenjuice
```

Homebrew maps the `vincentkoc/tap` alias to the canonical
`vincentkoc/homebrew-tap` GitHub repository.

Homebrew publication is target-owned:

- GitHub release uploads `sha256sums.txt`
- the Tokenjuice workflow in `vincentkoc/homebrew-tap` validates the published
  release assets and updates its formula
- release maintainers manually dispatch that target workflow with the published
  tag until GitHub App automation lands
- the tap formula points at the GitHub release tarball

## apt / dnf / yum

linux packages are built from the same compiled payload:

- `.deb` and `.rpm` require Node.js 22 or newer
- payload lives under `/usr/lib/tokenjuice`
- `/usr/bin/tokenjuice` is a thin wrapper

Cloudsmith publication is optional:

- main release workflow can push to Cloudsmith for the fixed `vincentkoc/tokenjuice` repo
- manual `publish-apt.yml` and `publish-rpm.yml` workflows exist for retries/backfills
