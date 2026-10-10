import { loadConfig, providerConfig } from "../../config";
import { ChatGptBrowserWorker, type BrowserTurn } from "./browser-worker";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export interface PipelineJobSpec {
  task_id: string;
  mode?: string;
  prompt: string;
  output_dir?: string;
  output_basename?: string;
  title?: string;
  timeout_seconds?: number;
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

  /**
   * 执行单项分镜任务
   */
  async runSingle(job: PipelineJobSpec, index: number): Promise<{
    taskId: string;
    success: boolean;
    result?: string;
    error?: string;
  }> {
    const outDir = job.output_dir ? resolve(job.output_dir) : this.defaultOutputDir;
    const traceId = `${job.task_id.replace(/[^A-Za-z0-9_]/g, "_")}_${Date.now()}`;

    console.log(`[Pipeline #${index + 1}] 🚀 发起任务: ${job.task_id} (Trace: ${traceId})`);

    const turn: BrowserTurn = {
      traceId,
      modelId: "gpt-5.6-sol",
      reasoning: "low",
      capabilities: {
        localToolsEnabled: false,
        solAvailable: this.config.solAvailable ?? true,
        extraHighAvailable: this.config.extraHighAvailable ?? true,
        proAvailable: this.config.proAvailable ?? true,
      },
      imageOutput: {
        outputDir: outDir,
        maxImages: 1,
        minWidth: 512,
        minHeight: 512,
      },
      prepare: async () => ({
        text: job.prompt,
        images: [],
        release: () => {},
      }),
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
      return { taskId: job.task_id, success: true, result };
    } catch (err: any) {
      console.error(`\n[Pipeline #${index + 1}] ❌ 任务失败: ${job.task_id}: ${err.message || String(err)}`);
      return { taskId: job.task_id, success: false, error: err.message || String(err) };
    }
  }

  /**
   * 错峰流水线批量执行
   */
  async runBatch(jobs: PipelineJobSpec[]): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: Array<{ taskId: string; success: boolean; result?: string; error?: string }>;
  }> {
    console.log(`\n=======================================================`);
    console.log(`🎬 ASLI 分镜生成错峰流水线调度器启动`);
    console.log(`- 待处理任务总数: ${jobs.length}`);
    console.log(`- 错峰延迟间隔: ${this.staggerDelayMs} ms`);
    console.log(`- 并发租约上限: ${this.concurrencyLimit}`);
    console.log(`=======================================================\n`);

    const results: Array<{ taskId: string; success: boolean; result?: string; error?: string }> = [];
    const activePromises: Set<Promise<any>> = new Set();

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      // 若活跃任务已达到并发上限，等待最早结束的一个
      if (activePromises.size >= this.concurrencyLimit) {
        await Promise.race(activePromises);
      }

      // 发起当前任务
      const taskPromise = this.runSingle(job, i).then(res => {
        results.push(res);
        activePromises.delete(taskPromise);
        return res;
      });
      activePromises.add(taskPromise);

      // 如果还有后续任务，执行错峰等待（让当前页面完成 SPA 导航与 Prompt 提交）
      if (i < jobs.length - 1) {
        console.log(`[Scheduler] ⏳ 错峰等待 ${this.staggerDelayMs}ms，平滑进入下一标签页...`);
        await new Promise(r => setTimeout(r, this.staggerDelayMs));
      }
    }

    // 等待所有在途任务收敛完成
    await Promise.all(activePromises);

    const succeeded = results.filter(r => r.success).length;
    const failed = results.length - succeeded;

    console.log(`\n=======================================================`);
    console.log(`🏁 错峰流水线全部执行完毕: 成功 ${succeeded} / ${jobs.length}, 失败 ${failed} / ${jobs.length}`);
    console.log(`=======================================================\n`);

    return { total: jobs.length, succeeded, failed, results };
  }
}
