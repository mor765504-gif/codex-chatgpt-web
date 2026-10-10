import { expect, test, describe } from "bun:test";
import { $ } from "bun";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

describe("run-pipeline CLI", () => {
  const fixDir = join(__dirname, "fixtures/pipeline-runner");
  
  test("fails on duplicate task_id", async () => {
    const jsonPath = join(fixDir, "dup.json");
    writeFileSync(jsonPath, JSON.stringify([
      { task_id: "t1", prompt: "p1" },
      { task_id: "t1", prompt: "p2" }
    ]));
    
    const { stderr, exitCode } = await $`bun run scripts/run-pipeline.ts ${jsonPath}`.nothrow();
    expect(exitCode).toBe(1);
    expect(stderr.toString()).toContain("Duplicate task_id: t1");
  });

  test("fails on invalid mode", async () => {
    const jsonPath = join(fixDir, "bad-mode.json");
    writeFileSync(jsonPath, JSON.stringify([
      { task_id: "t1", prompt: "p1", mode: "invalid" }
    ]));
    
    const { stderr, exitCode } = await $`bun run scripts/run-pipeline.ts ${jsonPath}`.nothrow();
    expect(exitCode).toBe(1);
    expect(stderr.toString()).toContain("Invalid mode for task t1: invalid");
  });

  test("fails on missing files or bad extensions", async () => {
    const jsonPath = join(fixDir, "bad-files.json");
    writeFileSync(jsonPath, JSON.stringify([
      { task_id: "t1", prompt: "p1", reference_images: ["missing.png", "bad.txt"] }
    ]));
    
    const { stderr, exitCode } = await $`bun run scripts/run-pipeline.ts ${jsonPath}`.nothrow();
    expect(exitCode).toBe(1);
    expect(stderr.toString()).toContain("File not found");
    expect(stderr.toString()).toContain("Invalid image extension");
  });

  test("fails on >10 attachments", async () => {
    const jsonPath = join(fixDir, "too-many.json");
    writeFileSync(jsonPath, JSON.stringify([
      { 
        task_id: "t1", 
        prompt: "p1", 
        reference_images: Array(11).fill("img.png")
      }
    ]));
    
    const { stderr, exitCode } = await $`bun run scripts/run-pipeline.ts ${jsonPath}`.nothrow();
    expect(exitCode).toBe(1);
    expect(stderr.toString()).toContain("exceeds 10 attachments limit");
  });

  test("fails on unknown or circular dependency", async () => {
    const jsonPath = join(fixDir, "deps.json");
    writeFileSync(jsonPath, JSON.stringify([
      { task_id: "t1", prompt: "p1", depends_on: ["t3"] },
      { task_id: "t2", prompt: "p2", depends_on: ["t2"] }
    ]));
    
    const { stderr, exitCode } = await $`bun run scripts/run-pipeline.ts ${jsonPath}`.nothrow();
    expect(exitCode).toBe(1);
    expect(stderr.toString()).toContain("Unknown dependency: t3");
    expect(stderr.toString()).toContain("Circular dependency: t2 -> t2");
  });

  test("fails on invalid edit mode configuration", async () => {
    const jsonPath = join(fixDir, "bad-edit.json");
    writeFileSync(jsonPath, JSON.stringify([
      { task_id: "t1", prompt: "p1", mode: "edit", edit_source: "img.png", edit_from_task: "t0" },
      { task_id: "t2", prompt: "p2", mode: "edit" }
    ]));
    
    const { stderr, exitCode } = await $`bun run scripts/run-pipeline.ts ${jsonPath}`.nothrow();
    expect(exitCode).toBe(1);
    expect(stderr.toString()).toContain("both edit_source and edit_from_task");
    expect(stderr.toString()).toContain("neither edit_source nor edit_from_task");
  });
});
