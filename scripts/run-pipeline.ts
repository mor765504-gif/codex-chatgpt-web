#!/usr/bin/env bun
import { KeyframePipelineRunner, type PipelineJobSpec } from "../src/adapters/chatgpt-web/pipeline-runner";
import { loadConfig, providerConfig } from "../src/config";
import { resolve, dirname, extname } from "node:path";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  const jsonPath = args[0] ?? resolve("/Users/run176504/.gemini/antigravity/scratch/asli_pro_browser_pack/jobs/shot16/F0036.json");
  const limitArg = args.find(a => a.startsWith("--limit="))?.split("=")[1];
  const delayArg = args.find(a => a.startsWith("--delay="))?.split("=")[1];
  const resultsArg = args.find(a => a.startsWith("--results="))?.split("=")[1];
  const reasoningArg = args.find(a => a.startsWith("--reasoning="))?.slice("--reasoning=".length);

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

  const jobs: PipelineJobSpec[] = rawJobs.map((j, idx) => {
    const job = {
      task_id: j.task_id ?? `task_${idx + 1}`,
      prompt: j.prompt,
      // Only omission uses the default; explicit null/empty values must fail validation.
      reasoning: j.reasoning !== undefined ? j.reasoning : reasoningArg ?? "low",
      output_dir: j.output_dir ? resolve(process.cwd(), j.output_dir) : undefined,
      title: j.title,
      mode: j.mode === "edit" ? "edit" : "new",
      reference_images: j.reference_images?.map((p: string) => resolve(dirname(jsonPath), p)),
      edit_source: j.edit_source ? resolve(dirname(jsonPath), j.edit_source) : undefined,
      edit_from_task: j.edit_from_task,
      depends_on: j.depends_on ? [...j.depends_on] : [],
    } satisfies PipelineJobSpec;
    if (job.edit_from_task && !job.depends_on.includes(job.edit_from_task)) {
      job.depends_on.push(job.edit_from_task);
    }
    return job;
  });

  // Validation
  const taskIds = new Set<string>();
  const errors: string[] = [];
  const reasoningLevels = ["low", "medium", "high", "xhigh", "max"];
  let supportedReasoning: string[] = [];
  try {
    const provider = providerConfig(loadConfig());
    supportedReasoning = provider.defaultModel
      ? provider.modelReasoningEfforts?.[provider.defaultModel] ?? []
      : [];
  } catch (err) {
    errors.push(`Cannot validate reasoning configuration: ${err instanceof Error ? err.message : String(err)}`);
  }

  const validateReasoning = (value: unknown, label: string) => {
    if (typeof value !== "string" || !reasoningLevels.includes(value)) {
      errors.push(`Invalid ${label}: ${JSON.stringify(value)} (expected ${reasoningLevels.join(", ")})`);
    } else if (!supportedReasoning.includes(value)) {
      errors.push(`Unsupported ${label}: ${value} (configured levels: ${supportedReasoning.join(", ") || "none"})`);
    }
  };

  if (reasoningArg !== undefined) {
    validateReasoning(reasoningArg, "--reasoning");
  }
  
  for (const job of jobs) {
    validateReasoning(job.reasoning, `reasoning for task ${job.task_id}`);
    if (taskIds.has(job.task_id)) {
      errors.push(`Duplicate task_id: ${job.task_id}`);
    }
    taskIds.add(job.task_id);

    const jMode = rawJobs.find(r => r.task_id === job.task_id)?.mode;
    if (jMode && jMode !== "new" && jMode !== "edit") {
      errors.push(`Invalid mode for task ${job.task_id}: ${jMode}`);
    }

    if (job.mode === "edit") {
      if (job.edit_source && job.edit_from_task) {
        errors.push(`Task ${job.task_id} has both edit_source and edit_from_task`);
      }
      if (!job.edit_source && !job.edit_from_task) {
        errors.push(`Task ${job.task_id} is in edit mode but has neither edit_source nor edit_from_task`);
      }
    }

    const checkImage = (p: string) => {
      if (!existsSync(p)) {
        errors.push(`File not found: ${p}`);
      }
      const ext = extname(p).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        errors.push(`Invalid image extension: ${p}`);
      }
    };

    if (job.reference_images) {
      job.reference_images.forEach(checkImage);
    }
    if (job.edit_source) {
      checkImage(job.edit_source);
    }

    const totalAttachments = (job.reference_images?.length ?? 0) + (job.edit_source || job.edit_from_task ? 1 : 0);
    if (totalAttachments > 10) {
      errors.push(`Task ${job.task_id} exceeds 10 attachments limit`);
    }
  }

  for (const job of jobs) {
    if (job.depends_on) {
      for (const dep of job.depends_on) {
        if (!taskIds.has(dep)) {
          errors.push(`Unknown dependency: ${dep} in task ${job.task_id}`);
        }
      }
    }
  }

  const visit = (taskId: string, path: string[]) => {
    if (path.includes(taskId)) {
      errors.push(`Circular dependency: ${path.join(" -> ")} -> ${taskId}`);
      return;
    }
    const job = jobs.find(j => j.task_id === taskId);
    if (job?.depends_on) {
      for (const dep of job.depends_on) {
        visit(dep, [...path, taskId]);
      }
    }
  };
  for (const job of jobs) {
    visit(job.task_id, []);
  }

  if (errors.length > 0) {
    console.error("Validation failed:");
    Array.from(new Set(errors)).forEach(e => console.error("- " + e));
    process.exit(1);
  }

  const runner = new KeyframePipelineRunner({
    concurrencyLimit: limitArg ? parseInt(limitArg, 10) : 5,
    staggerDelayMs: delayArg ? parseInt(delayArg, 10) : 12_000,
    defaultOutputDir: resolve("/Users/run176504/.gemini/antigravity/scratch/asli_pro_browser_pack/generated/shot16"),
  });

  const res = await runner.runBatch(jobs);
  
  if (resultsArg) {
    const resultsPayload = res.results.map(r => ({
      task_id: r.taskId,
      success: r.success,
      reasoning: r.reasoning,
      error: r.error,
      outputImages: r.outputImages,
      depends_on: r.depends_on,
      mode: r.mode,
    }));
    writeFileSync(resolve(process.cwd(), resultsArg), JSON.stringify(resultsPayload, null, 2));
  }

  process.exit(res.failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error("Pipeline failure:", err);
  process.exit(1);
});
