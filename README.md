# mp-agent-skills

微信小程序 Agent Skills 工具集 —— 把任意小程序源码改造为可被 Agent 调度的 **原子接口 + 原子组件**，并完成端到端验证与评测。

## 仓库结构

本仓库是一个 monorepo，包含 3 个独立 skill：

| Skill | 作用 | 当前版本 |
|---|---|---|
| [`wxa-skills-generate`](./wxa-skills-generate/SKILL.md) | **生成**：分析小程序源码，识别业务步骤，提取网络接口与 JSAPI，生成符合 `wx.modelContext` 规范的技能分包（`skills/{skill-name}/`），并完成 `app.json` / `project.config.json` 集成 | 0.1.18 |
| [`wxa-skills-validate`](./wxa-skills-validate/SKILL.md) | **校验**：对 `skills/` 产物执行"静态校验 → 真机执行 → 渲染验证 → 交付文档"闭环；按错误类型就地修复 skill 源文件 | 0.1.17 |
| [`wxa-skills-eval`](./wxa-skills-eval/skill/SKILL.md) | **评测**：端到端评测 skill 的意图理解、轨迹生成与最终答案质量；产出多维度评测报告 | 0.1.15 |

## 工作流

```
小程序源码 ──▶ wxa-skills-generate ──▶ skills/ 产物 ──▶ wxa-skills-validate ──▶ 真机/渲染验证 ──▶ wxa-skills-eval ──▶ 评测报告
```

- **生成** 与 **校验** 是 skill 模式（被 Agent / IDE 加载执行），仅依赖可读的小程序源码目录
- **评测** 是独立的 Node 工程（含 CLI / Web UI），依赖 Node ≥ 18.17

## 快速开始

### 1. 生成 skills（在能加载 Agent Skill 的 IDE 中）

```
@wxa-skills-generate 帮我把这个小程序的"商品检索 + 订单管理"做成 Agent skill
```

skill 会按 6 个阶段（业务澄清 → 项目扫描 → 业务识别 → 接口提取 → 接口设计 → 代码生成 → 配置集成）输出完整的 `skills/{skill-name}/` 目录，并交棒给 `wxa-skills-validate`。

详见 [`wxa-skills-generate/SKILL.md`](./wxa-skills-generate/SKILL.md)。

### 2. 校验 skills

```
@wxa-skills-validate 校验 ./skills 目录
```

skill 会执行：

1. **静态校验**（V001~V016 规则，目录结构 / `mcp.json` schema / 组件 4 文件齐全 / `relatedPage` 路径合法 / WXSS 禁用清单等）
2. **真机执行**（通过微信开发者工具 CLI 跑每个原子接口，比对 `outputSchema`）
3. **渲染验证**（截图原子组件，检查溢出、空数据、深色模式）
4. **就地修复 + 交付文档**

详见 [`wxa-skills-validate/SKILL.md`](./wxa-skills-validate/SKILL.md)。

依赖：

