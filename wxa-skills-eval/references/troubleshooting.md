# Troubleshooting — 常见报错排查

> 当评测中出现异常时，先在本文档检索关键字；命中即按步骤排查，否则再读对应节点源码。

## 1. `检测到旧版 workdir 布局：<workdir>/skills/`

**含义**：multi-skill 联合评测改造后，产物废弃了 per-skill 子目录，所有共享产物落在 workdir 根、per-case 产物落在 `<workdir>/cases/<idx>/` 下。若检测到 `<workdir>/skills/` 目录存在，表示该 workdir 是旧版本产物、不可续跑。

**排查**：

1. 检查 `<workdir>/skills/` 是否存在 —— 若存在即为旧布局。
2. 解决方案：
   - **推荐：新建空 workdir 重跑**。
   - 或手工合并 per-skill 子目录下产物到 workdir 根，并合并 `cases/` 后再续跑（不推荐，指纹也不一致）。
3. 该机制防止老产物与新逻辑静默冲突造成 silent corruption。
## 2. DevTools 连接失败 / `连接微信开发者工具失败`

**典型表现**：

- `start` 节点报错；进度卡在 `[1/N] ▶ start`
- 日志含 `connect ECONNREFUSED` 或 `服务端口未开启`

**排查清单**：

| 检查项 | 操作 |
|---|---|
| 是否安装新版开发者工具 | 新版安装后自动注册 `wechatidecli` 环境变量，终端执行 `wechatidecli` 可验证（macOS 用 `which wechatidecli`，Windows 用 `where wechatidecli`） |
| 开发者工具是否已安装且在 `DEVTOOLS_ENV_APP_PATH` 路径 | 若未安装新版，macOS 默认 `/Applications/wechatwebdevtools.app`；若安装在自定义路径，必须配置该环境变量 |
| 服务端口是否开启 | 开发者工具 → 设置 → 安全 → 勾选"服务端口" |
| 是否自动启动失败 | 手动打开开发者工具后，配置 `DEVTOOLS_ENV_SKIP_AUTO_LAUNCH=1` 跳过自动启动 |
| 项目路径是否绝对 | `-p` 参数必须是绝对路径，且目录中含 `app.json` 与 `mcp.json` |
| 是否信任了项目 | 首次连接时弹窗会要求"信任并打开"，须人工确认 |
| 是否被防火墙拦截 | macOS 系统设置 → 网络 → 防火墙，确认未阻止 wechatwebdevtools |

## 3. LLM 鉴权失败 / `401 Unauthorized` / `Invalid API Key`

**排查**：

1. 确认 `.env` 中三项都已填：`WXA_SKILL_EVAL_LLM_BASE_URL`、`WXA_SKILL_EVAL_LLM_API_KEY`、`WXA_SKILL_EVAL_LLM_MODEL`。
2. 用 `curl` 直接打目标 BaseURL 的 `/v1/models`，验证 key 在该网关下有效。
3. 公司内网网关常常要求 BaseURL 包含完整路径（如 `https://gateway/v1`），不要漏掉 `/v1`。
4. 若使用 OpenAI 官方，确认所选模型名（`WXA_SKILL_EVAL_LLM_MODEL`）账号有权限访问。
5. 端口/网关需要代理时，按目标 SDK 文档设置 `HTTPS_PROXY`，不要在源码里硬编码。

## 4. 节点输出 schema 校验失败 / `[<node>] schema 校验失败`

**典型表现**：续跑时打印 `⚠ 节点 X 输出无效，将被重跑`；或依赖加载抛错。

**排查**：

1. 找到该 `<node>` 对应的产物 JSON 文件（路径见 [`pipeline.md`](pipeline.md) 第 4 节）。
2. 手动检查产物的必填字段是否缺失或类型错误。
3. 删除该文件让节点重跑，或用 `--from <node>` 强制从该节点重启。

## 5. 节点跳过却找不到产物 / 续跑没复用

**症状**：上次明明跑过 `explore`，再次运行却没看到 `♻️ explore (已复用)`。

**排查**：

1. 复用条件三关：产物文件存在 ∧ JSON 可解析 ∧ 字段完整。任意一关失败都不会复用。
2. 检查共享产物是否在 `<workdir>/explore.json`（run 级）；per-case 产物是否在 `<workdir>/cases/<idx>/<file>.json`。
3. 若 schema 升级后老产物不兼容，可手工删除对应产物后重跑。
## 6. 端口 3200 被占用

**行为**：UI 模式默认端口 3200；若被占用会复用已有 server 实例（同一台机上运行第二个 `run` 时常见）。

