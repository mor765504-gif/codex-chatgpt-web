import { loadConfig, providerConfig } from "../src/config";
import { ChatGptBrowserWorker, type BrowserTurn } from "../src/adapters/chatgpt-web/browser-worker";
import { resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";

async function main() {
  process.env.CODEX_CHATGPT_WEB_BROWSER_HELPER_PROCESS = "1";
  const config = loadConfig();
  config.useSavedChats = true;

  const outputDir = resolve("/Users/run176504/.gemini/antigravity/scratch/asli_pro_browser_pack/generated/apt_mv");
  console.log(`[ImageTask] Output directory: ${outputDir}`);
  console.log(`[ImageTask] useSavedChats: ${config.useSavedChats}`);

  const provider = providerConfig(config);
  const worker = ChatGptBrowserWorker.forProvider(provider);

  const promptText = "请生成一张朴彩英（ROSÉ）与火星哥（Bruno Mars）在歌曲《APT.》MV里的高质量同框复古海报插画：标志性的亮粉色背景，Rosé 金发双马尾编发、身穿黑色皮衣短裙摇滚甜美风，Bruno Mars 戴着复古飞行员墨镜、皮夹克与白色内搭，两人拿着麦克风互动，80 年代流行摇滚画风，构图精美，充满活力。";

  const traceId = `asli_apt_${Date.now()}`;

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
      text: promptText,
      images: [],
      release: () => {},
    }),
    onTextDelta: (delta: string) => {
      process.stdout.write(delta);
    },
    onSubmitted: () => {
      console.log(`\n[ImageTask] Prompt submitted to ChatGPT! Waiting for generation and image render...`);
    },
    onReasoningSummary: (summary: string) => {
      console.log(`\n[ImageTask] Thinking step: ${summary}`);
    },
    onHeartbeat: () => {
      process.stdout.write(".");
    },
  };

  console.log(`[ImageTask] Starting browser turn for task: ${traceId}...`);
  try {
    const result = await worker.run(turn);
    console.log(`\n\n[ImageTask] Turn completed successfully!\nResult summary:\n${result}`);

    const files = readdirSync(outputDir);
    console.log(`[ImageTask] Files in outputDir:`, files);
  } catch (err) {
    console.error(`\n[ImageTask] Turn failed:`, err);
    process.exit(1);
  } finally {
    await worker.close();
  }
}

main().catch(console.error);
