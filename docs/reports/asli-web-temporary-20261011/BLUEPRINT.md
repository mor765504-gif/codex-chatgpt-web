# Task-private Temporary discussion route

Owner: standalone executor, T0 is sole coordinator. Canonical engine 32459ee4e61002265e182a0b89ec033e9dcf7138; no source modifications. Write set: this directory only. Zeno source ownership preserved.

## Interfaces and load time
- `src/cli.ts:574,612`: --home sets CODEX_CHATGPT_WEB_HOME before loadConfig; serve loads config once at process start.
- `src/config.ts:157,381,661`: independent home/config.json, port, useSavedChats; provider built from process config. Exporting a home in a dispatch process cannot change a running daemon.
- `src/adapters/chatgpt-web/launcher-helper-client.ts:270`: per-run useSavedChats passed to helper. Existing launcher descriptor may be referenced without copying auth or opening another profile.
- `launcher/electron/browser-host.cjs:576`: one launcher-wide turnTabs guard, leases owned by helper/trace. Separate daemon does not grant more capacity. Browser worker also limits its own activeRuns; shared launcher guard is decisive. Installed cap is not assumed to equal canonical source cap or prove idle capacity.
- `browser-worker.ts:5113`: saved composer draft guard; Temporary uses its own newly allocated lease, never an existing Project page.
- `model.ts:62`: Web xhigh maps to Extra High UI index 3; native harness high is unrelated.

## Minimal implementation
1. Fresh private home (0700), fresh controlToken; construct default config and copy only allowlisted existing launcher descriptor path and capability booleans. No shared token, cookie, tunnel, or full config copies.
2. New loopback port 17842, verify available at bind; launch installed immutable 6.1.7 CLI --home PRIVATE serve. All logs/state private and ignored.
3. Wrapper pins only this process's openai_base_url=http://127.0.0.1:17842/v1, model chatgpt-web/extra-high and xhigh; never changes shared dispatch or ~/.codex config. Bounded turn, no retry storm, no image path, no new native agent.
4. One harmless no-attachment probe. Metadata-only inventory before/after, inspect only uniquely new non-Project probe target. Record route ID, configured/actual surface, timestamps, response and UI/model evidence. Do not inspect ASLI content.
5. Preserve pre-existing Project target identities/URL equality in memory (publish booleans only), launcher/shared PID liveness and descriptor surface lease mappings. Natural independent changes are not attributed to this route.

## Acceptance / handoff
PASS requires completed probe + actual Temporary URL and no Project/Saved path + Web Extra High evidence. Configuration/health alone are NOT acceptance. Capacity remains unknown unless live source states it. Artifacts from discussion are advisory, require T0/assigned reviewer acceptance, never imply local execution or image generation. Two unchanged blocking attempts stop execution.
Private runtime excluded from Git. Scoped shareable scripts/reports handed to T0 for commit/push; control-plane is not a Git repository, executor must not stage/commit or write outside this directory.

Sources: local canonical files above; https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/architecture.md ; official endpoint override reference https://learn.chatgpt.com/docs/config-file/config-reference . External source is reference only; local pinned implementation is authoritative.

## Execution findings
Bare Responses omitted native turn_id and was rejected before browser allocation. Final dispatch uses existing Codex CLI, overrides openai_base_url per invocation, xhigh, and disables subagents. Complete Web trace e3184f21fabb includes Temporary navigation, selected/confirmed Web slider value 3, zero attachments, accepted send and final response. One bounded native retry occurred before acceptance after a DOM observation timeout. The original exact-name reply is Markdown-escaped; normalized literal matches. Temporary /c/<id>?temporary-chat=true remains Temporary; /c path alone cannot classify it as Saved.

Official AGY CLI installed in private/bin using official manifest/payload/SHA512 steps. The installer native `install` subcommand was skipped to preserve shell profiles; no quarantine override used. Actual models list contains medium/high/low Gemini 3.8 Flash variants. A slug's effort must match: medium + high is rejected before auth; medium uses --effort medium. Source: https://www.antigravity.google/docs/cli/headless/ and https://github.com/google-antigravity/antigravity-cli .
