import { loadConfig, providerConfig } from "../../config";
import { ChatGptBrowserWorker, type BrowserTurn } from "./browser-worker";
import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { ChatGptWebPromptImage } from "./prompt";

export interface PipelineJobSpec {
  task_id: string;
  mode?: "new" | "edit";
  prompt: string;
  /** Send prompt verbatim without automatic attachment instructions. */
  raw_prompt?: boolean;
  reasoning?: "low" | "medium" | "high" | "xhigh" | "max";
  output_dir?: string;
  output_basename?: string;
  title?: string;
  timeout_seconds?: number;
  reference_images?: string[];
  edit_source?: string;
  edit_from_task?: string;
  depends_on?: string[];
}

export interface PipelineOptions {
  /** 最大并发窗口数（默认 5，上限 10） */
  concurrencyLimit?: number;
  /** 每个任务发起时的错峰间隔毫秒数（默认 10000ms，避开 SPA 初始化争抢） */
  staggerDelayMs?: number;
  /** 默认输出目录 */
  defaultOutputDir?: string;
}

export class KeyframePipelineRunner {
  private worker: ChatGptBrowserWorker;
  private config: any;
  private concurrencyLimit: number;
  private staggerDelayMs: number;
  private defaultOutputDir: string;
  
  // Shared map to track outputs for dependencies
  private taskOutputs = new Map<string, string[]>();

  constructor(options: PipelineOptions = {}) {
    process.env.CODEX_CHATGPT_WEB_BROWSER_HELPER_PROCESS = "1";
    process.env.CODEX_CHATGPT_WEB_MAX_TABS = String(options.concurrencyLimit ?? 10);

    this.config = loadConfig();
    this.config.useSavedChats = true; // 强制 Saved Chats 保证生图工具可用

    this.concurrencyLimit = Math.min(options.concurrencyLimit ?? 5, 10);
    this.staggerDelayMs = options.staggerDelayMs ?? 10_000;
    this.defaultOutputDir = options.defaultOutputDir ?? resolve(process.cwd(), "generated/pipeline");

    const provider = providerConfig(this.config);
    this.worker = ChatGptBrowserWorker.forProvider(provider);
  }

