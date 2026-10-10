import { expect, test, describe } from "bun:test";
import { $ } from "bun";
import { resolve } from "node:path";

describe("run-pipeline script", () => {
  test("validates edit mode must have source", async () => {
    const json = JSON.stringify({ jobs: [{ task_id: "t1", prompt: "p", mode: "edit" }] });
    await $`echo '${json}' > tests/fixtures/pipeline-runner/bad_edit.json`;
    const result = await $`bun scripts/run-pipeline.ts tests/fixtures/pipeline-runner/bad_edit.json`.nothrow();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("is in edit mode but has neither");
  });

  test("validates cycle detection", async () => {
    const json = JSON.stringify({
      jobs: [
        { task_id: "t1", prompt: "p", depends_on: ["t2"] },
        { task_id: "t2", prompt: "p", depends_on: ["t1"] }
      ]
    });
    await $`echo '${json}' > tests/fixtures/pipeline-runner/cycle.json`;
    const result = await $`bun scripts/run-pipeline.ts tests/fixtures/pipeline-runner/cycle.json`.nothrow();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Circular dependency");
  });

  test("validates attachments limit", async () => {
    const json = JSON.stringify({
      jobs: [{
        task_id: "t1",
        prompt: "p",
        reference_images: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png", "7.png", "8.png", "9.png", "10.png", "11.png"]
      }]
    });
    await $`echo '${json}' > tests/fixtures/pipeline-runner/limit.json`;
    const result = await $`bun scripts/run-pipeline.ts tests/fixtures/pipeline-runner/limit.json`.nothrow();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("exceeds 10 attachments limit");
  });
});
