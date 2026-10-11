# AG-G2 监控控制台独立信息布局方案 (`ag-g2-monitor-layout.md`)

- **角色与定位**：AGY Gemini 3.8 Flash 独立信息布局 Worker（非总控，不派发子代理，不执行 Git 操作，不修改系统源码）。
- **执行上下文与会话 ID**：`T0Desktop01a12a2b-4e8b-7041-b16b-f9f3c4c927d2`
- **交付目标**：面向 Gibbs 主线合并的监控界面独立布局设计，零新依赖，Plain HTML/CSS 优先，解决当前看板“只显示供应商粗粒度计数、缺失 Luna/Sol/Web 用途分类、缺少阶段 Owner、旧异常堆叠首屏、不同量纲数值混加”等核心痛点。
- **信息源披露**：本报告遵循输出限制原则，未在本次生成中直接发起网络请求；引用的 3 处主数据源设计原则由执行器（Executor）于 2026-10-11 检索并核实提供。

---

## 1. 引用主数据源与设计指导规范 (Primary Sources)

依据执行器于 2026-10-11 验证并提供的官方主数据源摘要，提取以下设计约束与指导原则：

1. **Grafana Dashboard Best Practices**
   - **链接**：`https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/`
   - **设计证据与映射规则**：明确单个仪表盘的核心监控目标，减少认知负荷（Cognitive Load）；构建严密的层级结构（从全局概览到细分链路）；确保同一视图内使用可比较的度量单位；明确面板职责与归属（Ownership）；避免过度刷新与信息冗余。
   - **在本次布局中的落地**：将首屏顶部保留给实时活跃模型与阶段健康度，严格禁止将 HTTP Requests、Browser Turns 与近 10 分钟 Session 计数混加；旧警报默认折叠收拢。

2. **Dashboards — Carbon Design System v10**
   - **链接**：`https://v10.carbondesignsystem.com/data-visualization/dashboards/`
   - **设计证据与映射规则**：优先展示关键核心数据，限制单一屏内的指标密度；维持统一的色彩语义与度量系统；通过搜索、过滤与逐级下钻（Drilldown）机制提供信息探索能力。
   - **在本次布局中的落地**：将当前 59 条历史异常从首屏完全移入可展开折叠区，仅以“当前活跃阻塞数（Blocking Alerts）”作为关键卡片突出显示；提供按模型系列、阶段与 Owner 筛选的能力。

3. **Data Table — Carbon Design System Guidelines**
   - **链接**：`https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines`
   - **设计证据与映射规则**：数据表格应具备排序、搜索、过滤能力，利用行级展开（Expandable Rows）实现渐进式信息披露（Progressive Disclosure）；通过分页与骨架屏（Skeleton Loading）优化扫描效率；不依赖运行时库，纯 HTML/CSS 即可实现结构契约。
   - **在本次布局中的落地**：Worker 列表采用渐进披露表格，外层显示任务、Owner、新产物时间与下一门禁，展开行展示详细日志/阻塞上下文。

---

## 2. 字段契约与展示规则 (Field Contracts & Filtering Rules)

### 2.1 统计口径与严格量纲隔离原则
- **反混加声明**：严禁将以下三种指标进行任何加总或合并显示，必须分设不同独立列/独立卡片：
  1. `HTTP Requests (Count)`：外部/内部接口 HTTP 调用绝对次数。
  2. `Browser Turns (Turns)`：无头浏览器/网页交互回合数。
  3. `Recent 10m Sessions (Active Sessions)`：近 10 分钟内活跃会话数。
- **未知数据处理（Truthfulness & Unknown Data）**：
  - 若系统探针未提供特定模型的活跃数，展示为 `unknown`，不得伪造为 0 或估算值。
  - 当前系统运行指标严禁虚构“50 active workers”；若当前为 11 个活跃 worker，则真实报告为 11（目标值标注为 `target: 50`，状态为进行中，不混淆已实现状态）。
  - 若总控或某会话状态存在争议（如 Opus 15h 处于挂起/释放争议），标注为 `status: disputed/released? (awaiting check)`，不直接定论。

