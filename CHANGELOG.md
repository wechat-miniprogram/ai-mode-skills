# Changelog

本文件记录 `wxa-skills-generate` 与 `wxa-skills-validate` 的版本变更。
遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

> 项目说明见 [README.md](./README.md)。`wxa-skills-eval` 的版本变更见 [`wxa-skills-eval/CHANGELOG.md`](./wxa-skills-eval/CHANGELOG.md)。

---

## wxa-skills-generate

### [0.1.19] - 2026-06-12

#### ✨ 新增

- **运行时探测（Automator Probe）**：阶段 3 新增 3.6 运行时探测环节，基于 `miniprogram-automator` 启动微信开发者工具，在**源项目**上模拟交互并通过 `evaluate` 覆写 `wx.request` 捕获真实请求参数与响应数据，补齐静态分析无法确定的 URL / 字段 / 类型。新增 `scripts/probe.mjs` + `scripts/probe-lib.mjs` 执行脚本与 `references/RUNTIME_PROBE.md` 专题文档（触发条件、SOP、失败兜底、合并策略、结果接入）。
- **T1~T6 强制触发条件**：命中以下任一即标记 `requiresRuntimeProbe: true` 并**强制执行 probe，禁止跳过**——T1 URL 动态拼接/压缩不可读、T2 请求含签名/加密字段、T3 响应结构不可推断（T3a 透传无字段访问 / T3b 模板隐式消费）、T4 必须登录才返回业务数据、T5 中置信且用户也不确定、T6 参数传递链 >3 跳 + globalData。另定义压缩源码 / 字段类型不确定等建议（非强制）探测场景。
- **静态分析 + Probe 合并流程**：分析产物统一写入 `<源项目>/.ai-mode-skills/`（`static-analysis.json` 带 `confidence` 标记 → `merged-result.json` 合并后最终结果，`probe/` 存放 plan 与原始结果）。阶段 4 入口条件改为读取 `merged-result.json`，存在 `requiresProbe: true` 时必须先完成 probe（成功或降级兜底）才能进入。
- **代码注释溯源**：`apis/<name>.js` 顶部新增 `[ai-mode:static]` / `[ai-mode:probe]` 注释规范，标注 URL 与响应字段的来源与验证情况。
- **新增阻断规则**：静态分析 + 运行时探测 + 离线兜底三者全部失败时阻断。

#### 📝 文档

- SKILL.md「依赖」补充 probe 阶段所需的 `scripts/` 脚本、`miniprogram-automator`（安装到 skill `scripts/` 目录，禁止装入源项目）与开发者工具 CLI/服务端口要求；reference 索引、阶段产出自检清单与流程跳转表同步加入 probe 相关条目。

### [0.1.18] - 2026-06-08

#### ✨ 新增

- **高度预估与溢出自动决策流程**：在原子组件设计规范（`ATOMIC_COMPONENT_DESIGN.md`）中引入高度预估计算公式（`availableHeight = maxHeight - 97`）与溢出决策流程。当预估高度超出卡片大小时，系统自动决策处理方式（优先换至大比例档位；若仍溢出，则纵向内容转半屏，横向内容转 `scroll-x` 横向滚动），无需中断询问用户。
- **溢出处理代码与模板支持**：在 `COMPONENT_TEMPLATES.md` 中新增“半屏展示（摘要+查看全部按钮）”和“横向滚动（`scroll-view`）”两套标准列表溢出处理模板。规范了卡片内高度动态计算（`maxVisible`）和溢出监听流程。
- **自检及说明细化**：在 `SKILL.md` 中新增 5.0.2 节对高度预估与溢出处理的规范描述，同时更新组件自检清单（`SKILL.md` / `HALF_SCREEN.md`），确保模型生成时自动落实溢出处理。

### [0.1.17] - 2026-06-04

#### ✨ 新增

- **Skill 中间件**：新增 Koa 式洋葱模型的中间件机制（`wx.modelContext.createSkill(skillPath)` → `skill.use((ctx, next) => {})`），可用于统一登录态、统一上报和错误监听等场景，每个原子接口都会执行一遍。中间件 context 提供 `name` / `skillPath` / `arguments`（副本）三个属性
- `skill.registerAPI(name, handler)` 作为 `wx.modelContext.registerAPI` 的等效替代，与中间件配合使用
- 同步更新白名单（JSAPI_WHITELIST.md、SKILL.md C.1）和代码模板（CODE_TEMPLATES.md 新增 3.2 中间件模式）

### [0.1.16] - 2026-05-28

#### ✨ 新增

- **原子组件支持横向滚动**：`<scroll-view>` 加入支持的内置组件清单，**仅允许 `scroll-x="true"` 横向滚动**，**禁止 `scroll-y` 纵向滚动**（容器最大高度 `100vw` 不变）
- 同步更新：D 节支持/不支持组件清单、5.0.0 设计要点表格⑤布局原则（"禁横滚"→ "横向超长可用 `scroll-view scroll-x`"）、`STYLE_MIGRATION.md` 源样式迁移清单、`ATOMIC_COMPONENT_DESIGN.md` 横向滚动堆叠规则、`ATOMIC_COMPONENT_CSS.md` 容器约束描述、`COMPONENT_TEMPLATES.md` 内置组件支持清单

### [0.1.15] - 2026-05-27

#### ✨ 新增