- Node.js ≥ 18
- 微信开发者工具已安装且 CLI 可执行（macOS 默认 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`）

### 3. 评测（CLI / Web）

```bash
cd wxa-skills-eval
pnpm install
pnpm dev:web        # 启动 Web UI 评测
# 或
pnpm dev            # 启动 CLI 评测
```

详见 [`wxa-skills-eval/skill/SKILL.md`](./wxa-skills-eval/skill/SKILL.md) 与 [`wxa-skills-eval/ARCHITECTURE.md`](./wxa-skills-eval/ARCHITECTURE.md)。

## 核心概念

| 术语 | 说明 |
|---|---|
| **原子接口** | 对外暴露给 Agent 的可调用能力，路径 `skills/{skill}/apis/{name}.js`（validator 兼容 `tools/services/` / `tools/`） |
| **原子组件** | 用于渲染原子接口返回数据的 UI，路径 `skills/{skill}/components/{name}/index.{js,json,wxml,wxss}`（与 `mcp.json._meta.ui.componentPath` 严格相等） |
| **mcp.json** | 单一来源维护接口契约（`name` / `description` / `inputSchema` / `outputSchema` / `_meta.ui.componentPath`） + 组件配置（`relatedPage` 必须以 `/` 开头） |
| **wx API 白名单** | 接口侧 vs 组件侧可用 wx API 范围；完整清单见 [`wxa-skills-generate/references/JSAPI_WHITELIST.md`](./wxa-skills-generate/references/JSAPI_WHITELIST.md) |

## 版本历史

所有版本变更详见 [**CHANGELOG.md**](./CHANGELOG.md)（generate / validate）与 [**wxa-skills-eval/CHANGELOG.md**](./wxa-skills-eval/CHANGELOG.md)（eval）。

### 发布 generate / validate（自动化）

版本号不再手动维护。`scripts/release.mjs` 会以「引入当前版本号的那次 commit」为基线，自动 diff 该 skill 目录自上次发布以来的变更，**依据 [Conventional Commits](https://www.conventionalcommits.org/) 自动推断版本级别**（`feat`→minor / `fix`→patch / `BREAKING`/`!`→major），据此递增版本号、同步三处版本真值（`SKILL.md` frontmatter、本 README 表格、`CHANGELOG.md`），并打包成 `dist/<name>-v<version>.zip`。

`CHANGELOG.md` 的条目会按 commit 类型**自动归类**为 `✨ 新增` / `🐛 修复` / `♻️ 优化` / `📝 文档` / `💥 破坏性变更` 等小节。

每次执行（含 dry-run）都会把变更落盘到 `dist/diff/`，便于直观 review：

- `dist/diff/<name>-v<cur>__v<next>.diff` —— 每个有变更的 skill 一份完整 unified diff（带元信息头注释，可在任意编辑器/IDE 中高亮预览）。
- `dist/diff/SUMMARY.md` —— 汇总报告，列出每个 skill 的当前/建议版本、**推断级别及依据**、`--stat`、相关 commit、变更文件清单、跳转到对应 `.diff` 的链接。

```bash
npm run release:check        # dry-run：diff + 自动推断级别，不改源文件，但仍会写 dist/diff/
npm run release              # 执行发布（级别按 commit 自动推断；bump + 同步版本 + 打包 + 归档 diff）
npm run release:minor        # 显式 minor 级（覆盖自动推断）
npm run release:major        # 显式 major 级
npm run release:beta         # 预发布：X.Y.Z-beta.1（再次执行 → beta.2）
npm run release:rc           # 预发布：X.Y.Z-rc.1
npm run release:ci           # 发布 + 自动 git commit + 打 tag（一步到位，适合 CI）

# 更细粒度（直接调脚本）
node scripts/release.mjs --release --skill generate            # 只发布某一个 skill
node scripts/release.mjs --release --commit --tag              # 发布后自动 commit + 打 tag
node scripts/release.mjs --release --prerelease beta           # 预发布
node scripts/release.mjs --check --no-diff                     # 跳过 diff 落盘
node scripts/release.mjs --help                                # 查看全部参数
```

> 默认脚本只改文件、不自动 `git commit`（除非加 `--commit`）。发布前先 `npm run release:check` 打开 `dist/diff/SUMMARY.md` 确认变更范围；发布后请核对 `CHANGELOG.md` 自动归类的条目，补充细节后再提交。`dist/` 已加入 `.gitignore`。

### 版本回溯 / 回滚

`rollback` 子命令可把单个 skill 一键回滚到任意历史版本（优先按 `<name>-v<version>` tag 定位，找不到则回退到「引入该版本号的 commit」）：

```bash
node scripts/release.mjs rollback --skill generate --to 0.1.15            # dry-run，预览回滚操作
node scripts/release.mjs rollback --skill generate --to 0.1.15 --release  # 实际回滚（检出文件 + 同步 README/CHANGELOG + 打包）
node scripts/release.mjs rollback --skill generate --to 0.1.15 --release --commit --tag  # 回滚并自动提交、打回滚 tag
```

回滚会：检出目标版本的 skill 目录（含 `SKILL.md` 版本号）→ 同步 README 表格 → 在 `CHANGELOG.md` 追加 `⏪ 回滚记录`（不污染历史版本条目）→ 可选打包与提交。建议为每次正式发布加 `--tag`，使后续回溯能精确命中。

## 许可

Tencent 内部项目。
