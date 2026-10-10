import { expect, test, describe, mock, beforeEach, afterEach } from "bun:test";
import { KeyframePipelineRunner, type PipelineJobSpec } from "../src/adapters/chatgpt-web/pipeline-runner";
import { resolve, join, dirname } from "node:path";
import * as fs from "node:fs";

let mockRun = mock(() => Promise.resolve("mocked_result"));

mock.module("../src/adapters/chatgpt-web/browser-worker", () => {
  return {
    ChatGptBrowserWorker: {
      forProvider: () => ({
        run: mockRun,
        close: () => Promise.resolve()
      })
    }
  };
});

mock.module("node:fs", () => {
  const originalFs = require("node:fs");
  return {
    ...originalFs,
    existsSync: (path: string) => {
      if (path.includes("not_found")) return false;
      if (path.includes("F0036.json")) return true;
      if (path.includes(".images.json")) return true;
      if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".webp") || path.endsWith(".jpeg")) return true;
      return originalFs.existsSync(path);
    },
    readFileSync: (path: string, options: any) => {
      if (path.includes("F0036.json")) {
        return JSON.stringify({
          jobs: [
            { task_id: "t1", prompt: "t1 prompt" },
            { task_id: "t2", prompt: "t2 prompt", depends_on: ["t1"] }
          ]
        });
      }
      if (path.includes(".images.json")) {
        return JSON.stringify({ artifacts: [{ path: path.replace(".images.json", "-01.png") }] });
      }
      if (options === "base64") {
        return "mocked_base64";
      }
      return originalFs.readFileSync(path, options);
    },
  };
});

describe("KeyframePipelineRunner", () => {
  beforeEach(() => {
    mockRun.mockClear();
    // make stagger delay 0 for fast tests
  });

  test("runs tasks with dependencies in correct order", async () => {
    const runner = new KeyframePipelineRunner({ staggerDelayMs: 0 });
    const jobs: PipelineJobSpec[] = [
      { task_id: "t1", prompt: "p1" },
      { task_id: "t2", prompt: "p2", depends_on: ["t1"] }
    ];
    let runOrder: string[] = [];
    mockRun.mockImplementation(async (turn: any) => {
      const task = turn.traceId.split("_")[0];
      runOrder.push(task);
      return "res";
    });

    const res = await runner.runBatch(jobs);
    expect(res.succeeded).toBe(2);
    expect(runOrder).toEqual(["t1", "t2"]);
  });

  test("mode edit prepends instructions and requires edit_source or edit_from_task", async () => {
    const runner = new KeyframePipelineRunner({ staggerDelayMs: 0 });
    
    // Valid edit
    const jobs: PipelineJobSpec[] = [
      { task_id: "e1", prompt: "e1", mode: "edit", edit_source: "/fake.png" }
    ];
    
    let turnPassed: any;
    mockRun.mockImplementation(async (turn: any) => {
      turnPassed = turn;
      return "res";
    });

    await runner.runBatch(jobs);
    const prepared = await turnPassed.prepare();
    expect(prepared.text).toContain("the FIRST attached image is the previous keyframe to edit");
    expect(prepared.images.length).toBe(1);
    expect(prepared.images[0].ref).toBe("edit_source");
  });

  test("dependency failure cascades to downstream", async () => {
    const runner = new KeyframePipelineRunner({ staggerDelayMs: 0 });
    const jobs: PipelineJobSpec[] = [
      { task_id: "t1", prompt: "p1" },
      { task_id: "t2", prompt: "p2", depends_on: ["t1"] },
      { task_id: "t3", prompt: "p3", depends_on: ["t2"] }
    ];
    
    mockRun.mockImplementation(async (turn: any) => {
      if (turn.traceId.startsWith("t1")) throw new Error("mocked fail");
      return "res";
    });

    const res = await runner.runBatch(jobs);
    expect(res.succeeded).toBe(0);
    expect(res.failed).toBe(3);
    const t2Res = res.results.find(r => r.taskId === "t2");
    expect(t2Res?.error).toContain("dependency failed: t1");
    const t3Res = res.results.find(r => r.taskId === "t3");
    expect(t3Res?.error).toContain("dependency failed: t2");
  });

  test("edit_from_task takes output from upstream", async () => {
    const runner = new KeyframePipelineRunner({ staggerDelayMs: 0 });
    const jobs: PipelineJobSpec[] = [
      { task_id: "src", prompt: "p1", output_dir: "/out" },
      { task_id: "t2", prompt: "p2", mode: "edit", edit_from_task: "src" }
    ];
    
    let t2Prepared: any;
    mockRun.mockImplementation(async (turn: any) => {
      if (turn.traceId.startsWith("t2")) {
        t2Prepared = await turn.prepare();
      }
      return "res";
    });

    const res = await runner.runBatch(jobs);
    expect(res.succeeded).toBe(2);
    expect(t2Prepared.images.length).toBe(1);
    // The data url should be present
    expect(t2Prepared.images[0].imageUrl).toBe("data:image/png;base64,mocked_base64");
  });
});
