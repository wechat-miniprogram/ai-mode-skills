# Changelog

本文件记录 `wxa-skills-generate` 与 `wxa-skills-validate` 的版本变更。
遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

> 项目说明见 [README.md](./README.md)。`wxa-skills-eval` 的版本变更见 [`wxa-skills-eval/CHANGELOG.md`](./wxa-skills-eval/CHANGELOG.md)。

---

## wxa-skills-generate

### [0.2.1] - 2026-07-17

#### ✨ 新增

- **大项目 subagent 分工协议**：新增 `references/SUBAGENT_PROTOCOL.md`，定义五类 subagent（鉴权提取 §2.1 / 鉴权核对 §2.2 / 逐能力接口提取 §2.3 / probe 计划 §2.4 / 校验 §2.6），用于页面 >~30 或多分包的大项目上下文隔离。含源码忠实铁律（interface-spec / plan）、回传纪律（只回结论摘要 + 产物路径，不回源码全文）、能力索引 `capability-index.json` 格式。SKILL.md 阶段 1/3/收尾同步引用
- **鉴权迁移专题**：新增 `references/AUTH_MIGRATION.md`（~189 行），含 auth-spec 契约（§2 事实结构化 + §3 代码 verbatim 拷贝）、`valueSource.kind` 8 类闭合枚举表（literal / computedConstant / computed / appGlobal / storage / dynamic / userInput / upstreamRequest）及对应代码生成策略、`ensureXxx()` 复刻规范、§6 鉴权自检清单、§4 铁律 5（坐标参数必须 `ensureLocation()` + `wx.getLocation`/`getFuzzyLocation`，禁止硬编码/`|| 0`，须在 `app.json` 加 `requiredPrivateInfos`）
- **产物确定性检查脚本**：新增 `scripts/check-artifacts.mjs`（~284 行，零依赖），按阶段 1/3/5/6 检查产物文件存在性 + JSON 可解析 + 目录结构正确，**不校验内容**（内容校验由 validate 负责）。退出码 1 时列出缺失项 + 该回哪个阶段补。SKILL.md 执行清单每个阶段末尾加 `node scripts/check-artifacts.mjs <project-path> --stage N` 勾选项，标注"禁止跳过此检查直接进入下一阶段"
- **阶段契约加"产物校验"行**：阶段 1/2/3/4/6 契约表各加"产物校验"行，显式列出进入下一阶段前必须确认已落盘的文件

#### ♻️ 变更

- **硬性约束 C/D 节重构**：原 C 节拆为 C（代码一致性：C.1 禁止添加 / C.2 禁止丢弃 / 封装层强制复用）+ D（wx API 白名单：D.1 接口侧 / D.2 组件侧 / D.3 组件配置 / D.4 过期态 / D.5 半屏页 / D.6 handoff 接力页 / D.7 不可迁移 / D.8 button open-type / D.9 判定规则）。handoff 从原 C.3.3 升级为 D.6"进小程序的主要方式"
- **阶段 3 细化**：3.3-3.6 从压缩要点展开为完整段落（鉴权依赖确认 / 签名可请求性 / 插件依赖 / 可行性三级校验 + 中置信询问模板）；3.7 probe 节强化"禁止猜测接口返回字段，必须用 automator 捕获真实响应"
- **阶段 5 加 §5.8 字段忠实自检**：每写完一个 `apis/<name>.js` 就地拿 `structuredContent` 字段集与 `merged-result.json` 中该 api 的 probe 真实响应字段集比对，防止臆造字段；缺 probe 产物时重新执行 probe
- **handoff D.6 增强**：明确"何时必须配 pagePath"（执行完停下等用户确认的接口）、四项适配清单（mcp.json pagePath / 返回值 handoff 对象+函数双形态 / app.js wx.onAgentHandoff / 接力页 onLoad 消费）、禁用 `wx.openAgent` / `wx.navigateBackAgent`
- **probe 脚本重构**：`probe-lib.mjs` 精简（删除冗余探测路径，保留 automator 连接 + 真实请求捕获核心）
- **RUNTIME_PROBE.md 扩展**：从 ~80 行扩展至 ~150 行，含完整 SOP（cli open → cli auto → probe.mjs --mode connect）、≥3 轮重试后才可标 UNVERIFIED、禁止手写伪造探测结果

