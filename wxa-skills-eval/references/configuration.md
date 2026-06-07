# Configuration — 环境变量与配置完全清单

## 1. LLM 服务配置（必填）

| 变量 | 必填 | 默认值 | 生效节点 / 模块 | 说明 |
|---|---|---|---|---|
| `WXA_SKILL_EVAL_LLM_BASE_URL` | ✅ | — | `core/llm/client.js`（所有 LLM 节点） | OpenAI 兼容 API 的 BaseURL |
| `WXA_SKILL_EVAL_LLM_API_KEY` | ✅ | — | 同上 | API 鉴权密钥 |
| `WXA_SKILL_EVAL_LLM_MODEL` | ✅ | — | 同上 | 默认模型名（如 `gpt-4o`） |

## 2. LLM 客户端调优（可选）

| 变量 | 必填 | 默认值 | 生效节点 / 模块 | 说明 |
|---|---|---|---|---|
| `WXA_SKILL_EVAL_LLM_TIMEOUT` | ❌ | `60` | `core/llm/client.js` | 单次请求超时（秒） |
| `WXA_SKILL_EVAL_LLM_MAX_RETRIES` | ❌ | `3` | 同上 | 失败重试次数 |
| `WXA_SKILL_EVAL_LLM_CONCURRENCY` | ❌ | `3` | `core/llm/scheduler.js` | LLM 全局并发上限；设为 `1` 等价串行 |
| `WXA_SKILL_EVAL_LLM_STREAM` | ❌ | `0` | `core/llm/client.js` | 是否启用流式（SSE）调用，合法值：`1`/`true` 启用，`0`/`false`/未设置 关闭 |

## 3. 节点行为调优（可选）

| 变量 | 必填 | 默认值 | 生效节点 | 说明 |
|---|---|---|---|---|
| `WXA_SKILL_EVAL_MAX_TRAJECTORY_ROUNDS` | ❌ | `12` | `gen_trajectory` | 单次生成的最大对话轮数 |
| `WXA_SKILL_EVAL_MAX_DISPATCH_PER_CASE` | ❌ | `6` | `gen_trajectory` | 单 case 内允许的 dispatch 调用次数上限（防止模型反复调用工具） |
| `WXA_SKILL_EVAL_MAX_MDP_STEPS` | ❌ | `8` | `gen_trajectory` | 单条轨迹的最大 MDP 步数，超出后强制终止 |
| `WXA_SKILL_EVAL_EXPLORE_N_TRAJECTORIES` | ❌ | `3` | `explore` | 每个 skill 探索的轨迹条数 |
| `WXA_SKILL_EVAL_EXPLORE_MAX_STEPS` | ❌ | `10` | `explore` | 每条探索轨迹的最大工具调用次数（≥3 才能通过校验） |
| `WXA_SKILL_EVAL_EXPANDED_GATING` | ❌ | unset | `gen_intent` | 设为 `off` 关闭"raw-only 桶屏蔽 expanded 实体"的分流策略 |
| `WXA_SKILL_EVAL_EXPANDED_RATIO` | ❌ | `30` | `gen_intent` | expanded 实体在采样中的占比（0–100，超出范围回退到 30） |
| `WXA_SKILL_EVAL_SEED_SAMPLING` | ❌ | unset | `gen_intent` | seed 覆盖采样模式开关（具体取值见节点注释） |
| `WXA_SKILL_EVAL_ENTITY_BLACKLIST` | ❌ | unset | `gen_intent` | 跨 case 已用实体软黑名单；设为 `off` 关闭 |

> 这些参数用于在调试期减少 LLM 消耗、加速迭代。生产评测建议保留默认。

## 4. DevTools 适配器（可选）

> **新版自动探测**：新版微信开发者工具（macOS `.pkg` / Windows 安装包）安装后会注册系统命令 `wechatidecli`，评测工具启动时会自动通过 `which`（macOS）/ `where`（Windows）探测该命令。探测成功时**无需手动配置** `DEVTOOLS_ENV_APP_PATH`。以下环境变量仅在未安装新版开发者工具或需要手动覆盖时使用。

