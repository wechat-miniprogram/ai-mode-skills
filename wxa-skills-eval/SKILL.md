---
name: wxa-skills-eval
description: 微信小程序 AI Skill 端到端评测引擎；当需要评测一个或多个 wxapp Skill 的意图理解、轨迹生成与最终答案质量时加载本 Skill。
metadata:
  author: Tencent
  version: '0.1.18'
---

# wxa-skills-eval

> **一句话定位**：基于开发者声明的 Skill，自动构造真实用户任务，模拟用户与小程序 Agent 多轮对话完成任务，并对全过程进行评测与缺陷归因，输出 HTML 报告 + 可机读 JSON。

## 何时加载

满足任一条件即应加载：

- 需要评测、调试、定位 wxapp 中 AI Skill（`app.json::agent.skills`）的端到端质量
- 希望以"模拟真实用户"的方式回归 Skill 行为，提前发现意图理解、参数抽取、调用链路或最终回复中的缺陷

## 运行环境

- 已支持 **macOS** 与 **Windows** 两个平台（自动按平台适配 DevTools CLI 路径与命令行调用）
- **新版开发者工具**（macOS `.pkg` / Windows 安装包）安装后自动注册 `wechatidecli` 环境变量，评测工具会优先探测使用，**无需手动配置路径**
- 旧版开发者工具需通过 `DEVTOOLS_ENV_APP_PATH` 环境变量或 `--devtools-app-path` 参数配置安装路径；详见 [`references/configuration.md`](references/configuration.md)

## 核心能力

- **自动构造用户任务**：基于开发者在 `app.json::agent.skills` 中声明的 Skill，结合小程序页面与原子能力，自动生成贴近真实场景的用户任务用例
- **模拟用户多轮对话**：以模拟用户身份与小程序 Agent 进行多轮交互，期间触发 Skill 完成任务，覆盖意图理解、参数收集、调用执行、结果回复完整链路
- **端到端评测与缺陷归因**：自动判定任务是否被正确完成，并将失败原因归因到具体环节（意图、轨迹、Skill 调用、回复等），帮助开发者快速定位 Skill 设计缺陷
- **结果 + 可视化报告**：同时产出 HTML 报告（人工查看）与 JSON 数据（CI / 自动化集成）
- **续跑友好**：节点产物落盘后再次运行自动跳过；显式 `--from <node>` 可强制从某节点重跑

> 完整执行流程与节点划分见 [`references/pipeline.md`](references/pipeline.md)。

## 快速开始

> **默认即推荐**：本工具默认启动 Web UI 并自动打开浏览器，便于人工查看实时进度、节点产物与报告。除非用户明确说"CI 环境"、"无人值守"、"不要 UI"、"纯命令行"，否则**一律不要**加 `--headless`。

```bash
# 【默认推荐】启动 Web UI 并自动打开浏览器，人工可视化查看进度
node wxa-skills-eval/cli/index.js run \
  -p /absolute/path/to/miniprogram \
  --cases 5

# 【可选】仅启动 Web UI 评测界面（在页面内手动配置参数后发起评测）
node wxa-skills-eval/cli/index.js serve --port 3200

# 【仅 CI 场景使用】headless 模式 — 不启动 Web UI，纯命令行输出
#   仅在以下场景使用：CI/CD 流水线、服务器无桌面环境、用户明确要求不开 UI
#   正常交互场景（包括 AI 助手代跑）请勿加 --headless
node wxa-skills-eval/cli/index.js run --headless \
  -p /absolute/path/to/miniprogram \
  --cases 5

# 续跑 / 断点续跑（默认同样走 UI 模式）
node wxa-skills-eval/cli/index.js run --resume      -p ...
node wxa-skills-eval/cli/index.js run --from eval   -p ...
```

## 关键路径

