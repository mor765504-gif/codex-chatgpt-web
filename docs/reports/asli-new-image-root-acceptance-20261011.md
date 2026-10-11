# D004 root acceptance and scoped runtime application

Tested source baseline: `32459ee4e61002265e182a0b89ec033e9dcf7138` plus the six source/test files in this delivery. An immutable local verification snapshot was byte-compared against those files before and after root checks. The later report/upload commit does not replace this tested baseline.

Root reviewed the actual selected-image-tool screenshot, accessibility text and scoped DOM supplied by the sole UI owner. The live renderer has a noneditable inline mention within the composer, with a nested `Create image` label; it has no same-name selected button. The initial button-only guard was rejected before runtime application. The corrected composer callback recognizes the observed structural marker and excludes it from prompt readback, while ordinary prompt text, quotes and menu entries do not prove selection.

The `new` operation now flows from the existing runner to image output. Only new-image preparation chooses the observed Add files and more → Create image entry and checks selected state before sending. Edit and ordinary chat skip this selection. The complete prompt and attachment order remain subject to existing exact readback. Missing entry or unconfirmed state fails before submit. Current-turn generated output is distinguished from input references, provider tool failure, completed text without image and image capture failure.

Root independently ran the following affected checks against the immutable snapshot, each suite in its own process:

| Check | Observed result |
|---|---|
| Actual marker, prompt readback, new preparation and directly affected browser contracts | 11 pass, 0 fail |
| Image capture/classification | 10 pass, 0 fail |
| Pipeline raw prompt | 7 pass, 0 fail |
| JSON mode/raw prompt | 26 pass, 0 fail |
| Dependency core | 3 pass, 0 fail |
| Edit/dependency fixtures | 4 pass, 0 fail |
| Full project TypeScript check | exit 0 |

These 61 checks prove affected engineering contracts. Runner tests use fixtures and mocks; their synthetic task-success messages are not live generated images. The writer separately recorded a pre-existing browser contract expecting five tabs while this fixed baseline allows ten. That unrelated baseline failure remains disclosed and was not changed to pass.

After review and checks, root backed up the clean fixed runtime's six scoped files, checked the patch with git apply --check, applied it without resetting or merging the runtime branch, and byte-compared the applied files with the tested snapshot. Runtime branch remains feature/asli-video-workflow at the fixed baseline plus this scoped patch. No configuration, private session, shared model default or helper restart was included.

The original UI owner received the concrete runtime-ready receipt and the existing authorization to run exactly one same-spec F0489 in Project/Extra High with the full original raw prompt and zero references. Only a readable newly generated PNG can unlock the original twelve chain/star targets, one runner and four concurrent jobs. Independent original-image QC, shared-owner ingestion and a real board view remain distinct required gates. At this report checkpoint, root has applied the patch; live PNG, twelve-target generation, QC and user acceptance remain unverified.

Private backup, runtime config, raw session diagnostics, project URLs and experimental images are excluded from this public engine delivery. Experimental assets and results belong to the private ASLI repository.

## R2 accepted-turn observation recovery checkpoint

The subsequent controlled batch landed nine of twelve targets. Chain r2 F0517 failed after accepted submission when a second image-inspection evaluate hit a 2000 ms TimeoutError; its two dependants were canceled. Actual phase evidence showed generation still running and no provider failure UI. This is an observation failure, not proof that the provider produced no image. Successful targets and the new anchor are preserved.

Incremental tested source baseline: ef3fbaa2e6c2998d8a6da6fa77a1e27eebf0aa74 plus the R2 browser-worker/test changes. Root reviewed the narrow catch: only image-inspection TimeoutError discards cache and returns through existing bound-turn observation/grace. Abort, non-timeout errors and a closed page remain terminal. Global deadlines, Send retry policy and model defaults are unchanged. Root independently ran ten directly affected contracts, zero failures, and TypeScript exit 0; unchanged 50/61 suites were not repeated.

With no run-pipeline process active, root backed up the two scoped runtime files, applied the checked incremental patch and compared the applied bytes with the frozen tested snapshot. The original UI owner received R2 runtime-ready authorization to recover output from the existing accepted turn, then continue only the failed three-task chain as needed. No successful nine-task rerun or new anchor was authorized by this fix. Actual recovery, further PNGs, QC and board publication remain separate live gates at this checkpoint.
