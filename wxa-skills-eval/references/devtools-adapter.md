# DevTools 接入 — 微信开发者工具准备与排错

本 Skill 通过 **微信开发者工具 CLI** 驱动小程序运行；以下两节帮你确保环境就绪、出错能快速定位。

## 1. 前置准备（必读）

| 项 | 要求 |
|---|---|
| 微信开发者工具 | 已安装。**推荐使用新版**（macOS `.pkg` / Windows 安装包），安装后自动注册 `wechatidecli` 环境变量，无需手动配置路径。旧版需配置 `DEVTOOLS_ENV_APP_PATH`（macOS 默认 `/Applications/wechatwebdevtools.app`；自定义路径需手动设置） |
| 服务端口 | 开发者工具 → 设置 → 安全 → 开启"服务端口" **（必须，否则 `start` 节点直接失败）** |
| 项目路径 | 绝对路径，且目录中同时存在 `app.json` 与 `mcp.json` |
| 首次连接 | 弹窗中点击"信任并打开"完成授权 |

> 工具路径、各类超时等可在 `.env` 中调整，详见 [`configuration.md`](configuration.md) 第 4 节。

> 评测过程中，开发者工具会在整轮评测内**复用同一个进程**（不会每个 case 反复冷启动）；仅 `explore` 与 `gen_trajectory` 节点会真正发起 DevTools 调用，其它节点仅依赖 LLM。

## 2. 出错排查

每次评测会在 `data/runs/<runId>/cli_trace.jsonl` 留下完整 CLI 调用现场（含 `stdout` / `stderr` / 耗时 / 错误信息）。

**首选自查**：

```bash
# 查看本次评测中所有失败的 CLI 调用
grep '"success":false' data/runs/<runId>/cli_trace.jsonl | jq .
```

更多排错场景（端口未开、信任弹窗、超时、partial 升级等）见 [`troubleshooting.md`](troubleshooting.md) 第 2 / 第 7 节。
