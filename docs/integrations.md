# integration catalog

The complete [harness and framework catalog](../README.md#harness-and-framework-catalog) lives in the project README as one table, with setup commands, configuration locations, and integration modes.
It includes CLI and editor harnesses, desktop clients, guidance formats, external plugins, and framework adapters.

Each table entry links to its setup guide. For more detail, use:

- [Documentation index](README.md) — all integration guides and reference pages.
- [Framework integrations](framework-integrations.md) — Hermes, Copilot SDK, LangChain, Mastra, and FastMCP setup.
- [Adapter support and verification](adapter-support-matrix.md) — native test versions and remaining acceptance work.
- [Complete verification inventory](verification-inventory.md) — every installer target and alias, with its evidence level.

Guidance files ask an agent to call `tokenjuice wrap`; they do not compact every command automatically.
Manual imports need host-side setup. Retired additive hooks remain explicit-wrapping routes, and a passing doctor check does not prove that a host loaded an integration.