- **wx API 白名单完整清单** 抽离到 `references/JSAPI_WHITELIST.md`（接口侧 / 组件侧 / 不可迁移三大表 + 判定规则），SKILL.md C 节只保留高频条目，长尾 API 按需查 reference
- 接口侧白名单补充：上传下载 `wx.uploadFile` / `wx.downloadFile`、文件 `wx.openDocument`、图片 `wx.saveImageToPhotosAlbum` / `wx.getImageInfo`、微信运动 `wx.getWeRunData`、发票 `wx.chooseInvoice` / `wx.chooseInvoiceTitle`、账号信息 `wx.getAccountInfoSync`
- 微信支付白名单补全 `wx.requestJointPayment` / `wx.openPublicServicePayment` 与 `openBusinessView` 的 `openPublicServicePayment` / `trafficInvestList` businessType
- 组件侧白名单新增：数据缓存全套（`getStorage` / `setStorage` 等）、`wx.openDocument`、`wx.getAccountInfoSync`、地图 `MapContext.*`（除 `openMapApp` 外的全部方法，通过 `this.createSelectorQuery().select('#mapId').context()` 获取）
- 关联页面 `relatedPage` 必须以 `/` 开头（绝对路径）的约束在 C.3 节明确化
- **半屏页面**（`viewCtx.openDetailPage` + 半屏内 `sendFollowUpMessage` 上行 + web-view h5 `WeixinJSBridge.invoke` 上行）：新增 `references/HALF_SCREEN.md` 专题（场景值 1433/1434、左上角关闭按钮适配、8 类禁用接口与组件清单），SKILL.md 新增 C.3.2 节简短说明。**默认不生成**，仅当业务确有"详情 / 用户补充信息"语义时按 reference 挂上
- **组件过期态精细过滤**：`wx.modelContext.expireAllCards()` 与 `viewCtx.expirePreviousCards()` 支持 `{ componentPaths?, match? }` 参数（`componentPaths` 用绝对路径过滤、`match: 'latest'` 只过期最近一张匹配卡）；同步更新 SKILL.md C.3.1、JSAPI_WHITELIST.md §1/§2、COMPONENT_TEMPLATES.md "卡片过期"节
- **多模态入参**：`inputSchema.properties.<field>` 支持 `"format": "image"`（类型为 `string`，运行时填本地图片路径），小程序 AI 输入框据此识别为多模态字段引导用户上传图片；SKILL.md 阶段 4.2 + CODE_TEMPLATES.md mcp.json 模板 同步示例

#### ♻️ 优化

- **SKILL.md 精简 ~23%**（727 → 557 行）：阶段 1/3/4/5 内部子节段落式合并，阶段 5.0.0/5.0/5.0.1 三个强制前置整合为单表格，硬性约束 D 节去除冗述
- 修正"武断目录硬编码"：明确原子接口路径 `apis/` 是约定（validator 兼容 `tools/services/` / `tools/`），原子组件路径 `components/<name>/index.{js,json,wxml,wxss}` 是强约束
- C.4 不可迁移 JSAPI 移除 `wx.saveImageToPhotosAlbum`（已纳入白名单）
- `setRelatedPage` 运行时示例从 SKILL.md 搬到 `references/CODE_TEMPLATES.md` 第四节

### [0.1.10] 及之前

历史版本变更未在 CHANGELOG 中维护，详见 git log。

---

## wxa-skills-validate

### [0.1.17] - 2026-06-04

#### ✨ 新增

- **validate**：新增 V016 校验 - app.json agent.skills[].description 必须存在且非空

#### 🐛 修复

- **AppID 无小程序 AI 的开发模式权限诊断**：修复 AppID 无小程序 AI 的开发模式权限时循环重试卡住的问题。新增 `_meta.diagnosis` 自动诊断机制，在 execute/render 产物中标记不可修复的环境问题（`appid_no_agent_permission`），并立即停止执行，不再进入源码修复流程
- **加强小程序 AI 自动执行的流程指引**：明确在修复流程前检查 `_meta.diagnosis`，命中不可修复类则直接终止
- 清理废弃注释

### [0.1.16] - 2026-05-28

#### ✨ 新增

- **V003 WXML 组件白名单升级**：`<scroll-view>` 加入允许列表；新增 2 条规则：
  - `<scroll-view>` 必须显式声明 `scroll-x`（仅支持横向滚动）
  - `<scroll-view scroll-y="true">` 不允许（不支持纵向滚动）
- 同步更新 `references/VALIDATE_RULES.md` 中 V003 描述与典型修复

### [0.1.15] - 2026-05-27

#### ✨ 新增

- **支持子包页面校验**：`mcp.json.components[].relatedPage` 现在可以指向子包下的页面（`subPackages[*].root` + `pages[*]` 拼接的路径），不再仅限主包 `app.json.pages[]`
- **`relatedPage` 路径校验加严**：必须以 `/` 开头（绝对路径），去掉前导 `/` 后必须是项目实际存在的页面（主包 `pages[]` 或子包 `subPackages[*]` 拼接），业务上无对应页面时兜底 `/<app.json.pages[0]>`

#### 📝 文档

- 同步更新 `references/VALIDATE_RULES.md` 中 `relatedPage` 校验规则的描述
- T-wx-jsapi 排错路径补充指向 `wxa-skills-generate/references/JSAPI_WHITELIST.md` 完整白名单

### [0.1.8] 及之前

历史版本变更未在 CHANGELOG 中维护，详见 git log。
