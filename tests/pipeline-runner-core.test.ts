import { expect, test, describe, mock, spyOn } from "bun:test";
import { KeyframePipelineRunner } from "../src/adapters/chatgpt-web/pipeline-runner";
import { resolve, join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

describe("KeyframePipelineRunner", () => {
  const outDir = join(__dirname, "fixtures/pipeline-runner/out");

  test("runSingle defaults omitted reasoning to low", async () => {
    const runner = new KeyframePipelineRunner({ defaultOutputDir: outDir });
    let reasoning: string | undefined;
    runner["worker"] = {
      run: async (turn: any) => {
        reasoning = turn.reasoning;
        return "success";
      },
    } as any;

    const result = await runner.runSingle({ task_id: "default", prompt: "draw" }, 0);
    expect(result.success).toBe(true);
    expect(reasoning).toBe("low");
    expect(result.reasoning).toBe("low");
  });

  test("runs tasks respecting dependencies and staggering", async () => {
    mkdirSync(outDir, { recursive: true });

    const runner = new KeyframePipelineRunner({
      concurrencyLimit: 2,
      staggerDelayMs: 10,
      defaultOutputDir: outDir,
    });

    // Mock worker run
    const calls: any[] = [];
    runner["worker"] = {
      run: async (turn: any) => {
        calls.push(turn);
        // Write mock sidecar
        const manifestPath = join(outDir, `${turn.traceId}.images.json`);
        writeFileSync(manifestPath, JSON.stringify({
          artifacts: [{ path: `/mock/${turn.traceId}.png` }]
        }));
        
        // Mock execution time
        await new Promise(r => setTimeout(r, 50));
        return "success";
      }
    } as any;
    
    // Mock loadAsDataUrl to prevent real fs reads
    runner["loadAsDataUrl"] = () => "data:image/png;base64,mock";

    const jobs = [
      {
        task_id: "t1",
        prompt: "task 1",
        mode: "new" as const,
      },
      {
        task_id: "t2",
        prompt: "task 2",
        mode: "edit" as const,
        edit_from_task: "t1",
        depends_on: ["t1"],
      }
    ];

    const res = await runner.runBatch(jobs);
    
    expect(res.succeeded).toBe(2);
    expect(res.failed).toBe(0);
    expect(calls.length).toBe(2);
    
    // Ensure t2 depends on t1 output
    expect(res.results.find(r => r.taskId === "t1")?.outputImages?.length).toBe(1);
    
    const preparedT1 = await calls[0].prepare();
    expect(preparedT1.text).toBe("task 1");
    
    const preparedT2 = await calls[1].prepare();
    expect(preparedT2.images[0].ref).toBe("edit_source");
    expect(preparedT2.text).toContain("the FIRST attached image is the previous keyframe to edit");
    
    rmSync(outDir, { recursive: true, force: true });
  });

  test("cascades dependency failures", async () => {
    const runner = new KeyframePipelineRunner({
      concurrencyLimit: 2,
      staggerDelayMs: 10,
    });

    let count = 0;
    runner["worker"] = {
      run: async (turn: any) => {
        if (turn.traceId.startsWith("t1_")) {
          throw new Error("Worker failed");
        }
        return "success";
      }
    } as any;

    const jobs = [
      { task_id: "t1", prompt: "fail" },
      { task_id: "t2", prompt: "skip", depends_on: ["t1"] },
      { task_id: "t3", prompt: "skip_cascade", depends_on: ["t2"] }
    ];

    const res = await runner.runBatch(jobs);
    expect(res.failed).toBe(3);
    
    const t2Res = res.results.find(r => r.taskId === "t2");
    expect(t2Res?.error).toContain("dependency failed: t1");
    
    const t3Res = res.results.find(r => r.taskId === "t3");
    expect(t3Res?.error).toContain("dependency failed: t2");
  });
});
