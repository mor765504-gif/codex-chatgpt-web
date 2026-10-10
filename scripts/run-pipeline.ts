#!/usr/bin/env bun
import { KeyframePipelineRunner, type PipelineJobSpec } from "../src/adapters/chatgpt-web/pipeline-runner";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  const jsonPath = args[0] ?? resolve("/Users/run176504/.gemini/antigravity/scratch/asli_pro_browser_pack/jobs/shot16/F0036.json");
  const limitArg = args.find(a => a.startsWith("--limit="))?.split("=")[1];
  const delayArg = args.find(a => a.startsWith("--delay="))?.split("=")[1];

  let rawJobs: any[] = [];
  if (existsSync(jsonPath)) {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
    if (Array.isArray(parsed)) {
      rawJobs = parsed;
    } else if (Array.isArray(parsed.jobs)) {
      rawJobs = parsed.jobs;
    } else {
      rawJobs = [parsed];
    }
  } else {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  const jobs: PipelineJobSpec[] = rawJobs.map((j, idx) => ({
    task_id: j.task_id ?? `task_${idx + 1}`,
    prompt: j.prompt,
    output_dir: j.output_dir ? resolve(process.cwd(), j.output_dir) : undefined,
    title: j.title,
    mode: j.mode,
  }));

  const runner = new KeyframePipelineRunner({
    concurrencyLimit: limitArg ? parseInt(limitArg, 10) : 5,
    staggerDelayMs: delayArg ? parseInt(delayArg, 10) : 12_000,
    defaultOutputDir: resolve("/Users/run176504/.gemini/antigravity/scratch/asli_pro_browser_pack/generated/shot16"),
  });

  const res = await runner.runBatch(jobs);
  process.exit(res.failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error("Pipeline failure:", err);
  process.exit(1);
});
