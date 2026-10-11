# E04 new-image repair — blueprint and review packet

Status: SOURCE/TESTS FROZEN; ROOT REVIEWED AND APPLIED; LIVE PNG UNVERIFIED.

Owner: Zeno `01a12a36-655e-7d32-8c86-4722852e18d1`, sole D004 engine writer; no delegation.
Worktree: `/Users/run176504/.gemini/antigravity/scratch/codex-chatgpt-web-wt/new-image-repair-20261011`
Branch: `codex/asli-new-image-repair-20261011`
Fixed baseline: `32459ee4e61002265e182a0b89ec033e9dcf7138` (verified clean before edits).

Final root receipt (reported in this relay): immutable acceptance snapshot
`/Users/run176504/.codex/tmp/e04-root-acceptance-49n8tc82`; 61 PASS / 0 FAIL and
typecheck exit 0; code review and six-path byte checks passed. Root backed up the
clean runtime, applied exactly the six reviewed source/test paths and verified
byte equality with its immutable snapshot. Source baseline HEAD remains unchanged.
Writer performed no runtime apply, Git publication, UI operation or live generation.
Root will commit/push the scoped public engine delivery after report closeout.

Final writer receipt: actual-marker/raw-prompt affected checks 12 PASS / 0 FAIL;
final typecheck exit 0; six-path verification snapshot byte equality and
`git diff --check` passed. No new code blocker remains. Only this report was edited
after the source/test freeze. Root owns its separate acceptance report.

## BLUEPRINT (before implementation)

Observed failure: D002 records two Project/XHigh/new/raw_prompt/zero-reference
F0489 attempts with visible `Image generation failed`, no generated image, and
`image_output_missing` before persistence. Backend mode is unknown; model prose
about edit mode is not backend evidence. E02 edit output works per D002.

UI lease: latest T0 D004 revokes all repair-writer Project UI access, including
read-only access. Only the original E04 owner observes Create Image, current
new/edit state and Project instructions. Before revocation CUA could not locate
the Project tab in ordinary Chrome; no Project tool or instruction was inspected,
and no prompt was submitted. This initial state is superseded by D004 below.

### D004 evidence and scope update (before preparation implementation)

Read E04 owner's `diagnosis-D004/ui-observations.json`, `actual-responses.json`
and `repair-handoff.md`. Owner observed ASLI Project / Chat / Extra High / empty
composer, no selected Create image; Project Instructions EMPTY; `Add files and
more` has a real **button** `Create image` with description `Visualize anything`.
The subsequent selected-state AX/screenshot/DOM evidence is described below.
Backend mode and causal recovery still require the original owner's one-anchor
live test. Repair writer UI lease remains revoked.

T0 expanded write scope to `pipeline-runner.ts` only for `job.mode` → optional
`imageOutput.operation` (`new` / `edit`). Implement `operation=new` preparation
using the observed accessible entry names, confirm the actual selected marker
described below, then attach the original complete prompt.
Confirm again immediately before Send. Missing entry/unconfirmed selected state
fails before prompt submission. Edit and ordinary chat skip this entirely. Do not
infer or claim a backend mode from this selected composer state.

Root may review, back up and apply after affected checks without asking T0 again;
only the existing E04 owner runs the live anchor and four-concurrent recovery.

### Actual selected marker correction — resolved root review blocker

Read owner `create-image-selected-AX.txt` and inspected `create-image-selected.png`.
Selected Create image is a BLUE INLINE CHIP within the text-entry area, not a
button. AX 712 is Add files and more; AX 713 text-entry value includes Create image;
AX 715 is text Create image; Extra High remains visible. The initial candidate
`getByRole(button, Create image)` confirmation was invalid for this real renderer,
and root correctly blocked apply despite fixture GREEN.

Read owner `create-image-selected-DOM.json`: composer is a live editable textbox;
the marker is `p → span[contenteditable=false] → span` with exact label Create image.
Observed Mention/Label class hashes are not used in the contract. The final shared
composer evaluator scopes to that observed noneditable inline structure, rejects
menu/dialog/quoted content and ordinary prompt strings, and requires one marker.
It serves both selection confirmation and prompt readback.

The evaluator clones for readback, removes only the recognized tool decorator and
its observed single editor spacer, and preserves every following raw-prompt code
unit (including leading spaces, CRLF and trailing spaces). The live editor/marker
is not removed. Ordinary-chat readback behavior is preserved. Preparation clears
the prior empty draft BEFORE selecting Create image, inserts the complete original
prompt, verifies real prompt integrity and rechecks the marker after insertion
and immediately BEFORE Enter. Missing entry/unconfirmed selection fails before Send.

