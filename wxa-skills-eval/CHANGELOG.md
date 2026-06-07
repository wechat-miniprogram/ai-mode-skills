# Changelog

本文件记录 `wxa-skills-eval` 对外发布的版本变更。
遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.1.17] - 2026-06-02

### ✨ 新增

- **新版开发者工具自动探测**：安装新版微信开发者工具后会自动注册 `wechatidecli` 环境变量，评测工具优先探测使用，无需再手动配置 `DEVTOOLS_ENV_APP_PATH` 或 `--devtools-app-path`

### ♻️ 优化

- **评测对话生成 prompt 优化**：精简 `gen_trajectory` 阶段的上下文，提升归因、评测、explore、`gen_intent` 等阶段的 KVCache 命中率，整体缩短 prompt 长度与评测耗时
- **评测结果产物瘦身**：显著降低单次评测结果的磁盘体积
- **报告 UI 优化**

### 🐛 修复

- 自定义评测集带 `checklist` 时，checklist 未生效

## [0.1.16] - 2026-05-27

### ♻️ 优化

- 优化测试用例生成策略，过滤掉不合理、无法完成的任务
- 实体探索阶段按接口依赖关系筛选候选接口，减少探索失败率
- 完善黑名单接口的屏蔽逻辑，确保敏感接口不会被误调用

### 🐛 修复

- 修复模型输出中文引号（如 "" ''）导致 JSON 解析失败的问题

## [0.1.15] - 2026-05-26

### 🐛 修复

- 修复 Windows 下 PowerShell 在 WebUI 选择文件夹失效问题
- 修复 Windows 对开发者工具 CLI 输出流中文乱码异常
- 修复评测过程中 LLM 输出不合法 JSON 问题

## [0.1.14] - 2026-05-25

### ✨ 新增

- 取消 intent 长度限制与评测用例数量上限，支持更大规模的评测任务

### 🐛 修复

- 修复 explore 阶段的成功判定逻辑：只要有一条 trace 成功即视为通过
- 修复 win32 平台下 CLI 路径异常问题

## [0.1.13] - 2026-05-22

### ✨ 新增

- 支持自定义评测集
- 支持评测接口黑名单（评测过程不去调用该接口，一般为敏感接口，如删除、退登等）
- 支持多 skills 协同评测，会生成跨 skills 协同完成任务的用例

### 📝 文档

- 修正 `skill/references/pipeline.md`：节点数 13 → 12，移除幻觉 `summary` 节点
- `skill/SKILL.md` 同步节点数描述与 runs 产物说明（补 `cli_trace.jsonl`），frontmatter `version` 升至 0.1.13
- `ARCHITECTURE.md` 修正 `progress.js` 描述（去 monkey-patch 误导），`params` 字段补 `skills[]`

## [0.1.12] - 2026-05-21

### ✨ 新增

- 新增接口黑名单：可通过 Web UI 勾选或 CLI `--api-blacklist` 传入，评测过程中跳过指定接口；某 skill 全部接口被勾选时自动跳过该 skill 评测
- 进度页区分不同 skill：多 skill 评测时按 skill 分组展示节点进度，标题栏与步骤名附加 `Skill X/Y` 计数与 skill 名称
- 支持传入自定义测试集（`--custom-testcases`），跳过探索/生成阶段直接使用文件中的 intent 评测

## [0.1.11] - 2026-05-20

### ♻️ 优化

- 优化评测 explore 阶段的耗时

### 🐛 修复

- 修复 intent 阶段错误导致的耗时异常

## [0.1.10] - 2026-05-19

### ♻️ 优化

- 减少整体评测的 token 消耗

### 📝 文档

- 优化 Skill 文档：精简文档，聚焦使用者视角的前置准备、配置与排错

## [0.1.9] - 2026-05-14

### ✨ 新增

- 增加对原子组件深色模式适配评测
- 支持评测 LLM 配置流式接口
