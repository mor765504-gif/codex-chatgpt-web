import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserTurn } from "../src/adapters/chatgpt-web/browser-worker";
import { KeyframePipelineRunner, type PipelineJobSpec } from "../src/adapters/chatgpt-web/pipeline-runner";

const fixtureDir = join(import.meta.dir, "fixtures/pipeline-runner");
const prompt = "  按参考图还原房间。\r\nKeep the background and camera.\n\n ";
const editPreamble = "the FIRST attached image is the previous keyframe to edit; keep identity, wardrobe, camera, lighting and layout consistent except for the described changes; other attached images are identity references only, never copy their backgrounds.\n\n";
const newPreamble = "attached images are identity references only.\n\n";
let outputDir: string;
let originalHelperProcess: string | undefined;
let originalMaxTabs: string | undefined;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "pipeline-raw-prompt-"));
  originalHelperProcess = process.env.CODEX_CHATGPT_WEB_BROWSER_HELPER_PROCESS;
  originalMaxTabs = process.env.CODEX_CHATGPT_WEB_MAX_TABS;
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
  for (const [key, value] of [
    ["CODEX_CHATGPT_WEB_BROWSER_HELPER_PROCESS", originalHelperProcess],
    ["CODEX_CHATGPT_WEB_MAX_TABS", originalMaxTabs],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function prepareJob(job: PipelineJobSpec) {
  const runner = new KeyframePipelineRunner({ defaultOutputDir: outputDir });
  let prepared: Awaited<ReturnType<BrowserTurn["prepare"]>> | undefined;
  runner["worker"] = {
    run: async (turn: BrowserTurn) => {
      prepared = await turn.prepare();
      return "test browser result";
    },
  } as any;
  const result = await runner.runSingle(job, 0);
  expect(result.success).toBe(true);
  expect(prepared).toBeDefined();
  return prepared!;
}

function image(ref: string, filename: string, mime: string) {
  return {
    ref,
    imageUrl: `data:${mime};base64,${readFileSync(join(fixtureDir, filename), "base64")}`,
  };
}

describe("pipeline raw_prompt", () => {
  for (const mode of ["edit", "new"] as const) {
    test.each([undefined, false, true])(`${mode} with references and raw_prompt=%j preserves prompt and attachment order`, async rawPrompt => {
      const prepared = await prepareJob({
        task_id: "room",
        mode,
        prompt,
        ...(rawPrompt === undefined ? {} : { raw_prompt: rawPrompt }),
        ...(mode === "edit" ? { edit_source: join(fixtureDir, "img.png") } : {}),
        reference_images: [join(fixtureDir, "ref1.png"), join(fixtureDir, "ref2.jpg")],
      });

      expect(prepared.text).toBe(rawPrompt === true ? prompt : (mode === "edit" ? editPreamble : newPreamble) + prompt);
      expect(prepared.images).toEqual([
        ...(mode === "edit" ? [image("edit_source", "img.png", "image/png")] : []),
        image("ref_0", "ref1.png", "image/png"),
        image("ref_1", "ref2.jpg", "image/jpeg"),
      ]);
    });
  }

  test("new without attachments keeps the prompt unchanged by default", async () => {
    const prepared = await prepareJob({ task_id: "plain", mode: "new", prompt });
    expect(prepared.text).toBe(prompt);
    expect(prepared.images).toEqual([]);
  });
});