  private loadAsDataUrl(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      "png": "image/png",
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "webp": "image/webp"
    };
    const mime = mimeMap[ext || "png"] || "image/png";
    const base64 = readFileSync(filePath, "base64");
    return `data:${mime};base64,${base64}`;
  }

  /**
   * 执行单项分镜任务
   */
  async runSingle(job: PipelineJobSpec, index: number): Promise<{
    taskId: string;
    success: boolean;
    reasoning: NonNullable<PipelineJobSpec["reasoning"]>;
    result?: string;
    error?: string;
    outputImages?: string[];
    depends_on?: string[];
    mode?: "new" | "edit";
  }> {
    const outDir = job.output_dir ? resolve(job.output_dir) : this.defaultOutputDir;
    const traceId = `${job.task_id.replace(/[^A-Za-z0-9_]/g, "_")}_${Date.now()}`;
    const reasoning = job.reasoning ?? "low";

    console.log(`[Pipeline #${index + 1}] 🚀 发起任务: ${job.task_id} (Trace: ${traceId}, reasoning: ${reasoning})`);

    const turn: BrowserTurn = {
      traceId,
      modelId: "gpt-5.6-sol",
      reasoning,
      capabilities: {
        localToolsEnabled: false,
        solAvailable: this.config.solAvailable ?? true,
        extraHighAvailable: this.config.extraHighAvailable ?? true,
        proAvailable: this.config.proAvailable ?? true,
      },
      imageOutput: {
        operation: job.mode,
        outputDir: outDir,
        maxImages: 1,
        minWidth: 512,
        minHeight: 512,
      },
      prepare: async () => {
        let finalPrompt = job.prompt;
        const images: ChatGptWebPromptImage[] = [];

        // Attach edit source first
        let editSourcePath = job.edit_source;
        if (job.mode === "edit" && job.edit_from_task) {
          const deps = this.taskOutputs.get(job.edit_from_task);
          if (deps && deps.length > 0) {
            editSourcePath = deps[0];
          } else {
            throw new Error(`dependency failed: ${job.edit_from_task} produced no images`);
          }
        }
        
        if (editSourcePath) {
          images.push({
            ref: "edit_source",
            imageUrl: this.loadAsDataUrl(editSourcePath)
          });
        }

        if (job.reference_images) {
          job.reference_images.forEach((imgPath, i) => {
            images.push({
              ref: `ref_${i}`,
              imageUrl: this.loadAsDataUrl(imgPath)
            });
          });
        }

        if (job.raw_prompt !== true) {
          if (job.mode === "edit") {
            finalPrompt = `the FIRST attached image is the previous keyframe to edit; keep identity, wardrobe, camera, lighting and layout consistent except for the described changes; other attached images are identity references only, never copy their backgrounds.\n\n${job.prompt}`;
          } else if (job.reference_images && job.reference_images.length > 0) {
            finalPrompt = `attached images are identity references only.\n\n${job.prompt}`;
          }
        }

        return {
          text: finalPrompt,
          images,
          release: () => {},
        };
      },
      onTextDelta: () => {},
      onSubmitted: () => {
        console.log(`[Pipeline #${index + 1}] 📨 Prompt 已就绪并提交，进入 ChatGPT 生成等待...`);
      },
      onReasoningSummary: (summary: string) => {
        console.log(`[Pipeline #${index + 1}] 💭 思考中: ${summary.slice(0, 50)}...`);
      },
      onHeartbeat: () => {
        process.stdout.write(`[#${index + 1}]`);
      },
    };

    try {
      const result = await this.worker.run(turn);
      console.log(`\n[Pipeline #${index + 1}]  任务成功落地: ${job.task_id}`);
      
      let outputImages: string[] = [];
      const manifestPath = join(outDir, `${traceId}.images.json`);
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (manifest.artifacts && Array.isArray(manifest.artifacts)) {
          outputImages = manifest.artifacts.map((a: any) => a.path);
        }
      }
      this.taskOutputs.set(job.task_id, outputImages);
      
      return { taskId: job.task_id, success: true, reasoning, result, outputImages, depends_on: job.depends_on, mode: job.mode };
    } catch (err: any) {
      console.error(`\n[Pipeline #${index + 1}] ❌ 任务失败: ${job.task_id}: ${err.message || String(err)}`);
      return { taskId: job.task_id, success: false, reasoning, error: err.message || String(err), depends_on: job.depends_on, mode: job.mode };
    }
  }

  /**
   * 错峰流水线批量执行
   */
  async runBatch(jobs: PipelineJobSpec[]): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: Array<{ taskId: string; success: boolean; reasoning: NonNullable<PipelineJobSpec["reasoning"]>; result?: string; error?: string; outputImages?: string[]; depends_on?: string[]; mode?: "new" | "edit" }>;
  }> {
    console.log(`\n=======================================================`);
    console.log(`🎬 ASLI 分镜生成错峰流水线调度器启动`);
    console.log(`- 待处理任务总数: ${jobs.length}`);
    console.log(`- 错峰延迟间隔: ${this.staggerDelayMs} ms`);
    console.log(`- 并发租约上限: ${this.concurrencyLimit}`);
    console.log(`=======================================================\n`);

    const results: Array<{ taskId: string; success: boolean; reasoning: NonNullable<PipelineJobSpec["reasoning"]>; result?: string; error?: string; outputImages?: string[]; depends_on?: string[]; mode?: "new" | "edit" }> = [];
    const taskStatus = new Map<string, { success: boolean, error?: string }>();
    this.taskOutputs.clear();

    const pendingJobs = [...jobs];
    const activePromises = new Set<Promise<void>>();
    let runningCount = 0;
    
    // To simulate original delay on first start, wait before returning? No, stagger.
    
    // Helper to evaluate dependencies
    const hasFailedDeps = (job: PipelineJobSpec) => {
      if (!job.depends_on) return false;
      return job.depends_on.some(dep => taskStatus.has(dep) && !taskStatus.get(dep)!.success);
    };

    const getFailedDep = (job: PipelineJobSpec) => {
      if (!job.depends_on) return undefined;
      return job.depends_on.find(dep => taskStatus.has(dep) && !taskStatus.get(dep)!.success);
    };

    const isReady = (job: PipelineJobSpec) => {
      if (!job.depends_on) return true;
      return job.depends_on.every(dep => taskStatus.has(dep) && taskStatus.get(dep)!.success);
    };

    while (pendingJobs.length > 0 || activePromises.size > 0) {
      let startedAny = false;
      
      // Process pending jobs
      for (let i = 0; i < pendingJobs.length; i++) {
        const job = pendingJobs[i];
        
        if (hasFailedDeps(job)) {
          const failedDep = getFailedDep(job);
          const errorMsg = `dependency failed: ${failedDep}`;
          console.error(`[Scheduler] ❌ 任务 ${job.task_id} 因依赖项失败而取消 (${errorMsg})`);
          taskStatus.set(job.task_id, { success: false, error: errorMsg });
          results.push({ taskId: job.task_id, success: false, reasoning: job.reasoning ?? "low", error: errorMsg, depends_on: job.depends_on, mode: job.mode });
          pendingJobs.splice(i, 1);
          i--;
          continue;
        }

        if (isReady(job) && activePromises.size < this.concurrencyLimit) {
          // Find original index for logging
          const index = jobs.indexOf(job);
          pendingJobs.splice(i, 1);
          i--;
          
          const p = (async () => {
             const res = await this.runSingle(job, index);
             results.push({ ...res, mode: job.mode ?? 'new', depends_on: job.depends_on ?? [] });
             taskStatus.set(job.task_id, { success: res.success, error: res.error });
          })();
          
          activePromises.add(p);
          p.finally(() => activePromises.delete(p));
          startedAny = true;
          
          if (activePromises.size >= this.concurrencyLimit) {
             break; // Stop taking jobs until one finishes
          }
          
          // Original logic staggered launches
          if (pendingJobs.length > 0) {
            console.log(`[Scheduler] ⏳ 错峰等待 ${this.staggerDelayMs}ms，平滑进入下一标签页...`);
            await new Promise(r => setTimeout(r, this.staggerDelayMs));
          }
        }
      }
      
      // If no job was ready or we're at limit, wait for an active promise
      if (!startedAny && activePromises.size > 0) {
        await Promise.race(activePromises);
      } else if (!startedAny && pendingJobs.length > 0) {
        // Deadlock? Should not happen if validation prevented cycles, but break to avoid infinity
        console.error("Scheduler deadlocked (circular dependencies bypass check?).");
        break;
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.length - succeeded;

    console.log(`\n=======================================================`);
    console.log(`🏁 错峰流水线全部执行完毕: 成功 ${succeeded} / ${jobs.length}, 失败 ${failed} / ${jobs.length}`);
    console.log(`=======================================================\n`);

    return { total: jobs.length, succeeded, failed, results };
  }
}
