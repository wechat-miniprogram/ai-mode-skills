# 微信小程序 AI 开发模式辅助 Skills 工具集

把任意小程序源码改造为可被小程序 AI 调度的 **原子接口 + 原子组件**，并完成端到端验证与评测。

## 仓库结构

本仓库是一个 monorepo，包含 3 个独立 skill：

| Skill | 作用 | 当前版本 |
|---|---|---|
| [`wxa-skills-generate`](./wxa-skills-generate/SKILL.md) | **生成**：分析小程序源码，识别业务步骤，提取网络接口与 JSAPI，生成符合微信小程序 AI 开发模式规范的技能分包（`skills/{skill-name}/`），并完成 `app.json` / `project.config.json` 集成 | 0.1.19 |
| [`wxa-skills-validate`](./wxa-skills-validate/SKILL.md) | **校验**：对 `skills/` 产物执行"静态校验 → 真机执行 → 渲染验证 → 交付文档"闭环；按错误类型就地修复 skill 源文件 | 0.1.18 |
| [`wxa-skills-eval`](./wxa-skills-eval/SKILL.md) | **评测**：端到端评测 skill 的意图理解、轨迹生成与最终答案质量；产出多维度评测报告 | 0.1.18 |

## 工作流

```
小程序源码 ──▶ wxa-skills-generate ──▶ skills/ 产物 ──▶ wxa-skills-validate ──▶ 真机/渲染验证 ──▶ wxa-skills-eval ──▶ 评测报告
```

- **生成** 与 **校验** 是 skill 模式（被支持 Skills 的 IDE 加载执行），仅依赖可读的小程序源码目录
- **评测** 是独立的 Node 工程（含 CLI / Web UI），依赖 Node ≥ 18.17

## 前置要求

| 项 | 说明 |
|---|------|
| **微信开发者工具** | 必须已安装且**已登录**（首次需扫码）。generate 的运行时探测和 validate 的真机执行/渲染验证都依赖开发者工具，开发者工具需使用 nightly 版本|
| **服务端口** | 开发者工具内「设置 → 安全设置 → 服务端口」必须**开启** |

## 快速开始

### 1. 生成 skills（在支持 skills 的 coding agent 中）

```
使用 wxa-skills-generate 帮我把这个小程序的"商品检索 + 订单管理"做成小程序 AI 的 SKILL
```

skill 会按 6 个阶段（业务澄清 → 项目扫描 → 业务识别 → 接口提取 → 接口设计 → 代码生成 → 配置集成）输出完整的 `skills/{skill-name}/` 目录，并交棒给 `wxa-skills-validate`。

> 💡 每次建议生成一小部分业务逻辑的代码，验证效果后继续生成；也可基于现有的 skills 进行扩展，完善覆盖的业务场景。

详见 [`wxa-skills-generate/SKILL.md`](./wxa-skills-generate/SKILL.md)。

### 2. 校验 skills

```
使用 wxa-skills-validate 校验 ./skills 目录
```

skill 会执行：

1. **静态校验**（V001~V016 规则，目录结构 / `mcp.json` schema / 组件 4 文件齐全 / `relatedPage` 路径合法 / WXSS 禁用清单等）
2. **真机执行**（通过微信开发者工具 CLI 跑每个原子接口，比对 `outputSchema`）
3. **渲染验证**（截图原子组件，检查溢出、空数据、深色模式）
4. **就地修复 + 交付文档**

> 💡 三步可单独执行，不必走完整闭环。例如只想验证组件效果时：
>
> ```
> 使用 wxa-skills-validate 帮我校验 ./skills 目录下的原子组件效果，使用 mock 数据验证即可，无需执行原子接口
> ```

依赖：

- Node.js ≥ 18
- 微信开发者工具已安装且 CLI 可执行（macOS 默认 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`）

详见 [`wxa-skills-validate/SKILL.md`](./wxa-skills-validate/SKILL.md)。

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
| **原子接口** | 对外暴露给小程序 AI 的可调用能力，路径 `skills/{skill}/apis/{name}.js`（validator 兼容 `tools/services/` / `tools/`） |
| **原子组件** | 用于渲染原子接口返回数据的 UI，路径 `skills/{skill}/components/{name}/index.{js,json,wxml,wxss}`（与 `mcp.json._meta.ui.componentPath` 严格相等） |
| **mcp.json** | 单一来源维护接口契约（`name` / `description` / `inputSchema` / `outputSchema` / `_meta.ui.componentPath`） + 组件配置（`relatedPage` 必须以 `/` 开头） |
| **wx API 白名单** | 接口侧 vs 组件侧可用 wx API 范围；完整清单见 [`wxa-skills-generate/references/JSAPI_WHITELIST.md`](./wxa-skills-generate/references/JSAPI_WHITELIST.md) |

## 版本历史

所有版本变更详见 [**CHANGELOG.md**](./CHANGELOG.md)（generate / validate）与 [**wxa-skills-eval/CHANGELOG.md**](./wxa-skills-eval/CHANGELOG.md)（eval）。