### [0.2.0] - 2026-07-02

#### ♻️ 变更

- **生成规则调整：原子组件默认不生成**：默认只生成原子接口（文本 + `structuredContent` + handoff）；**仅当用户明确要求生成原子组件（GUI 卡片）时**才产出组件目录与 `_meta.ui.componentPath` / `components[]`。同步更新术语约定、职责边界、C.3、阶段 4.2/4.3/4.4、阶段 5.0 前置（整节改为按需）、5.2 与自检清单。
- **`relatedPage` / `setRelatedPage` 移除，进小程序统一走 handoff**：删除 `components[].relatedPage` 配置与 `viewCtx.setRelatedPage()`（从 `JSAPI_WHITELIST.md §2` 白名单、`CODE_TEMPLATES.md` 运行时示例、`SKILL.md` C.3 全部移除）；进小程序改用 `_meta.ui.pagePath` + 返回值 `handoff`（C.3.3 升级为"进小程序的主要方式"）。`CODE_TEMPLATES.md` 的 mcp.json 模板默认改为 `pagePath`，`README.md` 同步。
- **原子接口 wx API 白名单收紧**：`references/JSAPI_WHITELIST.md §1`（接口侧）移除支付类（`requestPayment` / `requestVirtualPayment` / `verifyPaymentPassword` / `requestJointPayment` / `openPublicServicePayment` / `openBusinessView`）、系统选择器与采集（`chooseLocation` / `chooseAddress` / `chooseInvoice` / `chooseInvoiceTitle` / `chooseMedia` / `chooseMessageFile` / `saveImageToPhotosAlbum` / `scanCode`）、主动打开原生页/面板（`openLocation` / `makePhoneCall` / `openDocument` / `shareAppMessage` / `openSetting` / `openPrivacyContract`）；新增 §2.1「动态原子组件专属」表（须声明 `scope.dynamic`，tap 回调触发）。同步更新 `SKILL.md` C.1 / C.2 白名单摘要表。普通（静态）原子组件能力不变。

#### ✨ 新增

- **handoff 接力页生成**：新增 `SKILL.md` C.3.3 节，支持生成 handoff 配置——`mcp.json` 的 `apis[]._meta.ui.pagePath`（接力页 path，不含 query）、原子接口返回值顶层 `handoff`（**兼容对象 `{ query, payload?, card? }`（立即模式）与函数 `({ result }) => ({...})`（延迟模式，`result` 为模型修改后的完整 result）**；`query` 为页面 query 键值对对象、`card` 为卡片展示信息）、主包 `app.js` 注册 `wx.onAgentHandoff`、接力业务页 `onLoad(query)` 消费。配套 `references/CODE_TEMPLATES.md` 新增"handoff 接力页"完整代码模板，`SKILL.md` 4.2（接口字段）/ 5.2（返回值格式）/ 阶段 6（配置集成）同步补充。

### [0.1.20] - 2026-06-15

#### ✨ 新增

- **白名单 API 补齐**：同步官方最新小程序 AI 白名单，在原子接口侧补齐 `getSessionId()`、`getPrivacySetting`、`openPrivacyContract` 等 API 支持；在原子组件侧补齐了 `getWindowInfo`、`openLocation`、`downloadFile`、`showToast`、`hideToast`、`makePhoneCall`、`openSetting`、`shareAppMessage`（需 tap 回调中调用）、振动等 API 的直接调用支持。
- **半屏控制与过期监听能力**：补齐原子组件侧对 `preloadDetailPage()`、`reapplyApiCall()` 以及过期事件监听（`NotificationType.Expire`）的规范支持描述。

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

### [0.2.1] - 2026-07-17

#### ✨ 新增

