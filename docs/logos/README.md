# Client logos

The [README catalog](../../README.md#harness-and-framework-catalog) uses these local PNGs so image hosts and theme-dependent SVG styles cannot break the table.

Every image comes from an official project site, repository, organization, or brand kit. [sources.json](sources.json) records the upstream URL, source SHA-256, rendered SHA-256, and client-to-asset mapping. An `archive_member` identifies artwork extracted from a brand-kit ZIP. Shared brand marks reuse one file.

## Rendering standard

- Store a 96 × 96 PNG and display it at 48 × 48, with both HTML dimensions set.
- Fit the artwork within 72 × 72 without stretching. Remove transparent padding only; preserve the original colors and backgrounds.
- Use an opaque white canvas with a one-pixel `#d0d7de` border. Light artwork gets a 76 × 76 dark inner plate, recorded as `inner_background`.
- Render SVGs in their light color scheme. Check the resulting image on both light and dark backgrounds at its displayed size.
- Keep runtime image URLs local. Do not substitute a host's customer logo, a generic hosting-service icon, a generated identicon, or an invented monogram.

These tiles were rasterized with resvg 2.6.2 and normalized with ImageMagick. Source hashes refer to the original downloaded artwork before rasterization; rendered hashes refer to the checked-in PNGs.

## Missing and shared marks

AgentInit, AI Memory Protocol, the community Grok CLI, LeanCTL, NovaKit, pi-go, and Ruler have no verified project-specific mark in their linked sources. Their catalog rows intentionally use a dash. Do not fill those slots with unrelated or fabricated artwork.

QwenPaw also uses a dash until a project-specific mark is verified.

The GitHub product rows use the current GitHub mark from its brand kit; the old Copilot mascot is retired. Windsurf retains its official historical symbol rather than substituting the Devin logo now served by its redirected website. Some integrations use their official parent-project mark, such as AWS, OpenAI, JetBrains, and LangChain.

When replacing an image, verify its identity against the project source, update both hashes and the source URL, then recheck the table in both themes. A new hostname or a successful image download alone does not establish that an asset is the project's logo.