### 2.2 核心模型分类与用途字典契约
看板不再仅按提供商（Provider）统计，按如下结构拆解：
- **模型族 (Model Family)**：`Luna`、`Sol`、`Gemini (Flash/Pro)`、`Claude (Opus/Sonnet)`、`Codex/GPT`
- **计算力度 (Effort Level)**：`Low`、`Medium`、`High`、`Max`
- **业务用途 (Purpose)**：`Web Image Generation`（Web 生图）、`Design Discussion`（设计讨论）、`Code Drafting`（代码编写）、`Orchestration`（总控协同）、`QC Review`（质检验收）

### 2.3 Worker 状态与推进字段契约
| 字段名称 | 类型 | 说明与枚举 | 缺省/未知表现 |
| :--- | :--- | :--- | :--- |
| `worker_id` | String | 唯一标识（如 `w-worker-01`） | 必须非空 |
| `owner` | String | 负责人/归属 Agent（如 `Gibbs`, `Worker-Layout`） | `unassigned` |
| `task_name` | String | 当前执行的具体操作简述 | `idle` |
| `model_spec` | Object | `{ family, effort, purpose }` | `unknown` |
| `last_artifact_time` | Timestamp | 最近产物落盘或生成时间（ISO 8601 或相对时间） | `none` |
| `next_gate` | String | 下一门禁（如 `Gate 2: Ingest Check`, `Gate 4: Review Pass`） | `awaiting_assign` |
| `status` | Enum | `active`, `waiting_gate`, `blocked`, `idle` | `unknown` |

### 2.4 八阶段泳道定义 (Pipeline Lanes)
项目固定划分为 8 个流水线阶段，每个阶段必须展示阶段 Owner、活跃 Worker 计数及阻塞标识：
1. `prepare`（准备与环境注入）
2. `submit`（任务提交与派发）
3. `generate`（生成与初稿编写）
4. `QC`（质量检查与合规断言）
5. `ingest`（解析与资产入库）
6. `review`（人工/主线审查）
7. `GitHub`（PR/分支同步）
8. `deploy`（上线与归档）

### 2.5 警报与异常处理规则 (Alert Rules)
- **活跃阻塞警报 (Active Blocking Alerts)**：必须在首屏以红色/高对比度 Banner 显式置顶，仅展示当前真正导致流水线停滞的事件（如 Gate 拒绝、资源死锁）。
- **历史异常归档 (Historical Alerts / 59 Past Alerts)**：首屏默认完全折叠（`<details>` 标签），仅显示“历史告警记录 (59 项已归档 - 点击展开)”，避免认知过载。

---

## 3. 首屏 Wireframe 文字表设计 (Two Wireframe Options)

### 3.1 方案 A：分层递进仪表盘 (Hierarchical Stacked Layout)
*特点：遵循 Grafana 标准信息流，自上而下分为“全局健康与模型指标 -> 8 阶段流水线泳道 -> 活跃 Worker 表格 -> 折叠异常区”。*

