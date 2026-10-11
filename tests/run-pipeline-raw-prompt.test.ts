import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadAndValidatePipelineJobs } from "../scripts/run-pipeline";
import type { BrowserTurn } from "../src/adapters/chatgpt-web/browser-worker";
import { KeyframePipelineRunner } from "../src/adapters/chatgpt-web/pipeline-runner";
import { defaultConfig } from "../src/config";

const fixtureDir = join(import.meta.dir, "fixtures/pipeline-runner");
const prompt = "  按参考图还原房间。\r\nKeep the background and camera.\n\n ";
const envKeys = ["CODEX_CHATGPT_WEB_HOME", "CODEX_CHATGPT_WEB_BROWSER_HELPER_PROCESS", "CODEX_CHATGPT_WEB_MAX_TABS"] as const;
let root: string;
let originalEnv: Array<string | undefined>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "run-pipeline-raw-prompt-"));
  originalEnv = envKeys.map(key => process.env[key]);
  process.env.CODEX_CHATGPT_WEB_HOME = root;
  writeFileSync(join(root, "config.json"), JSON.stringify(defaultConfig()));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  envKeys.forEach((key, idx) => {
    if (originalEnv[idx] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[idx];
  });
});

function writeJobs(value: unknown) {
  const path = join(root, "jobs.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe("run-pipeline JSON raw_prompt", () => {
  for (const shape of ["array", "jobs", "single"] as const) {
    test.each([true, false, undefined])(`${shape} preserves boolean raw_prompt=%j and omission`, rawPrompt => {
      const job = { task_id: "room", prompt, ...(rawPrompt === undefined ? {} : { raw_prompt: rawPrompt }) };
      const path = writeJobs(shape === "array" ? [job] : shape === "jobs" ? { jobs: [job] } : job);
      const { jobs, errors } = loadAndValidatePipelineJobs(path);
      expect(errors).toEqual([]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].prompt).toBe(prompt);
      expect(jobs[0].raw_prompt).toBe(rawPrompt);
      expect(Object.hasOwn(jobs[0], "raw_prompt")).toBe(rawPrompt !== undefined);
      expect(jobs[0].reasoning).toBe("low");
    });
  }

  for (const mode of ["new", "edit"] as const) {
    test.each([true, false, undefined])(`JSON-loaded ${mode} raw_prompt=%j reaches prepared text`, async rawPrompt => {
      const path = writeJobs({ jobs: [{
        task_id: "room", mode, prompt,
        ...(rawPrompt === undefined ? {} : { raw_prompt: rawPrompt }),
        ...(mode === "edit" ? { edit_source: join(fixtureDir, "img.png") } : {}),
        reference_images: [join(fixtureDir, "ref1.png")],
      }] });
      const { jobs, errors } = loadAndValidatePipelineJobs(path);
      expect(errors).toEqual([]);
      const runner = new KeyframePipelineRunner({ defaultOutputDir: root });
      let prepared: Awaited<ReturnType<BrowserTurn["prepare"]>> | undefined;
      runner["worker"] = {
        run: async (turn: BrowserTurn) => {
          expect((turn.imageOutput as {operation?:string})?.operation).toBe(mode);
          prepared = await turn.prepare();
          return "test browser result";
        },
      } as any;
      expect((await runner.runSingle(jobs[0], 0)).success).toBe(true);
      const preamble = mode === "edit"
        ? "the FIRST attached image is the previous keyframe to edit; keep identity, wardrobe, camera, lighting and layout consistent except for the described changes; other attached images are identity references only, never copy their backgrounds.\n\n"
        : "attached images are identity references only.\n\n";
      expect(prepared?.text).toBe(rawPrompt === true ? prompt : preamble + prompt);
      expect(prepared?.images.map(image => image.ref)).toEqual(mode === "edit" ? ["edit_source", "ref_0"] : ["ref_0"]);
    });
  }

  test.each(["true", "false", "", 0, 1, null, [], [true], {}].map(value => [value]))(
    "rejects non-boolean raw_prompt=%j during validation without retaining it", rawPrompt => {
      const { jobs, errors } = loadAndValidatePipelineJobs(writeJobs({ prompt, raw_prompt: rawPrompt }));
      expect(errors).toEqual([`Invalid raw_prompt for task task_1: ${JSON.stringify(rawPrompt)} (expected boolean)`]);
      expect(Object.hasOwn(jobs[0], "raw_prompt")).toBe(false);
    },
  );

  test("keeps raw_prompt validation aligned to each row when task IDs are duplicated", () => {
    const { jobs, errors } = loadAndValidatePipelineJobs(writeJobs([
      { task_id: "duplicate", prompt, raw_prompt: true },
      { task_id: "duplicate", prompt, raw_prompt: "true" },
    ]));
    expect(jobs[0].raw_prompt).toBe(true);
    expect(Object.hasOwn(jobs[1], "raw_prompt")).toBe(false);
    expect(errors).toEqual([
      'Invalid raw_prompt for task duplicate: "true" (expected boolean)',
      "Duplicate task_id: duplicate",
    ]);
  });

  test("CLI reports invalid raw_prompt in the existing error format before creating a worker", async () => {
    const jobsPath = writeJobs({ jobs: [{ task_id: "bad", prompt, raw_prompt: "true" }] });
    const workerPath = join(root, "worker-created");
    const proc = Bun.spawn([
      process.execPath, "--preload", join(fixtureDir, "mock-browser-worker.ts"),
      resolve("scripts/run-pipeline.ts"), jobsPath,
    ], {
      env: { ...process.env, PIPELINE_TEST_WORKER_CREATED: workerPath, PIPELINE_TEST_TURNS: join(root, "turns.jsonl") },
      stdout: "pipe", stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text(),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Validation failed:\n- Invalid raw_prompt for task bad: "true" (expected boolean)');
    expect(stdout).not.toContain("🚀");
    expect(existsSync(workerPath)).toBe(false);
  });
});
