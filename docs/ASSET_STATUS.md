# Current source status

This summary describes the checked-in 6.1.7 source. It is not a receipt for an installed launcher,
a current ChatGPT account, a platform package, or a production deployment.

## Entry points and provenance

- Read README.md for setup, docs/architecture.md for the component model,
  docs/security-model.md for trust boundaries, and docs/release-validation.md for acceptance gates.
- Package metadata, installers, and the updater retain the upstream project release channel.
  A source checkout and a downloaded release are separate identities; local changes are not thereby
  included in the downloaded application.
- Browser-only has no local tools. Full mode connects the current Codex tool registry through MCP.
  Zero Risk is a manual interaction mode, not a guarantee that local tool execution has no risk.

## Implemented boundaries

- Input image attachments and forwarding native Image Gen requests are distinct from generating
  images in the ChatGPT browser conversation. The latter remains unsupported on this source line;
  see TROUBLESHOOTING.md.
- Ordinary launcher sign-in uses its embedded browser. The optional macOS passkey flow requires
  Google Chrome, uses a dedicated temporary profile, imports validated ChatGPT/OpenAI state into
  the launcher, and verifies authentication and cleanup. It does not use the normal Chrome profile.
- The MCP wait_agent transport contract is 30 seconds per call, within a separate 90-second
  invocation deadline. A wait timeout is not task completion.
- Bigger Context is experimental and model/account dependent. GPT-6 Sol uses its explicit budget
  branch rather than the generic three-times rule. Advertised budgets do not prove account access.
- The Limits page estimates this launcher's accepted submissions only. It is not an account-wide
  remaining quota or official reset-time service.

## What checks establish

Run doctor checks local integration and runtime health. It explicitly cannot prove that the
ChatGPT connector is attached; a healthy endpoint is not a completed Codex tool turn.

The DEV driver can exercise real browser and compaction paths, but outer tool results are marked
simulated and perform no side effects. Execution changes require a real installed Codex consumer.

The CI and release workflows define build and package gates. They do not constitute run results.
The dated v3.0.0 Windows narrative in release-validation.md is historical; it does not validate the
current 6.1.7 source. Record current candidate identity, platform, account mode, tool result,
compaction, cancellation and recovery separately before claiming release acceptance.