**手动指定端口**：`run --port 3201` 或 `serve --port 3201`。

**排查占用者**（启动 server 失败时默认会按平台提示）：

| 平台 | 查看占用 | 终止进程 |
|---|---|---|
| macOS / Linux | `lsof -nP -iTCP:3200 -sTCP:LISTEN` | `kill -9 <pid>` |
| Windows | `netstat -ano | findstr :3200` | `taskkill /PID <pid> /F` |

## 7. DevTools CLI 调用问题排查（首选 `cli_trace.jsonl`）

**含义**：`gen_trajectory` / `explore` 节点执行慢、超时、报错时，第一现场不是节点产物，而是 DevTools adapter 落盘的 CLI 调用 trace：

```
data/runs/<runId>/cli_trace.jsonl
```

每行一条 JSON，记录一次 `callTool` / `chat` / 控制信令的完整调用现场（含 `stdout` / `stderr` / `exitCode` / `durationMs`）。

**排查清单**：

| 症状 | 排查命令 |
|---|---|
| 某次 chat 卡住超时 | `jq 'select(.type=="chat" and .success==false)' .../cli_trace.jsonl` 看 `error / partial / peekSummary` |
| 怀疑 CLI 内部超时 | `jq 'select(.killedByTimeout==true or (.error|test("timeout after")))' .../cli_trace.jsonl` |
| 想看 tool 调用的耗时分布 | `jq -s 'group_by(.name) | map({name:.[0].name, calls:length, avg:(map(.durationMs)|add/length)})' .../cli_trace.jsonl` |
| chat partial 但 agent 实际完成 | `jq 'select(.recoveredFromTimeout==true)' .../cli_trace.jsonl` 确认是否被升级为 success |
| fatal 终止评测 | `jq 'select(.fatal==true)' .../cli_trace.jsonl` 看终止前最后一条记录 |

**注意事项**：

- 该文件**完整保留** stdout/stderr 不截断；长会话单文件可能上百 MB，排查后可手动清理
- `cli_trace.jsonl` 只记 adapter 与 CLI 之间的调用，不替代 `progress.jsonl`（节点级进度）和 `eval_report.html`（评测结论）

## 8. Windows 平台常见问题

### 8.1 找不到 `cli.bat` / `该路径不是有效的微信开发者工具安装目录`（`wechatidecli` 未注册时的兜底分支）

**原因**：系统未检测到 `wechatidecli` 环境变量命令，且 `DEVTOOLS_ENV_APP_PATH` 未配置或配置了错误路径，默认探测也失败。

**排查与修复**：

1. **推荐方案**：升级到新版微信开发者工具（安装后自动注册 `wechatidecli` 环境变量），升级后无需手动配置路径。验证：在终端执行 `where wechatidecli`，有输出即为成功。
2. 若无法升级，确认微信开发者工具本地安装目录（常见位置）：
   - `C:\Program Files (x86)\Tencent\微信web开发者工具`
   - `C:\Program Files\Tencent\微信web开发者工具`
3. 在该目录下确认 `cli.bat` 文件存在。
4. 在 `.env` 或 shell 环境变量中设置：
   ```
   DEVTOOLS_ENV_APP_PATH=C:\Program Files (x86)\Tencent\微信web开发者工具
   ```
   也可填 `微信开发者工具.exe` 文件路径（会自动取所在目录）。

### 8.2 PowerShell 选择目录失败 / 弹窗不弹出

**现象**：Web UI 中点击“选择目录”强迫退出或提示脚本被禁。

**原因**：企业域环境下 PowerShell 默认执行策略为 `Restricted` / `AllSigned`，拒绝运行未签名的内联脚本。

**排查与修复**：

1. 本工具调用 PowerShell 时已默认传入 `-ExecutionPolicy Bypass`，一般不受全局策略影响。
2. 仍遇拦截时，可手动运行验证：
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('ok')"
   ```
   若仍报 `无法加载` 类错误，请联系 IT 放开 PowerShell 脚本权限，或手动在 Web UI 表单中填入项目路径。
3. 中文路径乱码：本工具已在脚本首行设置 `[Console]::OutputEncoding = UTF8`；若本地 PowerShell 版本过低（< 5.1）可能仍会乱码，升级 PowerShell 后重试。

### 8.3 端口被占用（Windows 版）

```
netstat -ano | findstr :3200
taskkill /PID <pid> /F
```

作为参考：`netstat -ano` 最后一列即为进程 PID；`taskkill` 需加 `/F` 强制终止。