```text
+-------------------------------------------------------------------------------------------------------+
|  AG-G2 MONITOR CONSOLE  |  Lane: asli-t0-20261011  |  Time: 2026-10-11T17:34:15  |  Refresh: 30s        |
+-------------------------------------------------------------------------------------------------------+
| [!] CRITICAL BLOCKING: 1 Worker halted at [QC Gate: Ingest Check] | Unknown Spec: 2 Workers           |
+-------------------------------------------------------------------------------------------------------+
| SECTION 1: LIVE MODEL STATUS (METRIC ISOLATION ENFORCED)                                              |
| +-------------------------------------+-----------------------------------+-------------------------+ |
| | Model Family / Effort / Purpose     | Active Count (Total: 11 / Tgt 50) | Resource Consumption    | |
| +-------------------------------------+-----------------------------------+-------------------------+ |
| | Luna-Creative (Effort: Med)         | 3 (Purpose: Web Image Gen)        | HTTP Req: 142 reqs      | |
| | Sol-Architect (Effort: High)        | 2 (Purpose: Design Discussion)    | Browser Turns: 18 turns | |
| | Gemini 3.8 Flash (Effort: Med)      | 4 (Purpose: Code/Layout Drafting) | 10m Sessions: 4 sess    | |
| | Claude Opus (Effort: Max)           | 1 (Status: released? / disputed)  | HTTP Req: 12 reqs       | |
| | Codex-Runner (Effort: Low)          | 1 (Purpose: Unit Execution)       | HTTP Req: 88 reqs       | |
| +-------------------------------------+-----------------------------------+-------------------------+ |
+-------------------------------------------------------------------------------------------------------+
| SECTION 2: 8-STAGE PROJECT PIPELINE LANES                                                             |
| +----------+----------+----------+----------+----------+----------+----------+----------+             |
| | 1.PREPARE| 2.SUBMIT | 3.GEN    | 4. QC    | 5.INGEST | 6.REVIEW | 7.GITHUB | 8.DEPLOY |             |
| | Owner:   | Owner:   | Owner:   | Owner:   | Owner:   | Owner:   | Owner:   | Owner:   |             |
| | Infra    | Dispatch | Workers  | QC-Bot   | Ingest-1 | Gibbs    | Git-Sync | Release  |             |
| | Acts: 1  | Acts: 2  | Acts: 5  | Acts: 1! | Acts: 1  | Acts: 1  | Acts: 0  | Acts: 0  |             |
| | [PASS]   | [PASS]   | [PASS]   | [BLOCK!] | [WAIT]   | [PASS]   | [IDLE]   | [IDLE]   |             |
| +----------+----------+----------+----------+----------+----------+----------+----------+             |
+-------------------------------------------------------------------------------------------------------+
| SECTION 3: CURRENT ACTIVE WORKERS (11 ACTIVE / PROGRESSIVE DISCLOSURE)                                |
| Filter: [All Models v] [All Stages v] [All Owners v]                    Search: [___________________] |
| +------------+-----------+-----------------------+--------------------+----------------+------------+ |
| | Worker ID  | Owner     | Task Name             | Last Artifact Time | Next Gate      | Status     | |
| +------------+-----------+-----------------------+--------------------+----------------+------------+ |
| | w-gemini-1 | Worker-01 | Draft Layout MD       | 17:32:10 (2m ago)  | Gate 3: Gibbs  | ACTIVE     | |
| | w-luna-02  | Designer  | Hero Image Gen        | 17:28:44 (5m ago)  | Gate 2: Ingest | ACTIVE     | |
| | w-sol-01   | Arch-Sol  | Pipeline Review Spec  | 17:15:00 (19m ago) | Gate 4: Review | ACTIVE     | |
| | w-opus-00  | Control   | [Disputed / Released] | unknown            | Gate 1: Submit | BLOCKED?   | |
| | ... (7 more rows)                                                                                 | |
| +------------+-----------+-----------------------+--------------------+----------------+------------+ |
+-------------------------------------------------------------------------------------------------------+
| [>] HISTORICAL ALERTS & SYSTEM LOGS (59 archived records - Click to Expand)                           |
+-------------------------------------------------------------------------------------------------------+
```

---

### 3.2 方案 B：双栏泳道聚焦布局 (Split Column & Matrix Layout)
*特点：遵循 Carbon Design System 侧重数据探索的范式，左栏专注模型与 Worker 矩阵，右栏纵向展开 8 阶段完整状态。*

```text
+-------------------------------------------------------------------------------------------------------+
|  AG-G2 MONITOR CONSOLE (MATRIX VIEW) | Active: 11 | Target: 50 | Blocking: 1 | Disputed: 1           |
+-------------------------------------------------------------------------------------------------------+
| LEFT PANE: WORKERS & MODEL DISSECTION (65%)      | RIGHT PANE: 8-STAGE VERTICAL PIPELINE (35%)        |
|                                                  |                                                    |
| [LIVE MODEL DISTRIBUTION]                        | [PIPELINE STAGES & GATES]                          |
| - Luna / Med: 3 active (Web Image Gen)           | [*] 1. PREPARE [OK] (Owner: Infra | 1 worker)      |
|   `-- HTTP: 142 reqs                             | [*] 2. SUBMIT  [OK] (Owner: Dispatch | 2 workers)  |
| - Sol / High: 2 active (Design Discussion)       | [*] 3. GENERATE[OK] (Owner: Workers | 5 workers)   |
|   `-- Browser Turns: 18 turns                    | [!] 4. QC      [BLOCKED] (Owner: QC-Bot | 1 wkr)   |
| - Gemini / Med: 4 active (Drafting)              |     `-- Gate: Ingest Check Failed (Artifact Null)  |
|   `-- 10m Sessions: 4 sessions                   | [ ] 5. INGEST  [PAUSED] (Owner: Ingest-1)          |
| - Claude Opus / Max: 1 active (Disputed)         | [ ] 6. REVIEW  [READY]  (Owner: Gibbs)             |
| - Codex / Low: 1 active (Unit Runner)            | [ ] 7. GITHUB  [IDLE]   (Owner: Git-Sync)          |
|                                                  | [ ] 8. DEPLOY  [IDLE]   (Owner: Release)           |
| [ACTIVE WORKER DETAILED ROSTER]                  |                                                    |
| Search: [_________] Filter: [Active Only v]      | -------------------------------------------------- |
| +-----------+----------+-----------------------+ | [BLOCKING DIAGNOSTICS]                             |
| | Worker    | Owner    | Task / Gate           | | Event: QC Gate Timeout                             |
| +-----------+----------+-----------------------+ | Culprit: w-qc-01 (Missing schema hash)             |
| | w-gemini1 | Layout   | ag-g2-layout -> Gibbs | | Suggested Action: Re-trigger QC ingest validator |
| | w-luna02  | Designer | Gen UI Asset -> Gate2 | |                                                    |
| | w-sol01   | Arch     | Layout Spec  -> Gate4 | -------------------------------------------------- |
| | ... (8 more rows)                            | | [>] HISTORICAL ALERTS (59 items collapsed)       |
+--------------------------------------------------+----------------------------------------------------+
```

