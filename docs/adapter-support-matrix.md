# Adapter support and verification

Support modes differ. A file passing doctor means the managed file is present
and consistent; it does not prove that a desktop app loaded it or that a model
received compacted output. Guidance asks an agent to use `tokenjuice wrap`.
Replacement changes the result delivered by a host. Additive context retains
the original result, so it does not establish net token savings.

This inventory covers the products below. Follow each linked guide for its
contract, install scope and verification steps.

| Product | Mode and setup | Automated evidence | Remaining host acceptance |
| --- | --- | --- | --- |
| [Factory Droid](droid-integration.md) | Pre-tool `Execute` command wrapping; `install droid`. | Real pinned Droid `1.1.0` sessions check follow-up model requests, exact bytes, raw bypass, stderr, exit/error status and Low-autonomy rejection. | Other host versions and remote providers remain unqualified; headless input rewrites require High autonomy in the pinned host. |
| [Qoder CLI](qoder-integration.md) | Synchronous Bash result replacement; `install qoder-cli`. `install qoder` retains project guidance. | Runtime/envelope tests, lifecycle/JSON CLI tests and installed hook child-process contracts. | Real Qoder must apply the final replacement after all hooks; inspect merged user/project scopes. |
| [DeepSeek Harness](deepseek-harness-integration.md) | Native Bash content replacement; built Cordis bundle activated with `dsh plugin --profile PROFILE add <bundle>`. | Waterfall/canonical-value tests and isolated self-contained bundle contract; source pinned to `0.2.2-alpha.2`. | Install that Harness version, activate the selected profile, inspect dumped config and the next native model request. PTC canonical values remain unchanged; explicit wrapping is required there. |
| [Antigma Ante](ante-integration.md) | Project instruction guidance; `install ante`. | Nearest-ancestor instruction selection, fallback preservation and lifecycle tests. | Fresh Ante conversation must load the selected instruction file and follow wrapping guidance. |
| [Tencent WorkBuddy](workbuddy-integration.md) | Portable skill with localized metadata; manual desktop import. | Packaged metadata and dependency/raw-guidance tests. | Import acceptance, enablement and execution inside the desktop tool environment. CodeBuddy CLI hooks are a separate product contract. |
| [T3 Code](t3-code-integration.md) | Provider composition; configure Codex, Claude Code or the correct OpenCode major on the execution machine. | Provider adapters have their own tests; documentation maps config homes and server reload boundaries. | Verify each selected T3 provider instance, including shadow/custom homes and remote servers, in a new thread. |
| [OpenCode V1](spec.md) | Bash result replacement; `install opencode`. | Real pinned OpenCode `1.19.5` fixture checks follow-up model requests, exact reads, raw bypass and failure status. | Other host versions and external/T3 server propagation need their own acceptance. |
| [OpenCode V2](opencode-v2-integration.md) | Foreground `shell` result replacement; `install opencode-v2`, separate plugin directory. | Native `v2.0.18` baseline/installed sessions capture follow-up model requests, compacted Git status, exact reads, unchanged inventory/raw output and exit 7 with complete stderr/output. | Other versions, remote providers and shared/T3 server propagation need separate acceptance. Inventories stay raw without a trusted session execution directory. |
| [Goose](goose-integration.md) | `.goosehints` guidance; `install goose`. | File lifecycle tests and visible `CONTEXT_FILE_NAMES` diagnostics. | Enable Developer extension, include `.goosehints` in the host's filename list, restart and verify adherence. |
| [Doubao Work](doubao-work-integration.md) | Portable skill; personal file/folder import. Developer ZIP has `SKILL.md` at archive root. | Packaged metadata and dependency/raw-guidance tests. | Personal importer acceptance and actual tool execution; marketplace publication is separate. |
| [QClaw](qclaw-migration.md) | Migration guidance to WorkBuddy; no new QClaw hook target. | Documentation checked against the official migration route. | Account migration is a user operation; afterward qualify WorkBuddy separately. |
| [AutoClaw](autoclaw-integration.md) | Copyable workflow for the documented custom-skill UI. | Workflow and UI route documented; no invented discovery path or OpenClaw ABI alias. | Create/select the skill, establish command execution and tokenjuice availability, then inspect results in the chosen desktop/cloud environment. |
| [QoderWork](qoderwork-integration.md) | User skill guidance; `install qoderwork`. | Native skill path, owned-file lifecycle and JSON CLI tests; shared unsafe-path/backup tests. | Fresh app skill discovery and actual tool execution. Qoder CLI's replacement hook does not establish QoderWork compatibility. |
| [QwenWork](qwenwork-integration.md) | User skill guidance; `install qwenwork`. | Native skill path, owned-file lifecycle and JSON CLI tests; shared unsafe-path/backup tests. | Fresh app skill discovery and actual tool execution; Qwen Code is a separate adapter. |
| [Grok Bot](grok-bot-integration.md) | Manual private cloud skill; experimental local `.mdc` compatibility candidate via `install grok-bot`. | Local file lifecycle/safety tests and historical static app evidence. | Current cloud skill creation/loading and wrapper execution. Historical local bundle inspection does not qualify the current app or its cloud computer. |
| [Grok Build](grok-build-integration.md) | Project `AGENTS.md` guidance; `install grok-build`. Passive hook stdout cannot replace tool results. | Instruction lifecycle tests. | Fresh Build session loading and command adherence; keep the instruction file visible to the host's ignore rules. |
| [Community Grok CLI](grok-cli-integration.md) | Explicit `tokenjuice wrap`; automatic hook retired. Legacy uninstall remains available. | Native macOS arm64 standalone from npm `grok-dev@1.1.7` reports `1.1.4`: checks model requests, explicit wrapping, raw output and native failure flags; configured hooks do not run. | The separate JavaScript entrypoint, other versions/platforms and remote providers remain unqualified. This is not xAI Grok Build or Grok Bot. |

## Acceptance record

For a new host/version, record these facts without copying private transcripts:

1. Host and tokenjuice versions, execution machine class, configuration scope and
   selected profile/provider. A desktop PATH does not establish a cloud/VM PATH.
2. Installation/import result and fresh-session activation. Resolve duplicate
   hooks and provider-specific configuration before interpreting output.
3. A successful noisy command, an exact file read, an explicit
   `tokenjuice wrap --raw -- <command>`, and a failing command with its status.
4. The next model request or authoritative provider transcript showing which
   bytes were delivered. A shorter UI preview alone is insufficient.
5. Removal result and preservation of unrelated hooks, files and approvals.

Use a disposable project and private fixture data. Paid sessions, account
migration and marketplace/team publication are separate operations. The adapter
does not expand the host's execution or approval authority.
