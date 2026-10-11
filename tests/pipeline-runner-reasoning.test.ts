import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultConfig, type AppConfig } from "../src/config";

const fixtureDir = join(import.meta.dir, "fixtures/pipeline-runner");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function runCli(
  jobs: Array<Record<string, unknown>>,
  args: string[] = [],
  configOverrides: Partial<AppConfig> = {},
) {
  const root = mkdtempSync(join(fixtureDir, "reasoning-"));
  roots.push(root);
  const config = { ...defaultConfig(), ...configOverrides };
  writeFileSync(join(root, "config.json"), JSON.stringify(config));
  const jobsPath = join(root, "jobs.json");
  writeFileSync(jobsPath, JSON.stringify({ jobs: jobs.map(job => ({ output_dir: root, ...job })) }));
  const resultsPath = join(root, "results.json");
  const turnsPath = join(root, "turns.jsonl");
  const workerPath = join(root, "worker-created");
  const proc = Bun.spawn([
    process.execPath, "--preload", join(fixtureDir, "mock-browser-worker.ts"),
    resolve("scripts/run-pipeline.ts"), jobsPath, "--delay=0", `--results=${resultsPath}`, ...args,
  ], {
    env: {
      ...process.env,
      CODEX_CHATGPT_WEB_HOME: root,
      PIPELINE_TEST_WORKER_CREATED: workerPath,
      PIPELINE_TEST_TURNS: turnsPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text(),
  ]);
  return {
    exitCode, stdout, stderr,
    workerCreated: existsSync(workerPath),
    results: existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : undefined,
    turns: existsSync(turnsPath)
      ? readFileSync(turnsPath, "utf8").trim().split("\n").map(line => JSON.parse(line))
      : [],
  };
}

describe("pipeline reasoning", () => {
  test.each(["low", "medium", "high", "xhigh", "max"])("passes task reasoning %s to BrowserTurn and results", async reasoning => {
    const res = await runCli([{ task_id: "task", prompt: "draw", reasoning }], [], {
      extraHighAvailable: true, proAvailable: true,
    });
    expect(res.exitCode).toBe(0);
    expect(res.turns).toHaveLength(1);
    expect(res.turns[0]).toMatchObject({ modelId: "gpt-5.6-sol", reasoning });
    expect(res.results[0]).toMatchObject({ task_id: "task", success: true, reasoning });
    expect(res.stdout).toContain(`reasoning: ${reasoning}`);
  });

  test("uses CLI reasoning only for tasks without a task-level value", async () => {
    const res = await runCli([
      { task_id: "default", prompt: "draw" },
      { task_id: "override", prompt: "draw", reasoning: "medium" },
      { task_id: "low", prompt: "draw", reasoning: "low" },
    ], ["--reasoning=high"]);
    expect(res.exitCode).toBe(0);
    expect(res.turns.map((turn: any) => turn.reasoning)).toEqual(["high", "medium", "low"]);
    expect(res.results.map((result: any) => result.reasoning)).toEqual(["high", "medium", "low"]);
  });

  test.each([
    ["xhigh", { extraHighAvailable: true, proAvailable: false }],
    ["max", { extraHighAvailable: false, proAvailable: true }],
  ] as const)("allows CLI reasoning %s when its own capability is enabled", async (reasoning, config) => {
    const res = await runCli([{ task_id: "task", prompt: "draw" }], [`--reasoning=${reasoning}`], config);
    expect(res.exitCode).toBe(0);
    expect(res.turns[0].reasoning).toBe(reasoning);
    expect(res.results[0].reasoning).toBe(reasoning);
  });

  test("defaults to low when neither task nor CLI specifies reasoning", async () => {
    const res = await runCli([{ task_id: "default", prompt: "draw" }]);
    expect(res.exitCode).toBe(0);
    expect(res.turns[0].reasoning).toBe("low");
    expect(res.results[0].reasoning).toBe("low");
  });

  test.each(["invalid", "HIGH", "", "high=extra", null, 1, false, ["high"], { level: "high" }].map(value => [value]))(
    "rejects invalid task reasoning %j before creating the worker", async reasoning => {
      const res = await runCli([{ task_id: "bad", prompt: "draw", reasoning }], ["--reasoning=medium"]);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("Validation failed:");
      expect(res.stderr).toContain("Invalid reasoning for task bad:");
      expect(res.workerCreated).toBe(false);
      expect(res.results).toBeUndefined();
    },
  );

  test.each(["invalid", "HIGH", "", "high=extra"])("rejects invalid CLI reasoning %j even when tasks override it", async reasoning => {
    const res = await runCli([{ task_id: "task", prompt: "draw", reasoning: "low" }], [`--reasoning=${reasoning}`]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Validation failed:");
    expect(res.stderr).toContain("Invalid --reasoning:");
    expect(res.workerCreated).toBe(false);
  });

  test.each([
    ["xhigh", { extraHighAvailable: false, proAvailable: true }],
    ["max", { extraHighAvailable: true, proAvailable: false }],
    ["high", { solAvailable: false }],
  ] as const)("rejects unsupported task reasoning %s before startup", async (reasoning, config) => {
    const res = await runCli([{ task_id: "task", prompt: "draw", reasoning }], [], config);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Validation failed:");
    expect(res.stderr).toContain(`Unsupported reasoning for task task: ${reasoning}`);
    expect(res.workerCreated).toBe(false);
  });

  test.each(["xhigh", "max"])("rejects unsupported CLI reasoning %s before startup", async reasoning => {
    const res = await runCli([{ task_id: "task", prompt: "draw" }], [`--reasoning=${reasoning}`]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Validation failed:");
    expect(res.stderr).toContain(`Unsupported --reasoning: ${reasoning}`);
    expect(res.workerCreated).toBe(false);
  });

  test("collects reasoning errors with existing validation errors", async () => {
    const res = await runCli([
      { task_id: "duplicate", prompt: "draw", reasoning: "invalid", mode: "invalid" },
      { task_id: "duplicate", prompt: "draw", reasoning: "xhigh" },
    ], ["--reasoning=invalid"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Invalid --reasoning:");
    expect(res.stderr).toContain("Invalid reasoning for task duplicate:");
    expect(res.stderr).toContain("Unsupported reasoning for task duplicate: xhigh");
    expect(res.stderr).toContain("Invalid mode for task duplicate:");
    expect(res.stderr).toContain("Duplicate task_id: duplicate");
    expect(res.workerCreated).toBe(false);
  });

  test("includes reasoning in failed and dependency-cancelled results", async () => {
    const res = await runCli([
      { task_id: "fail", prompt: "draw", reasoning: "medium" },
      { task_id: "skip", prompt: "draw", depends_on: ["fail"], reasoning: "high" },
      { task_id: "cascade", prompt: "draw", depends_on: ["skip"] },
    ]);
    expect(res.exitCode).toBe(1);
    expect(res.turns).toHaveLength(1);
    expect(res.results).toEqual([
      expect.objectContaining({ task_id: "fail", success: false, reasoning: "medium", error: "test browser failure" }),
      expect.objectContaining({ task_id: "skip", success: false, reasoning: "high", error: "dependency failed: fail" }),
      expect.objectContaining({ task_id: "cascade", success: false, reasoning: "low", error: "dependency failed: skip" }),
    ]);
  });
});