- **新增 V018 校验 - handoff query 参数名一致性**：校验 `apis/<name>.js` 中 `handoff.query` 的 key 是否在接力页 `<pagePath>.js` 的 `onLoad` 中被引用（`.key` 或 `['key']` 形式）。不匹配时报 error，提示读接力页 onLoad 确认实际参数名后修正。同步更新 `references/VALIDATE_RULES.md` 与 `SKILL.md`（规则范围 V001~V018、错误类型表新增 T-handoff-query）
- **E 类失败（execute success 但业务数据为空）**：新增第 5 种失败类型——`status === "ok"` 且 `isError !== true` 但 `structuredContent` 为空列表/空对象/`total: 0`/只有 `error` 字段时，**不能直接判通过**。5 步排查流程：① 读 `[ai-mode]` 日志确认实际请求 ② 读主包源码定位真实请求 ③ 对比主包与 `apis/<name>.js` 的 URL/method/参数名/鉴权头 ④ 鉴权排查（`ensureLogin` 等是否补齐） ⑤ 修正后重跑；确认请求与主包完全一致时允许带声明通过（疑似环境无数据）。同步更新 `references/CLI_AGENT_REFERENCE.md` E 类排查流程
- **有参接口"先无参后有参"执行策略**：阶段 3 构建执行计划时按入参依赖做拓扑排序——无参接口（`inputSchema.properties` 为空或无 `required`）最先批量 execute，其 `structuredContent` 入数据池后，有参接口再从池中取参数值 execute。禁止在有数据池可用时直接用默认值测试有参接口

#### ♻️ 变更

- **不可修复类细化**：原"AppID 无小程序 AI 的开发模式权限"扩展为"环境 / 权限问题（非代码错误）"，按 `_meta.diagnosis.type` 区分两种——`miniprogram_not_runnable`（`agent compile mode is disabled`，主包/分包运行时白屏，按 hint 逐条排查 app.js 报错/regeneratorRuntime/appid/cloud init）与 `agent_env_unreachable`（websocket 超时 + AppID 获取失败，多种可能不可直接归因为无权限）。须把 hint 原样转述给用户，不得笼统断言"无权限"
- **验收目标加硬门闩**：明确"静态/编译通过 ≠ 验收通过"——须真机 execute + render 5 项核对；execute 未跑成时不得判通过、不产出 `DELIVERY.md`
- **空结果排查独立成段**：从 A 类失败中拆出"success 但空数据"场景，避免被误判为 A 类弱失败直接放行
- **`diagnosis === null` 分类辨析**：diagnosis 为 null 只是"脚本无法把握"，不是"一定是工具问题"——按 error/consoleMessages 特征具体分类（超时掉线→工具不稳定；参数错→A 类；storage 空→B 类；网络/JS 异常→C 类；ok+空数据→E 类），禁止把 A/B/C/E 类业务错误伪装成"工具不稳定"逃避修复
- **删除对生成产物的依赖**：空结果排查和 E 类排查中删除对 `.ai-mode-skills/` 产物（interface-spec / merged-result / auth-spec）的引用，统一为"读主包源码"——validate 可用于校验非 generate 生成的 skills/

### [0.2.0] - 2026-07-02

#### 🗑️ 移除

- **移除 V015（原"原子组件必须配置关联小程序页面"）**：`relatedPage` / `setRelatedPage` 已废弃并从规范中移除，进小程序统一走 handoff（V017），故删除 V015 规则（`validate.mjs` 规则注册 / 分发 / 校验函数 + `references/VALIDATE_RULES.md` 章节 / TOC / 映射表）。校验时不再检查 `relatedPage`。

#### ✨ 新增

- **新增 V017 校验 - handoff 接力页 pagePath**：对声明了 `_meta.ui.pagePath` 的接口校验 pagePath 非空、以 `/` 开头、不含 query、且页面存在于 `app.json` 主包 `pages[]` ∪ 分包 `root+pages`（读不到 app.json 时跳过页面存在性）；另含 warning 子项——声明了 pagePath 但实现文件未返回 `handoff` 时提示补齐。同步更新 `references/VALIDATE_RULES.md` 与 `SKILL.md`（规则范围、错误类型表新增 T-handoff）。

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