| 路径 | 用途 |
|---|---|
| `cli/index.js` | CLI 主入口（解析子命令 `run` / `serve`） |
| `.env.example` | 环境变量模板（必填项见 [`references/configuration.md`](references/configuration.md)） |
| `data/runs/<runId>/` | 单次评测的产物与元数据（`run.json` / `progress.jsonl` / `cli_trace.jsonl` / 节点产物） |
| `data/runs/index.json` | 评测历史轻量索引（丢了可一键重建：`POST /api/eval/history/rebuild`） |

### CLI 选项简表

| 短选项 | 长选项 | 说明 |
|---|---|---|
| `-p` | `--project-path` | 小程序项目绝对路径（必填） |
| `-c` | `--cases` | 每次评测生成的 case 数（默认 1） |
| — | `--skills <CSV>` | 参与评测的 skill 名（多个用英文逗号分隔，留空 = 评测全部）；旧参数 `--skill-name` 已废弃 |
| — | `--from <node[:idx]>` | 从指定节点重跑（如 `eval` 或 `gen_intent:1`），UI / headless 行为一致 |
| — | `--resume` | 断点续跑：自动定位最近一次同项目同 skills 的未完成 run，复用已有产物，UI / headless 行为一致 |
| — | `--reuse-shared-nodes` | 项目与 skill 指纹一致时，复用上次的 shared 节点产物（`explore` / `entity_pool` / `gen_api_deps` 等），可显著加速重复评测；指纹不一致会自动 fallback 全跑 |
| — | `--headless` | **仅 CI 场景**：不启动 Web UI，纯命令行输出；日常交互评测请勿使用，保持默认 UI 模式 |
| — | `--port <n>` | Web UI 端口（默认 3200） |
| — | `--auto-port` | 端口被占用时自动选下一个可用端口 |
| — | `--devtools-app-path <path>` | 微信开发者工具路径（覆盖 `.env` 配置；新版开发者工具有 `wechatidecli` 时无需填写） |
| — | `--env <path>` | 指定 `.env` 文件路径（默认读项目根目录） |
| — | `--custom-testcases <path>` | 自定义测试集文件路径（跳过探索/生成，直接评测） |
| — | `--api-blacklist <json>` | 接口黑名单（JSON 格式 `{"skillName":["api1"]}`，被列入的接口在评测过程中跳过；若某 skill 全部接口都在黑名单中则自动从本次 run 中剔除该 skill；若所有 skill 都被黑名单覆盖则直接 fail-fast） |

## 自定义评测集（多 skill 支持）

`--custom-testcases <path>` 与 Web UI「自定义评测集文件」均支持**多 skill 评测**。

**评测集文件格式**：

```json
{
  "skills": ["traffic-12123-query", "traffic-12123-payment"],
  "cases": [
    { "intent": "查询本月交通违章", "checklist": [...] }
  ]
}
```

- `skills[]`：本次评测涉及的 skill 名（多 skill 时由 orchestrator 在同一 run 内统一调度）
- 老格式 `skillName: "..."` 仍兼容，等价于 `skills: ["..."]`
- 不写 `skills`/`skillName` 时由 CLI `--skills` / Web UI「参与评测的 Skills」勾选项兜底

**skills 解析优先级**：`CLI/Web 显式传入` > `文件顶层 skills[]` > `文件顶层 skillName`

**测试集回写策略**（best-effort，失败不影响主流程）：

- **单 skill**：执行完成后自动把 case 入库到该 skill 的测试集（沉淀回归用例）
- **多 skill**：跳过回写——多 skill 模式下无法判断每条 intent 应归属哪个 skill；若需沉淀请拆成单 skill 文件单独跑

## 进一步阅读

- [`references/pipeline.md`](references/pipeline.md) — 13 节点执行顺序、依赖关系、续跑机制
- [`references/devtools-adapter.md`](references/devtools-adapter.md) — DevTools CLI 接入要点
- [`references/configuration.md`](references/configuration.md) — `.env` 全部环境变量与生效节点
- [`references/troubleshooting.md`](references/troubleshooting.md) — 常见报错排查
