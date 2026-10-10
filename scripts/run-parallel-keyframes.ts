import { loadConfig, providerConfig } from "../src/config";
import { ChatGptBrowserWorker, type BrowserTurn } from "../src/adapters/chatgpt-web/browser-worker";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

interface JobSpec {
  task_id: string;
  mode: string;
  prompt: string;
  output_dir: string;
  title?: string;
  timeout_seconds?: number;
}

const SHOT16_FILES = [
  "F0036.json",
  "F0108.json",
  "F0180.json",
  "F0252.json",
  "F0324.json",
  "F0396.json",
  "F0456.json",
  "F0528.json",
  "F0648.json",
  "F0756.json",
];

async function runTask(
  worker: ChatGptBrowserWorker,
  job: JobSpec,
  index: number,
  config: any,
): Promise<{ taskId: string; success: boolean; result?: string; error?: string }> {
  const outputDir = resolve("/Users/run176504/.gemini/antigravity/scratch/asli_pro_browser_pack", job.output_dir);
  const traceId = `${job.task_id.replace(/-/g, "_")}_${Date.now()}`;

  console.log(`\n[Worker #${index + 1}] 🚀 启动任务: ${job.task_id} (Trace: ${traceId})`);

  const turn: BrowserTurn = {
    traceId,
    modelId: "gpt-5.6-sol",
    reasoning: "low",
    capabilities: {
      localToolsEnabled: false,
      solAvailable: config.solAvailable ?? true,
      extraHighAvailable: config.extraHighAvailable ?? true,
      proAvailable: config.proAvailable ?? true,
    },
    imageOutput: {
      outputDir,
      maxImages: 1,
      minWidth: 512,
      minHeight: 512,
    },
    prepare: async () => ({
      text: job.prompt,
      images: [],
      release: () => {},
    }),
    onTextDelta: (_delta: string) => {},
    onSubmitted: () => {
      console.log(`[Worker #${index + 1}] 📨 Prompt 已提交至 ChatGPT, 正在等待图像渲染...`);
    },
    onReasoningSummary: (summary: string) => {
      console.log(`[Worker #${index + 1}] 💭 思考中: ${summary.slice(0, 60)}...`);
    },
    onHeartbeat: () => {
      process.stdout.write(`[#${index + 1}]`);
    },
  };

  try {
    const res = await worker.run(turn);
    console.log(`\n[Worker #${index + 1}]  任务成功完成: ${job.task_id}!`);
    return { taskId: job.task_id, success: true, result: res };
  } catch (err: any) {
    console.error(`\n[Worker #${index + 1}] ❌ 任务失败: ${job.task_id}: ${err.message || String(err)}`);
    return { taskId: job.task_id, success: false, error: err.message || String(err) };
  }
}

async function main() {
  process.env.CODEX_CHATGPT_WEB_BROWSER_HELPER_PROCESS = "1";
  process.env.CODEX_CHATGPT_WEB_MAX_TABS = "10";

  const config = loadConfig();
  config.useSavedChats = true;

  const jobsDir = resolve("/Users/run176504/.gemini/antigravity/scratch/asli_pro_browser_pack/jobs/shot16");
  const jobs: JobSpec[] = SHOT16_FILES.map(file => {
    const p = resolve(jobsDir, file);
    return JSON.parse(readFileSync(p, "utf-8"));
  });

  console.log(`=======================================================`);
  console.log(`🔥 ASLI 10 窗口并发关键帧生图压测实验启动 🔥`);
  console.log(`- 目标任务数: ${jobs.length} 个独立分镜`);
  console.log(`- 模式: Saved Chat (永久保存会话)`);
  console.log(`- 并发租约: 10 个独立 surface / 标签页`);
  console.log(`=======================================================\n`);

  const provider = providerConfig(config);
  const worker = ChatGptBrowserWorker.forProvider(provider);

  const startTime = Date.now();
  const promises = jobs.map((job, idx) => runTask(worker, job, idx, config));

  const results = await Promise.allSettled(promises);
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=======================================================`);
  console.log(`🏁 实验执行完毕，总耗时: ${totalDuration} 秒`);
  let successCount = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value.success) {
      successCount++;
      console.log(`✅ [${i + 1}/${results.length}] ${r.value.taskId}: 成功落盘`);
    } else {
      const err = r.status === "fulfilled" ? r.value.error : r.reason;
      console.log(`❌ [${i + 1}/${results.length}] ${jobs[i].task_id}: 失败 (${err})`);
    }
  }
  console.log(`📊 统计: 成功 ${successCount} / ${jobs.length}, 失败 ${jobs.length - successCount} / ${jobs.length}`);
  console.log(`=======================================================`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