| 变量 | 必填 | 默认值 | 生效节点 | 说明 |
|---|---|---|---|---|
| `DEVTOOLS_ENV_APP_PATH` | ❌ | 平台默认安装路径 | `start` / `explore` / `gen_trajectory` | 微信开发者工具安装路径。校验依据：该路径下能找到 `cli`（mac）或 `cli.bat`（Windows）。完整探测优先级见下方"CLI 路径探测优先级" |
| `DEVTOOLS_ENV_PROJECT_PATH` | ⚠️ 二选一 | — | 同上 | 小程序项目绝对路径。**与 CLI `-p / --project-path` 二选一必填**：CLI 显式传入时优先；Web UI 仅将此变量作为表单初值预填（其次回退到上次评测历史），最终以用户提交的表单值为准 |
| `DEVTOOLS_ENV_CALL_TOOL_TIMEOUT` | ❌ | `25` | 同上 | `callTool` 外层进程超时（秒）；CLI 内层 `--timeout` = 该值 - 5s |
| `DEVTOOLS_ENV_CHAT_TIMEOUT` | ❌ | `50` | 同上 | `chat` 外层进程超时（秒）；CLI 内层 `--timeout` = 该值 - 5s |
| `DEVTOOLS_ENV_LAUNCH_TIMEOUT` | ❌ | `15` | 同上 | `auto` 子进程端口就绪等待超时（秒） |
| `DEVTOOLS_ENV_SKIP_AUTO_LAUNCH` | ❌ | unset | 同上 | 设为 `1` 跳过自动启动开发者工具（已自行打开时使用） |

### CLI 路径探测优先级

| 优先级 | 来源 | 说明 |
|---|---|---|
| 1（最高） | `DEVTOOLS_CLI_OVERRIDE` 环境变量 | 直接覆盖最终 CLI 路径，仅用于本地开发调试。会做存在性 + 可执行权限校验（不跑 smoke test），配错路径在适配器首次取 CLI 时立即报错 |
| 2 | `wechatidecli` 系统命令 | 新版开发者工具注册的环境变量命令，自动探测 |
| 3 | `--devtools-app-path` / `DEVTOOLS_ENV_APP_PATH` | 用户手动配置的安装路径（兜底） |
| 4（最低） | 平台默认路径探测 | macOS: `/Applications/wechatwebdevtools.app`；Windows: 两个候选目录 |

### `DEVTOOLS_ENV_APP_PATH` 各平台写法

| 平台 | 应填 | 探测顺序（未配置时） |
|---|---|---|
| macOS | `.app` 路径，例：`/Applications/wechatwebdevtools.app` | `wechatidecli` → 固定默认 `/Applications/wechatwebdevtools.app` |
| Windows | **安装目录**（推荐），例：`C:\Program Files (x86)\Tencent\微信web开发者工具`；也可填 `微信开发者工具.exe` 文件路径（会自动取所在目录） | `wechatidecli` → 依次探测：`C:\Program Files (x86)\Tencent\微信web开发者工具` → `C:\Program Files\Tencent\微信web开发者工具` |

> Windows 校验要求该路径下存在 `cli.bat`；macOS 校验要求 `Contents/MacOS/cli` 存在且可执行。新版开发者工具用户无需关心这些细节，`wechatidecli` 命令会自动被探测使用。

## 5. 调试

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `WXA_SKILL_EVAL_DEBUG` | ❌ | unset | 设为 `1` 输出更详细的运行时日志 |

## 6. 配置加载顺序

```
1. process.env                       （shell/CI 已设置，优先级最高）
2. 产物根 wxa-skills-eval/.env   （skill 标准位置）
3. process.cwd()/.env                （在任意目录运行时的兑底）
```

> `dotenv` 不会覆盖已存在的 `process.env`。CI 环境中通过 secrets 注入 env 即可，无需写 `.env` 文件。