---

## 4. 方案推荐与理由 (Recommendation & Justification)

**推荐采纳：方案 A（分层递进仪表盘 - Hierarchical Stacked Layout）**

### 核心推荐理由：
1. **符合 Grafana 与 Carbon 认知层级（Cognitive Load Reduction）**：
   - 方案 A 严格按照“全局概况与告警 -> 流水线阶段全貌 -> 微观 Worker 执行实体”的自上而下视觉流线构建，操作者在 3 秒内即可研判流水线是否受阻。
2. **水平 8 阶段泳道直观反映工序前后依赖**：
   - 项目的 8 个阶段（prepare -> submit -> generate -> QC -> ingest -> review -> GitHub -> deploy）具有严格的时间与数据先后依赖。水平泳道能够极具辨识度地展示卡点所在（例如第 4 阶段 QC 阻塞时，后续 5-8 阶段的等待状态一目了然）。
3. **彻底根治历史异常刷屏问题**：
   - 现存的 59 条历史异常被完全收纳在底部的 HTML 原生 `<details>` 区域，首屏仅保留“当前阻塞提示”，既保留了历史可追溯性，又恢复了首屏的整洁度与实时性。
4. **度量指标零歧义（Metric Isolation）**：
   - 方案 A 将 HTTP Requests、Browser Turns、10m Sessions 独立成表，杜绝了不同量纲随意累加的逻辑错误。同时忠实呈现真实状态（11 活跃 / 50 目标），符合客观性要求。

---

## 5. 零依赖 Plain HTML/CSS 参考实现代码 (Gibbs Mainline Ready)