All independent affected checks on the preceding candidate passed (50 image/runner
tests, 150 browser contracts with one separately proven baseline failure excluded;
typecheck exit 0). These fixtures did not prove the selected live chip. This review
blocker superseded the earlier fixture GREEN. Actual-DOM RED then reproduced both
real failures: selected chip rejected; chip text incorrectly included in raw prompt
readback. Final affected GREEN is 12 PASS / 0 FAIL, including real
`attachedPromptText/assertPromptAttached` rather than an always-passing assertion
mock, and plain-text insertion retaining the marker and entire raw prompt.
Root has now applied the corrected reviewed version. Live generation recovery is
still unverified.

Minimal scope:

- `image-output.ts`: inspect the bound current assistant/gallery, emit bounded
  numeric image counts/completion/dimensions and a failure-UI boolean; classify
  provider failure, completed turn without image, and image present but capture
  failed. Do not include text, URLs, image bytes or config in diagnostic messages.
- Preserve the bound-turn ownership filter; reject submitted user references and
  ordinary quoted/Markdown reference images as fresh output. Hidden images cannot
  qualify. Retain generated-gallery/preview support and assistant widget support.
- `browser-worker.ts`: image jobs use the same inspection at completion readiness
  and capture; propagate the classified error. Text/model routing stays unchanged.
- Direct tests exercise the actual DOM evaluation callback and persistence,
  covering observed failure UI/no image, completed text/no image, normal generated
  output, old references, incomplete images and fetch failure.

Interface: keep `captureChatGptAssistantImages` arguments/artifact return intact;
add a turn-scoped inspection result and structured diagnostic error. Distinguish
capture errors from persistence errors. No new retry loop, no backend mode claim.

RED → GREEN: first add classification/reference tests against baseline and record
the expected failures. Implement only the classified capture/readiness path, then
run image tests, browser-worker contracts and typecheck with existing dependencies
read from the canonical tree (no canonical writes or dependency installation).

Preparation gate: use D004's actual accessible entry names; no guessed backend
parameter or prompt/Project instruction rewrite. Fail closed if the selected
composer control cannot be confirmed. New generation recovery remains unaccepted
until the original E04 owner's same-anchor live test succeeds.

Real acceptance gate (NOT run by repair writer): root reviews patch, backs up and
scoped-deploys engine; original E04 owner alone verifies changed new-tool preparation
evidence and runs one same-spec F0489 with Project/XHigh/raw_prompt/zero refs. A
readable new PNG is required before resuming the original 12 chain/star targets,
all XHigh, one process / four concurrent tasks. No old anchor/native replacement.

Writer delivery is the scoped patch and this public report. Writer performed no
commit, push, merge, real pipeline run, generation, shared-config or canonical write.

## Verification results

Baseline image tests: `NODE_PATH=/Users/run176504/.gemini/antigravity/scratch/codex-chatgpt-web/node_modules bun test tests/chatgpt-web-image-output.test.ts` — 5 pass, 0 fail.
Image classification RED: 5 original pass / 5 new fail, expected missing codes and
ordinary Markdown reference included as output. Worker readiness RED: reference
image incorrectly returned imageReady=true. First GREEN: 156 pass / 1 fail across
image and browser contracts. The one failure `browser turns run concurrently up
to the five-tab limit` expects 5 but baseline constant is 10; reproduced separately
on fixed baseline (0 pass / 1 fail). No tab/default/routing change is in scope.

Dependencies: worktree has no node_modules; use an isolated `/tmp` verification
snapshot and read-only symlink to existing canonical node_modules. An initial
NODE_PATH attempt could not resolve Domino and was tooling failure, not RED or a
product failure. Initial patch typing issues were fixed; missing launcher/scripts
were included unchanged in the final verification snapshot. The final snapshot
uses a durable local temporary directory because runtime-command validation rejects
/tmp test entrypoints. No installation or canonical write by the writer.

## Final review package (source/tests frozen)

Verification snapshot: `/Users/run176504/.codex/tmp/e04-verify-5R7I3d`.
It contains copied local source/tests/launcher/scripts, existing canonical
node_modules via a read-only dependency symlink, and a synthetic default config
under `test-home` (no production/private config copied). Six changed source/test
files were byte-compared with the worktree; identical. `git diff --check` passed.

