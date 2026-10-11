# ASLI 视频工作流与 ChatGPT 网页端图像生成架构

本分支 (`feature/asli-video-workflow`) 基于开源项目 `miuuyy/codex-chatgpt-web` 构建，为 Codex Web GPT 增加了对 ChatGPT 网页端生图能力的桥接支持（`Image Bridge`），并提供了专为分镜关键帧生成设计的**错峰流水线并发调度器**（Staggered Concurrency Pipeline）。

---

## 核心功能与模块

### 1. Image Bridge（图像生成与产物落盘桥接）
- **自动检测与提取**：适配 ChatGPT 真实前端 DOM 结构（`[data-testid="generated-image-gallery"]` 与 `[data-testid="generated-image-preview"]`），实时从 Blob URL 提取图像二进制数据。
- **产物持久化**：支持自动保存为 PNG，生成对应哈希记录文件（`.images.json`），包含图片宽高、文件大小及 SHA-256 签名。
- **免文本完成判定**：针对纯图像生成的回答自动跳过对文本操作栏按钮的等待，就绪即判定成功。
- **会话持久化**：强制使用 `Saved Chats`，避免临时会话（Temporary Chat）无法使用生图工具的问题。

### 2. Staggered Concurrency Pipeline（错峰流水线调度器）
- **单宿主平滑启动**：在 Electron 单进程与 ChatGPT Next.js SPA 渲染环境下，毫秒级瞬时齐发 10 个页面会引发渲染主进程争抢与 `page.goto` 60s 超时。调度器通过配置 `staggerDelayMs`（推荐 10,000~15,000 ms）错峰派发任务。
- **多窗口并行生图**：当前任务提交 Prompt 进入后台等待生成后，立即拉起下一标签页。在单图耗时约 40~50 秒的节奏下，时刻保持 3~5 个标签页处于并行生图状态，兼顾吞吐量与稳定性。

---

## 快速使用

### 运行单张测试图（APT MV 主题海报）
```bash
bun run scripts/run-apt-image.ts
```

### 运行分镜任务包流水线
```bash
# 调度指定 JSON 任务集，限制最大并发 5，错峰间隔 12 秒
bun run scripts/run-pipeline.ts /path/to/jobs.json --limit=5 --delay=12000
```

### 任务字段：`raw_prompt`

`PipelineJobSpec.raw_prompt` 是可选布尔字段。设为 `true` 时，调度器原样发送 `prompt`（保留空格和换行），不添加任何自动前置说明，适用于需要按场景参考图还原房间或背景的任务。省略或设为 `false` 时，保持既有行为：edit 任务添加首图编辑及身份参考说明，带参考图的 new 任务添加身份参考说明。该字段不改变附件顺序：`edit_source`（或 `edit_from_task` 的首张产物）在前，`reference_images` 按数组顺序在后。

### 单元测试
```bash
bun test tests/chatgpt-web-image-output.test.ts
```

---

## 产物示例（ASLI 分镜）
- 生成图像均位于 `asli_pro_browser_pack/generated/` 目录。
- 详细实验分析报告请参见根目录下测试报告。