以下代码为纯 HTML/CSS 结构契约，可直接嵌入任意轻量 Web 服务或保存为独立监控文件，无任何第三方库依赖：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>AG-G2 监控控制台</title>
<style>
  :root {
    --bg-color: #0f172a;
    --panel-bg: #1e293b;
    --border-color: #334155;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --accent-red: #ef4444;
    --accent-green: #22c55e;
    --accent-blue: #38bdf8;
    --accent-yellow: #f59e0b;
  }
  body {
    margin: 0; padding: 16px;
    background-color: var(--bg-color); color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    font-size: 13px; line-height: 1.4;
  }
  .header { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; }
  .badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; }
  .badge-danger { background: var(--accent-red); color: #fff; }
  .badge-warning { background: var(--accent-yellow); color: #000; }
  .badge-success { background: var(--accent-green); color: #000; }
  .badge-info { background: var(--accent-blue); color: #000; }

  .alert-banner { background: #450a0a; border: 1px solid var(--accent-red); padding: 8px 12px; margin-bottom: 12px; border-radius: 4px; }

  .panel { background: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 4px; padding: 12px; margin-bottom: 12px; }
  .panel-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; color: var(--text-secondary); text-transform: uppercase; }

  /* Pipeline Lanes */
  .pipeline-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
  .lane-card { background: #0f172a; border: 1px solid var(--border-color); padding: 8px; border-radius: 4px; text-align: center; }
  .lane-card.blocked { border-color: var(--accent-red); background: #2a1215; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--border-color); }
  th { color: var(--text-secondary); font-weight: 600; }

  /* Details Collapsible */
  details summary { cursor: pointer; color: var(--text-secondary); font-weight: bold; }
  details[open] summary { margin-bottom: 8px; }
</style>
</head>
<body>

  <div class="header">
    <div><strong>AG-G2 MONITOR CONSOLE</strong> | Lane: <code>asli-t0-20261011</code></div>
    <div>时间: 2026-10-11T17:34:15 | 刷新周期: 30s | 状态: <strong>运行中</strong></div>
  </div>

  <!-- 活跃阻塞告警 -->
  <div class="alert-banner">
    <span class="badge badge-danger">当前阻塞</span>
    <strong>QC 门禁挂起：</strong> 1 个 Worker 停滞于 <code>QC Gate: Ingest Check</code>。另有 1 个 Opus 会话状态存疑 (<code>disputed/released?</code>)。
  </div>

  <!-- 实时模型与指标隔离面板 -->
  <div class="panel">
    <div class="panel-title">实时活跃模型、算力与业务用途 (度量单位隔离)</div>
    <table>
      <thead>
        <tr>
          <th>模型族 (Family)</th>
          <th>计算力度 (Effort)</th>
          <th>业务用途 (Purpose)</th>
          <th>真实活跃数 (目标: 50)</th>
          <th>HTTP 请求数</th>
          <th>浏览器回合数</th>
          <th>近 10m 会话数</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Luna-Creative</td>
          <td>Medium</td>
          <td>Web 生图 (Image Gen)</td>
          <td><span class="badge badge-info">3 active</span></td>
          <td>142 reqs</td>
          <td>-</td>
          <td>1 sess</td>
        </tr>
        <tr>
          <td>Sol-Architect</td>
          <td>High</td>
          <td>设计讨论 (Design Discussion)</td>
          <td><span class="badge badge-info">2 active</span></td>
          <td>-</td>
          <td>18 turns</td>
          <td>2 sess</td>
        </tr>
        <tr>
          <td>Gemini 3.8 Flash</td>
          <td>Medium</td>
          <td>代码编写 (Code/Layout Drafting)</td>
          <td><span class="badge badge-info">4 active</span></td>
          <td>95 reqs</td>
          <td>-</td>
          <td>4 sess</td>
        </tr>
        <tr>
          <td>Claude Opus</td>
          <td>Max</td>
          <td>总控协同 (Orchestration)</td>
          <td><span class="badge badge-warning">1 disputed</span></td>
          <td>12 reqs</td>
          <td>-</td>
          <td>unknown</td>
        </tr>
        <tr>
          <td>Codex-Runner</td>
          <td>Low</td>
          <td>测试执行 (Unit Runner)</td>
          <td><span class="badge badge-info">1 active</span></td>
          <td>88 reqs</td>
          <td>-</td>
          <td>1 sess</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 项目八阶段泳道 -->
  <div class="panel">
    <div class="panel-title">项目八阶段泳道 (Pipeline Stages)</div>
    <div class="pipeline-grid">
      <div class="lane-card">
        <div><strong>1. prepare</strong></div>
        <div style="color: var(--text-secondary)">Owner: Infra</div>
        <div>1 active</div>
        <div style="color: var(--accent-green)">[正常]</div>
      </div>
      <div class="lane-card">
        <div><strong>2. submit</strong></div>
        <div style="color: var(--text-secondary)">Owner: Dispatch</div>
        <div>2 active</div>
        <div style="color: var(--accent-green)">[正常]</div>
      </div>
      <div class="lane-card">
        <div><strong>3. generate</strong></div>
        <div style="color: var(--text-secondary)">Owner: Workers</div>
        <div>5 active</div>
        <div style="color: var(--accent-green)">[正常]</div>
      </div>
      <div class="lane-card blocked">
        <div><strong>4. QC</strong></div>
        <div style="color: var(--text-secondary)">Owner: QC-Bot</div>
        <div>1 active</div>
        <div style="color: var(--accent-red); font-weight: bold;">[阻塞 !]</div>
      </div>
      <div class="lane-card">
        <div><strong>5. ingest</strong></div>
        <div style="color: var(--text-secondary)">Owner: Ingest-1</div>
        <div>1 waiting</div>
        <div style="color: var(--accent-yellow)">[等待中]</div>
      </div>
      <div class="lane-card">
        <div><strong>6. review</strong></div>
        <div style="color: var(--text-secondary)">Owner: Gibbs</div>
        <div>1 active</div>
        <div style="color: var(--accent-green)">[正常]</div>
      </div>
      <div class="lane-card">
        <div><strong>7. GitHub</strong></div>
        <div style="color: var(--text-secondary)">Owner: Git-Sync</div>
        <div>0 active</div>
        <div style="color: var(--text-secondary)">[就绪]</div>
      </div>
      <div class="lane-card">
        <div><strong>8. deploy</strong></div>
        <div style="color: var(--text-secondary)">Owner: Release</div>
        <div>0 active</div>
        <div style="color: var(--text-secondary)">[就绪]</div>
      </div>
    </div>
  </div>

  <!-- 活跃 Workers 列表 -->
  <div class="panel">
    <div class="panel-title">当前活跃 Workers (11 个活跃实例)</div>
    <table>
      <thead>
        <tr>
          <th>Worker ID</th>
          <th>Owner</th>
          <th>任务名称</th>
          <th>模型规格</th>
          <th>新产物生成时间</th>
          <th>下一门禁 (Next Gate)</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>w-gemini-01</code></td>
          <td>Worker-Layout</td>
          <td>编写监控布局方案 (ag-g2-monitor-layout.md)</td>
          <td>Gemini 3.8 Flash / Med / Drafting</td>
          <td>17:32:10 (2m 前)</td>
          <td>Gate 6: Review (Gibbs)</td>
          <td><span class="badge badge-success">ACTIVE</span></td>
        </tr>
        <tr>
          <td><code>w-luna-02</code></td>
          <td>Designer</td>
          <td>生成看板高保真视觉切片</td>
          <td>Luna / Med / Image Gen</td>
          <td>17:28:44 (5m 前)</td>
          <td>Gate 4: QC Check</td>
          <td><span class="badge badge-success">ACTIVE</span></td>
        </tr>
        <tr>
          <td><code>w-sol-01</code></td>
          <td>Arch-Sol</td>
          <td>数据表下钻交互规范确认</td>
          <td>Sol / High / Discussion</td>
          <td>17:15:00 (19m 前)</td>
          <td>Gate 4: QC Check</td>
          <td><span class="badge badge-success">ACTIVE</span></td>
        </tr>
        <tr>
          <td><code>w-qc-01</code></td>
          <td>QC-Bot</td>
          <td>校验资产 Schema 完整性</td>
          <td>Codex / Low / Unit Runner</td>
          <td>17:10:22 (24m 前)</td>
          <td>Gate 5: Ingest</td>
          <td><span class="badge badge-danger">BLOCKED</span></td>
        </tr>
        <tr>
          <td><code>w-opus-00</code></td>
          <td>Control</td>
          <td>总控编排会话</td>
          <td>Claude Opus / Max / Orchestration</td>
          <td>unknown</td>
          <td>Gate 2: Submit</td>
          <td><span class="badge badge-warning">DISPUTED</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 历史异常折叠区 -->
  <div class="panel">
    <details>
      <summary>历史异常与警报归档 (59 条已处理/已释放记录 - 点击展开查看)</summary>
      <div style="margin-top: 8px; color: var(--text-secondary);">
        <table>
          <thead>
            <tr>
              <th>时间戳</th>
              <th>事件源</th>
              <th>异常摘要</th>
              <th>归档状态</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2026-10-11 15:40:12</td>
              <td>Opus Session</td>
              <td>Session released / 15h timeout reached</td>
              <td>RELEASED / ARCHIVED</td>
            </tr>
            <tr>
              <td>2026-10-11 15:22:04</td>
              <td>RateLimiter</td>
              <td>Provider Claude HTTP 429 backoff triggered</td>
              <td>RESOLVED</td>
            </tr>
            <tr>
              <td colspan="4" style="text-align: center; color: var(--text-secondary);">... 其余 57 条历史旧记录已安全归档，不阻碍主界面交互 ...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>

</body>
</html>
```

---

## 6. 交付与合并说明 (Gibbs Mainline Readiness)
1. **单一职责原则**：本方案仅作为信息架构与前端排版标准文档交付，未修改业务源码，未改动系统路由配置。
2. **合规性声明**：未引入任何 npm 包、React/Vue 依赖或外部 CDN 链接；所有样式与交互行为均基于 HTML5/CSS3 原生特性。
3. **主线合并路径**：执行器可将上述 Markdown 内容完整持久化为本工作区的 `ag-g2-monitor-layout.md` 文件，供 Gibbs 统一执行合并流程。