Source diff: `src/adapters/chatgpt-web/{browser-worker.ts,image-output.ts,pipeline-runner.ts}`.
Test diff: `tests/{browser-worker-contract.test.ts,chatgpt-web-image-output.test.ts,run-pipeline-raw-prompt.test.ts}`.
Report/blueprint: this file. No other product/source paths changed.

Actual preparation RED: new ignored operation and inserted prompt without choosing
entry; missing-entry fixture resolved instead of failing. Runner RED: six
JSON-loaded new/edit/raw-prompt cases saw operation undefined. After implementation
these cases passed, including unchanged complete raw prompt and attachment order.
Additional reference RED: user source echoed in an assistant gallery was accepted;
now the current-turn input URL is excluded (URL never included in diagnostics).

Pre-correction independent results:

| Check | Result |
|---|---|
| Image capture/classification | 10 pass / 0 fail |
| Pipeline raw prompt | 7 pass / 0 fail |
| JSON runner mode/raw prompt | 26 pass / 0 fail |
| Runner dependency core | 3 pass / 0 fail |
| Runner edit/dependency mocks | 4 pass / 0 fail |
| Browser contracts, baseline tab test excluded | 150 pass / 0 fail / 1 filtered |
| Typecheck, full local project snapshot | exit 0 |

Exact commands, each test file in its own process because existing
`pipeline-runner.test.ts` mocks node:fs and browser-worker globally:

```sh
cd /Users/run176504/.codex/tmp/e04-verify-5R7I3d
export CODEX_CHATGPT_WEB_HOME=/Users/run176504/.codex/tmp/e04-verify-5R7I3d/test-home
bun test tests/chatgpt-web-image-output.test.ts
bun test tests/pipeline-runner-raw-prompt.test.ts
bun test tests/run-pipeline-raw-prompt.test.ts
bun test tests/pipeline-runner-core.test.ts
bun test tests/pipeline-runner.test.ts
bun test tests/browser-worker-contract.test.ts -t 'actual noneditable|real prompt readback|new-image|new image preparation|image-job snapshot|composer verification|prompt verification|prompt insertion|plain-text'
bun /Users/run176504/.gemini/antigravity/scratch/codex-chatgpt-web/node_modules/typescript/bin/tsc --project tsconfig.json --noEmit
```

Final marker command above: 12 pass / 0 fail / 141 unrelated filtered. The preceding
independent broad browser run (before actual marker correction) used
`-t '^(?!browser turns run concurrently up to the five-tab limit$)'` and returned
150 pass / 0 fail / 1 known-baseline test filtered. It was not rerun after correction;
only affected paths and typecheck were repeated. Root's independent final acceptance
receipt is 61 PASS / 0 FAIL + tsc 0, not an unfiltered whole-suite claim.

The CLI validation test uses a fixture/mock worker; no actual pipeline or generation
was run. An invalid combined invocation had mock/config isolation failures
(including `GPT-6 Sol rejects a staged prompt before opening a browser and releases
its preparation` and image fs ENOENT). It was replaced with the independent commands
above; no production changes were made for those harness failures. An intervening
combined broad run was stopped by the writer using its verified own PID only.

Root review commands in the fixed worktree: `git diff --check` and
`git diff -- src/adapters/chatgpt-web/browser-worker.ts src/adapters/chatgpt-web/image-output.ts src/adapters/chatgpt-web/pipeline-runner.ts tests/browser-worker-contract.test.ts tests/chatgpt-web-image-output.test.ts tests/run-pipeline-raw-prompt.test.ts`.
Inspect this untracked report separately. Keep the fixed baseline; do not merge
origin/main, reset runtime, change defaults, or install/restart a shared helper.
Runner already uses its direct canonical source worker; root alone backs up/applies.

## Remaining live gate

Root notified the sole E04 UI/generation owner to release the preparation lease and
run exactly one same-spec F0489 Project/XHigh/new/raw_prompt/zero-source/zero-reference
anchor. No readable new PNG is yet established by this report. Only that success
unlocks the existing 12 same-anchor chain/star targets, all XHigh, one process and
four concurrent tasks. No additional approval is required by T0. No backend mode
claim, content-quality claim, old-image substitution or native-image replacement.

This public report contains no private Project URL, full production prompt,
configuration/session content or image payload. Private evidence is referenced by
its specific evidence filenames only.
