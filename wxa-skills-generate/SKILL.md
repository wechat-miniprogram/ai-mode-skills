---
name: wxa-skills-generate
description: 分析小程序项目源代码（含压缩/混淆），识别核心业务步骤，提取网络接口与 JSAPI 调用，生成符合 wx.modelContext 规范的技能分包（含原子接口 + 原子组件），并完成 app.json / project.config.json 配置集成。在以下场景触发：把小程序页面能力改造为小程序 AI 原子接口、生成 skills/ 分包代码、从源项目派生 MCP 工具、小程序 AI 的开发模式代码生成。仅负责静态生成，生成完成后必须交棒 wxa-skills-validate 做校验。
metadata:
  author: Tencent
  version: '0.1.20'
---

# wxa-skill-generate

从小程序源码生成符合 `wx.modelContext` 规范的技能分包（skills/）：**分析源码 → 识别业务 → 提取接口与 JSAPI → 设计原子接口 → 生成代码 → 集成配置 → 交棒校验**。

## 职责边界

- ✅ 本 skill 做：源码分析、原子接口设计、代码生成、`app.json` / `project.config.json` 集成
- ❌ 本 skill 不做：静态校验、真机执行、渲染验证（这些全部由 `wxa-skills-validate` 负责）
- 📦 交付：`skills/{skill-name}/`（含 `mcp.json`、`SKILL.md`、`index.js`、原子接口实现文件、工具模块、组件目录）+ 配置文件更新

## 依赖

- **可读的源码目录**（仅给 appid / URL / 截图 → 触发阻断）
- 本 skill 主体**不执行**代码，只生成代码；但**运行时探测（probe）**阶段需要：
  - `scripts/probe.mjs` + `scripts/probe-lib.mjs`（与本 skill 同目录）
  - `miniprogram-automator`：阶段 3.6 环境检查时由模型安装到 skill 的 `scripts/` 目录（`cd <skill-path>/scripts && npm install miniprogram-automator`），**禁止安装到小程序源项目**
  - 微信开发者工具 CLI 已安装且「服务端口」已开启（支持 `WX_CLI_PATH` 环境变量 / 自动检测）
  - probe 为**强制触发**：阶段 3 标记 `requiresRuntimeProbe: true` 或命中 T1~T6 时**必须执行 probe，禁止跳过**（详见阶段 3.6 与 `references/RUNTIME_PROBE.md`），通过 `evaluate` 覆写 `wx.request` 同时捕获请求参数与响应数据

## 术语约定

- **原子接口**：对外暴露给小程序 AI 的可调用能力。约定路径 `skills/{skill}/apis/{name}.js`（validator 也兼容 `tools/services/` / `tools/`）
- **原子组件**：用于渲染原子接口返回数据的 UI。**强约束路径** `skills/{skill}/components/{name}/`（与 `mcp.json._meta.ui.componentPath` 严格相等）
- **压缩代码**：单行超 500 字符、变量名单字符的产物（含混淆）

## 参考资料索引

| 文件 | 用途 | 加载时机 |
|------|------|---------|
| `references/ANALYSIS_PATTERNS.md` | 业务流程识别、接口调用、JSAPI 匹配的正则模式 | 阶段 1/2/3 扫描源码时 |
| `references/JSAPI_WHITELIST.md` | wx API 白名单**完整清单**（接口侧 / 组件侧 / 不可迁移），SKILL.md C 节只列高频项 | 阶段 1 鉴权扫描 / 阶段 3 JSAPI 提取 / 阶段 5 代码生成时（C 节高频清单未覆盖目标 API 时必查） |
| `references/CODE_TEMPLATES.md` | `index.js` / 工具模块 / 接口实现 / `mcp.json` / `SKILL.md` / 配置的代码模板 | 阶段 5 代码生成 |
| `references/COMPONENT_TEMPLATES.md` | 原子组件模板（列表/详情/状态） | 阶段 5 组件生成 |
| `references/ATOMIC_COMPONENT_DESIGN.md` | 原子组件**设计规范**（尺寸档位 / 主题 / 边距 / 字体 / 布局 / 操作区） | 阶段 5 组件生成（强制前置，优先级最高） |
| `references/ATOMIC_COMPONENT_CSS.md` | 原子组件 WXSS **实现规范**（容器约束、单位换算、省略规范、禁用清单） | 阶段 5 样式编写 |
| `references/STYLE_MIGRATION.md` | 源样式提取 + 字段映射的完整工作流 | 阶段 5 组件生成前（强制前置） |
| `references/HALF_SCREEN.md` | 半屏页面（`viewCtx.openDetailPage`）API、上行消息、禁用接口/组件清单 | **按需**——仅当业务确有"详情 / 补充信息"语义时（默认不生成） |
| `references/RUNTIME_PROBE.md` | 运行时探测（automator probe）触发条件、SOP、失败兜底、结果接入。**命中 T1~T6 时必须执行，不可跳过** | 阶段 3.6——命中触发条件时**强制执行** |

---

## 硬性约束

### A. 独立分包禁止项（必须改写）

| 禁止项 | 正确做法 |
|--------|---------|
| `getApp()` | 分包内自行管理状态（模块变量 / `wx.storage`） |
| `require('../../xxx')` 引用主包/兄弟分包 / `import ... from '@/'` | 把依赖**完整拷贝**到当前分包：单 skill 私有放 `{skill}/utils/`，多 skill 复用放 `skills/_shared/` |
| 依赖主包 `wx.cloud.init()` | `utils/util.js` 中 `ensureCloudInit()` 自行初始化 |
| 依赖主包 `app.js` 初始化 storage | `utils/util.js` 中 `ensureStorageInit()` 自行初始化 |
| 从 `getApp().globalData` 读配置 | `baseUrl` / `env` 硬编码在分包 `utils/util.js` |
| 依赖主包登录态 | 每次执行接口前 `ensureLogin()` 主动走一遍登录流程 |
| 使用主包注册的全局组件 | 在分包 JSON 中重新声明 `usingComponents` |

### B. 直接终止生成的阻断规则

出现以下任一情况，立即终止生成并告知用户：

| 阻断情况 | 检测时机 | 告知文案 |
|---------|---------|---------|
| 依赖小程序插件（`plugin://` / `requirePlugin` / `app.json` 的 `plugins`） | 阶段 1/3 | "该功能依赖小程序插件，当前暂不支持自动生成，需手动接入" |
| 用户声明的能力在源码中找不到任何对应接口或页面 | 阶段 3 | "未能在源码中定位到 `<能力名>`，无法生成，请确认能力名称或补充源码" |
| 未提供可读的源码目录（只给 appid / URL / 截图） | 阶段 1 前 | "请提供小程序完整源码目录，当前无法基于非源码资产生成" |
| 所有候选实现都依赖非白名单 JSAPI 且无替代方案 | 阶段 3 | "该能力依赖非白名单 JSAPI（如 `<api>`），无法自动生成" |
| `app.json` 缺 `"lazyCodeLoading": "requiredComponents"` 配置 | 阶段 1 | "项目 `app.json` 顶层缺少 `\"lazyCodeLoading\": \"requiredComponents\"`，否则独立分包内的原子接口被小程序 AI 路由调用时无法正确加载执行。请在 `app.json` 顶层添加该字段后重新触发生成" |
| 静态分析 + 运行时探测 + 离线兜底三者全部失败 | 阶段 3 | "接口 `<api>` 无法通过静态分析、运行时探测、离线抓包任何一种方式获取真实接口信息，无法生成" |

### C. wx API 白名单（每次生成必须对照）

> 阶段 1 鉴权扫描、阶段 3 JSAPI 提取、阶段 5 代码生成时**必须对照白名单**。源码用到清单之外的 JSAPI → 按"不可迁移 JSAPI"处理。
>
> **完整清单**（接口侧 / 组件侧 / 不可迁移）见 **`references/JSAPI_WHITELIST.md`**。下文 C.1 / C.2 / C.4 仅列高频条目，覆盖业务时必查 reference 完整列表，不要凭印象。

#### C.1 接口侧白名单（高频，完整清单见 `references/JSAPI_WHITELIST.md §1`）

> "接口侧"指通过 `wx.modelContext.registerAPI()` 注册的处理函数及其依赖的纯 JS 模块——常规放在 `<skill>/apis/`（也可放 `tools/services/` / `tools/`，validator 会按这三个候选目录解析），引用的工具模块目录名（如 `utils/` / `services/` / `helpers/` / 自定义名）不限。**作用域以"是否在原子接口处理函数链路上"判定，不以目录名判定**。

| 分类 | 高频接口 |
|------|---------|
| 小程序 AI | `wx.modelContext.registerAPI`、`wx.modelContext.createSkill`（返回 `{ use, registerAPI }`）、`wx.modelContext.expireAllCards`、`wx.modelContext.getSessionId`（获取会话 ID） |
| 登录 | `wx.login`、`wx.checkSession` |
| 网络 | `wx.request`、网络状态 `getNetworkType` / `on*NetworkStatusChange` |
| 云开发 | `wx.cloud.init` / `callFunction` / `database` |
| 位置 | `wx.getLocation` / `getFuzzyLocation` / `chooseLocation` / `openLocation` |
| 系统 | `wx.getDeviceInfo`、`wx.getAppBaseInfo`、`wx.getWindowInfo` |
| 数据缓存 | `wx.{get,set,remove,clear,batchGet,batchSet}Storage`（含 `Sync`）、`wx.getStorageInfo` |
| 上传下载 | `wx.uploadFile`、`wx.downloadFile` |
| 微信支付 | `wx.requestPayment`、`wx.openBusinessView`（多种 `businessType`） |
| 订阅消息 | `wx.requestSubscribeMessage` |
| 授权设置 | `wx.authorize`、`wx.openSetting`、`wx.getSetting` |
| 设备 | `wx.makePhoneCall`、`wx.scanCode` |
| 媒体 | `wx.chooseMedia`、`wx.chooseMessageFile`、`wx.saveImageToPhotosAlbum`、`wx.getImageInfo` |
| 分享/手机号 | `wx.shareAppMessage`、`wx.getPhoneNumber`、`wx.getRealtimePhoneNumber` |
| 账号 | `wx.getAccountInfoSync`（接口与组件均可调） |

> 其他场景（人脸核身、发票、地址、微信运动、城市服务、WiFi、蓝牙/BLE、WebSocket、TCP/UDP、mDNS、传感器、加密、文件 `wx.openDocument` 等）涉及时一律查 **`references/JSAPI_WHITELIST.md §1`** 完整表，再决定能否使用。

#### C.2 组件侧白名单（高频，完整清单见 `references/JSAPI_WHITELIST.md §2`）

> "组件侧"指原子组件 `Component({})` 内的代码及其引用的纯 JS 模块。组件目录路径**强约束**为 `<skill>/components/<name>/index.{js,json,wxml,wxss}`（与 `mcp.json` 中接口的 `_meta.ui.componentPath` 严格相等），但组件 `index.js` 引用的工具模块目录名不限。

| 分类 | 高频接口 |
|------|---------|
| 小程序 AI | `getContext(this)`（支持 `reapplyApiCall` 等）、`getViewContext(this)`（支持 `preloadDetailPage` 及 `on` 事件等）、`expireAllCards` / `expirePreviousCards` |
| 网络请求 | `wx.request`（不支持，若调需声明 `scope.dynamic`） |
| 系统 | `wx.getDeviceInfo`、`wx.getAppBaseInfo`、`wx.getWindowInfo` |
| 数据缓存 | `wx.getStorage` / `setStorage` 全套（含 `Sync`） |
| 媒体/交互 | `wx.previewMedia`、`wx.showToast`、`wx.hideToast` |
| 文件/上传下载 | `wx.openDocument`、`wx.downloadFile` |
| 账号 | `wx.getAccountInfoSync` |
| 其它支持 | 位置 `openLocation`、设备 `makePhoneCall`、设置 `openSetting`、分享 `shareAppMessage`、振动、隐私授权 |
| 地图 | `this.createSelectorQuery().select('#mapId').context()` 获取 `MapContext` 后调 `MapContext.*`（**`openMapApp` 除外**），完整方法清单见 `references/JSAPI_WHITELIST.md §2` |

**组件侧禁用**：`wx.cloud.*` / 位置 / 登录 / 支付 / 其它任何业务接口（除上表已列出的能力）。组件只能收数据（接口返回的 `structuredContent` / `_meta`）、做预览、读系统信息、读写本地缓存、读账号信息、操作 `MapContext`、发声明过能力的网络请求。组件与接口处于不同 JS 上下文，**全局变量不共享**。在 `methods` / tap handler / 异步回调里主动调 `sendFollowUpMessage` / `getDimensions` 时必须现取 `wx.modelContext.getContext(this)` / `getViewContext(this)`，不要通过 `this._modelCtx` 等缓存引用调（详见 `references/COMPONENT_TEMPLATES.md`）。

#### C.3 组件配置（关联页面 + 网络能力）

每个带 `_meta.ui.componentPath` 的接口，对应组件必须在 `mcp.json` 顶层 `components[]` 中声明一条记录，**`path` 必须与该接口的 `_meta.ui.componentPath` 字符串完全相等**（含末尾 `/index`，严格相等比对）；**`relatedPage` 为必填**（关联小程序页面 path，用于卡片右上角"进入小程序"入口），**必须以 `/` 开头**（绝对路径），且去掉前导 `/` 后必须是项目 `app.json.pages[]` 中真实存在的页面，业务上无对应页面时**兜底用 `/<app.json.pages[0]>`（首页，同样带前导 `/`）**。网络能力（`permissions.scope.dynamic`）按需声明。

```json
{
  "components": [
    {
      "path": "components/order-list/index",
      "relatedPage": "/pages/order/list"
    },
    {
      "path": "components/weather-card/index",
      "relatedPage": "/pages/weather/index",
      "permissions": { "scope.dynamic": { "desc": "声明使用场景" } }
    }
  ]
}
```

运行时若需要给关联页面附加 query 参数，在组件 `created` 里现取 `viewCtx.setRelatedPage({ query })`，示例代码见 `references/CODE_TEMPLATES.md` 第四节。该约束被静态规则强制校验。

#### C.3.1 组件过期态声明（按需，非强制）

默认不生成。**仅当**源业务上存在"卡片到某时刻作废、不应再被点"语义（成交、关店、活动结束、超时）时，在 `components[]` 记录上加 `expirable: true` + 业务化 `expiredText`（默认文案"服务已过期"）。纯展示卡片不要写。代码示例与"过期触发"模板见 `references/COMPONENT_TEMPLATES.md` "卡片过期"节。

触发 API（按粒度二选一，**不要同时调**）：

- `wx.modelContext.expireAllCards()`：原子接口/组件均可调，过期所有 `expirable: true` 卡片**含自身**
- `wx.modelContext.getViewContext(this).expirePreviousCards()`：**仅原子组件可调用**（依赖组件实例 `this`），只过期此前已渲染的卡片**不含自身**

**精细过滤**（两个 API 都支持）：可传 `{ componentPaths: [...] }` 只过期匹配 `componentPath` 的卡片；加 `match: 'latest'` 只过期最近一张。`componentPath` 用**绝对路径**（含分包前缀，如 `packageA/weather-skill/components/weather-card/index`），多条 path 取并集。

声明与调用必须配对。

#### C.3.2 半屏页面（按需，非强制，**默认不生成**）

半屏页面是**原子组件内容的延伸**——仅当源业务确有"详情 / 用户补充信息"语义时挂上。

- **入口**：仅在原子组件 `methods` 内，`wx.modelContext.getViewContext(this).openDetailPage({ url })`，承载页面用项目内已有的小程序页面（**原子接口里没有 `this`，不可调**）
- **半屏内"下一步"**：原生页面 `wx.modelContext.getContext().sendFollowUpMessage(...)`（**不传 `this`**）；web-view h5 走 `WeixinJSBridge.invoke('invokeMiniProgramAPI', { name: 'sendFollowUpMessage', arg })`。上行后半屏自动关闭回小程序 AI 对话
- **场景值**：1433 / 1434；左上角关闭按钮位置用 `wx.getDetailPageCloseButtonBoundingClientRect` 适配
- **禁用清单**：跳出类（`navigateToMiniProgram` / 公众号 / 视频号 / 表情 / 客服）、页面路由（`navigateTo` / `redirectTo` / `switchTab` / `reLaunch` / `wx.router.*`）、聊天工具（`shareXxxToGroup`）、地图 `MapContext.openMapApp`、广告（`createInterstitialAd` 等 + `<ad>` `<ad-custom>` 组件）、导航组件（`<navigator>` / `<functional-page-navigator>`）—— 完整清单与示例代码见 `references/HALF_SCREEN.md`

#### C.4 不可迁移 JSAPI（接口与组件均禁用，高频示例；完整清单见 `references/JSAPI_WHITELIST.md §3`）

| 不可用 API | 替代策略 |
|-----------|---------|
| `wx.showToast` / `showModal` / `showLoading` / `showActionSheet` 等 UI 反馈 | 结果通过 `content` / `structuredContent` 回馈，小程序 AI 无 loading/modal 概念 |
| `wx.navigateTo` / `redirectTo` / `switchTab` / `reLaunch` / `navigateBack` | 删除，小程序 AI 不在页面栈内导航 |
| `wx.chooseImage` / `wx.chooseVideo` / `wx.previewImage`（老接口） | 改用 `wx.chooseMedia`（接口侧）/ `wx.previewMedia`（组件侧） |
| `wx.setClipboardData` / `getClipboardData` | 跳过 |
| `wx.getUserInfo` / `getUserProfile` | 改用登录 + 后端资料接口 |
| `wx.createSelectorQuery` / `createCanvasContext` | 接口侧不适用；组件侧仅允许通过 `this.createSelectorQuery().select('#mapId').context()` 获取 `MapContext`（详见 C.2） |
| `wx.pageScrollTo` / `wx.createAnimation` | 容器不支持滚动；动画用 CSS `transition/animation`（限 opacity/transform） |

> 其它老接口、Taro 特有不可迁移项（Hook、Pinia/Vuex、Vue setup 等）见 `references/JSAPI_WHITELIST.md §3`。

#### C.5 `button` 的 `open-type` 改写

组件内 `button` 禁用 `open-type`（`share` / `getPhoneNumber` / `getRealtimePhoneNumber`）→ 去掉 `open-type`，改 `bindtap`，在 tap handler 内调对应白名单 JSAPI（`wx.shareAppMessage` / `wx.getPhoneNumber` / `wx.getRealtimePhoneNumber`）。

#### C.6 判定规则

1. 能力**仅能**通过不可迁移 JSAPI 实现（如"扫码核验"且源码无网络 API 替代）→ 触发阻断规则 B
2. 能力核心逻辑可用网络请求实现 → 生成纯网络请求版本，丢掉不可迁移的 JSAPI 调用
3. 老接口有白名单内新接口替代（`chooseImage` → `chooseMedia`、`previewImage` → `previewMedia`）→ 自动替换

### D. 原子组件约束

- 仅支持 `tap` 事件
- **支持的内置组件**：`view`（含 `hover-class`）/ `text`（不含 `user-select`）/ `image`（仅网络地址）/ `map` / `button`（**不含 `open-type`**）/ `canvas` / `scroll-view`（**仅横向滚动 `scroll-x`，禁纵向 `scroll-y`**）
- **不支持的内置组件**：`swiper` / `swiper-item` / `input` / `textarea` / `picker` / `picker-view` / `checkbox` / `radio` / `form` / `label` / `slider` / `switch` / `editor` / `rich-text` / `icon` / `progress` / `navigator` / `web-view` / `movable-area` / `movable-view` / `root-portal` / `match-media` 等
- `button` 用 `open-type` → 按 C.5 改写为 `bindtap` + 白名单 JSAPI
- 渲染容器：宽度随屏幕，宽高比 4:1（最小高） ~ 1:1（最大高），**超出裁剪、不支持纵向滚动**（横向超长内容用 `<scroll-view scroll-x="true">` 包裹）
- 不支持打开小程序接口；不可声明为虚拟组件；组件与接口处于不同 JS 上下文，全局变量不共享
- **每个可交互元素必须绑 `bindtap`**，tap handler 上行 `content` 数组（① 单 `text` 或 ② `text` + `api/call` 组合，推荐 ②）。详见阶段 5.0.1 + `references/COMPONENT_TEMPLATES.md` "上行消息"节

---

## 执行清单（复制后勾选）

```
阶段 0 — 业务需求澄清（强制前置）
- [ ] 判定用户场景是否明确（两项判定）
- [ ] 不明确 → 最小扫描 + 引导澄清 + 等待确认
- [ ] 产出"目标业务场景 + 期望原子能力"清单

阶段 1 — 项目扫描
- [ ] 提取 app.json / app.js / project.config.json 关键字段
- [ ] 产出云开发标记 + 云环境 ID + appid + 插件使用情况
- [ ] 产出鉴权迁移清单（token key / header 方式 / 登录流程）
- [ ] 产出 storage 初始化清单

阶段 2 — 业务功能识别（用户已明确时跳过）
- [ ] 产出结构化功能清单 JSON
- [ ] 用户二次确认

阶段 3 — 接口与 JSAPI 提取 + 可行性校验
- [ ] 每个能力对应的接口/JSAPI 清单
- [ ] 完整依赖链路
- [ ] 鉴权依赖确认
- [ ] 可行性三级评定（高/中/无置信）
- [ ] 逐条检查 T1~T6 触发条件，**命中任一即标记 `requiresRuntimeProbe: true`**
- [ ] ⚠️ **`requiresRuntimeProbe: true` 时必须执行 probe，禁止标记后跳过**：环境检查（自动安装 automator）→ 通知用户 → 生成 plan.json → 执行 `scripts/probe.mjs` → 结果写入 `<源项目>/.ai-mode-skills/probe/` → 合并写入 `merged-result.json` → 接入阶段 4
- [ ] 未命中 T1~T6 但属于建议探测场景（压缩源码 / outputSchema 不确定）→ 执行 probe

阶段 4 — 原子接口设计
- [ ] 原子接口清单（含 name / description / inputSchema / outputSchema / _meta.ui.componentPath）
- [ ] API 依赖图
- [ ] storage key 清单

阶段 5 — 代码生成
- [ ] 每个原子组件符合 `ATOMIC_COMPONENT_DESIGN.md`（尺寸档位 / 背景 / 边距 / 字号 + 透明度 / 布局 / 操作区）
- [ ] 每个原子组件走完 STYLE_MIGRATION.md 的 7 步
- [ ] 每个组件内的可交互元素都绑了 bindtap，tap handler 优先上行 `{ content: [{ type: 'text', text }, { type: 'api/call', data: { name, arguments } }] }` 组合，text 是用户视角的简短中文、`name` 在 mcp.json 中存在、`arguments` 与 inputSchema 对齐；无法映射到原子接口时可退回单 `text` 形态
- [ ] skills/{skill-name}/ 目录完整（mcp.json / SKILL.md / index.js / apis/* / utils/* / components/*）
- [ ] SKILL.md 已按 `references/CODE_TEMPLATES.md` 第五节的 5 节结构与禁止项写完（路由说明，非接口手册）

阶段 6 — 配置集成
- [ ] app.json 加 agent.skills + subPackages
- [ ] project.config.json 的 packOptions.include 加 skills

收尾 — 交棒给 wxa-skills-validate
- [ ] 明确告知用户："请使用 wxa-skills-validate 做校验"
- [ ] 提示 skills 路径与 project-path
```

---

## 跨阶段跳转规则

| 场景 | 流向 |
|------|------|
| 正常主干 | 0 → 1 → (2) → 3 → 4 → 5 → 6 → 交棒 `wxa-skills-validate` |
| 用户已明确能力 | 跳过 2，0 → 1 → 3 |
| 阶段 3 命中 probe 触发条件 | 3.5 → **3.6（probe，强制执行）** → 4。⚠️ **禁止 3.5 → 4 跳过 3.6** |
| probe 失败，离线兜底成功 | 3.6 → 4（使用离线兜底数据） |
| probe + 离线兜底均失败 | 3.6 → 阻断规则 B |
| validator 反馈 T1~T6 / A/B/C/D 类错误 | 回本 skill 阶段 5 改代码 |
| validator 反馈 T7/T8（接口划分 / 依赖链路） | 回本 skill 阶段 4 重设计 |
| 任一阶段触发阻断规则 B | 立即终止，输出阻断原因 |

**核心原则**：

1. 业务场景不明确时，**必须先澄清后生成**，严禁跳过阶段 0
2. 每个阶段必须完整产出"产出物清单"中的全部项才能跳转
3. 本 skill **只生成代码**，所有校验由 `wxa-skills-validate` 负责

### 增量与重入

工作区已存在 `skills/` 产物时：

| 用户意图 | 入口阶段 | 说明 |
|---------|---------|------|
| 新增一个原子能力 | 阶段 0（轻量）→ 阶段 3 | 先澄清新能力，扫描接口并入增量清单 |
| 修改已有原子接口的行为 | 阶段 4 | 更新接口清单 → 5 → 6 → 交棒 |
| 修改组件样式/模板 | 阶段 5 | 仅改 `components/{x}/`，重新走 5 → 6 → 交棒 |
| validator T1~T6 / A/B/C/D 反馈 | 阶段 5 | 按报告定位文件，改完交棒 |
| validator T7/T8 反馈 | 阶段 4 | 重设计后 5 → 6 → 交棒 |
| 仅做验证 | **不进入本 skill**，直接给 `wxa-skills-validate` | — |

> 重入时已生成且未触及的文件保持不变，只更新受影响的文件。

---

## 阶段 0 — 业务需求澄清（强制前置）

**契约**：

| 项 | 内容 |
|---|------|
| 入口条件 | 用户发起生成请求（任何请求都必须从本阶段开始） |
| 产出物 | 判定结果 + 必要时的澄清清单 |
| 下一步 | "明确"或澄清确认完毕 → 阶段 1 |

**判定规则**（必须同时满足 2 项才算"明确"）：

| # | 判定项 | 示例 |
|---|--------|------|
| ① | 指明**具体业务名词** | "商品检索""订单管理""地址管理""签到"；非"核心功能""主要能力" |
| ② | 可推断**至少 2-3 个原子能力的粒度** | "检索商品 + 展示列表 + 查看详情"；非"业务相关" |

任一不满足 → 进入下方澄清流程。

### 不明确时的引导流程

1. **最小扫描**：只读 `app.json` 的 `tabBar.list`、`pages`（一级路径）、`subPackages.root`。**禁止**读 JS/WXML/WXSS，禁止做依赖分析。
2. **归纳候选**：基于路径关键词（见 `references/ANALYSIS_PATTERNS.md` 页面功能识别表）归纳 3~6 个候选场景。
3. **向用户提问**（一次问完，别反复打断）：
   - 希望把哪些业务场景做成小程序 AI 的 SKILL？
   - 每个场景希望暴露给小程序 AI 的原子能力大致是什么？
   - 是否涉及登录态、支付、位置、云开发等敏感能力？
4. **等用户回复后**才能进入阶段 1。严禁在用户确认前扫描源码或生成代码。

**澄清输出清单模板**：

```
目标业务场景：
  - 场景 A：<名称> → 期望原子能力：<能力 1>、<能力 2>
  - 场景 B：<名称> → 期望原子能力：<能力 3>

技术约束：
  - 是否涉及支付/登录/位置：是/否
  - 是否使用云开发：待阶段 1 扫描确认
```

---

## 阶段 1 — 项目扫描

**契约**：

| 项 | 内容 |
|---|------|
| 入口条件 | 阶段 0 产出明确的业务场景与原子能力清单 |
| 产出物 | ① 配置字段（`appid` / `pages` / `subPackages` / `tabBar` / `agent` / `packOptions`）；② 云开发标记 + 云环境 ID；③ 插件使用情况；④ 鉴权迁移清单；⑤ storage 初始化清单 |
| 下一步 | 用户已明确所有原子能力 → 阶段 3；否则 → 阶段 2 |
| 阻断条件 | 未提供源码目录 / 目标能力依赖插件 → 阻断规则 B |

### 1.1 配置扫描

读 `app.json` / `app.js` / `project.config.json`，提取 `pages` / `subPackages` / `tabBar` / 已有 `agent` / `appid` / `packOptions`；扫云开发（`wx.cloud` 调用 / `cloudfunctions/` 目录）与云环境 ID（`wx.cloud.init({ env })`）。**`lazyCodeLoading` 必检**：缺 `"lazyCodeLoading": "requiredComponents"` → 阻断规则 B（不要"代为补全"）。云开发项目同时扫 `cloudfunctionRoot/<fn>/index.js` 的入参/返回结构。

### 1.2 鉴权逻辑扫描（必做）

扫 `app.js` + 主包 request 封装（`utils/request.js` / `http.js` / `api.js`） + 登录文件，提取四项：①token/session 存取 key（关键词 `getStorageSync` + `token`/`session`/`openid`/`cookie`）②请求 header 鉴权方式（`Authorization` / `Bearer` / 自定义）③登录入口（`wx.login` / `wx.checkSession`）④换 token 接口（`wx.login` 后的 `wx.request` / 云函数）。

**迁移策略**（形成鉴权迁移清单，阶段 5 写入分包工具模块）：分包自包含完整登录能力，每次执行接口前 `ensureLogin()` 主动登录；token 存模块级变量（不写 storage——分包与主包隔离，登录态不可靠）；无鉴权接口跳过。

### 1.3 主包 storage 初始化扫描（必做）

扫 `app.js` 与主包 `.js` 中的 `wx.{set,get,clear}Storage*`，提取 `key` / `defaultValue` / `initCondition` / `sourceFile`。迁移：① `setStorageSync` 初始化值 → 分包 `ensureStorageInit()` 重建；② `getApp().globalData` 运行时缓存 → 模块级变量或按需写 storage；③ `onLaunch` 异步获取后写 storage → 分包首次调用时自行重发请求并缓存。形成 **storage 初始化清单**（与阶段 4 内部"接口间数据传递的 storage key 清单"不是同一张表）。

### 1.4 压缩代码处理

识别：单行 >500 字符 / 单双字符变量名 / 缺注释空行。处理顺序：① 优先问用户要未压缩源码；② 否则尝试 prettier 格式化后再提取；③ 格式化后关键字段仍全是 `a.b.c.d` → 阻断规则 B。**禁止盲目猜变量名**——猜出来的代码会在 validator 大量失败。

### 1.5 插件检测

扫 `app.json` 的 `plugins` 字段、页面/组件 JSON 的 `usingComponents` 中的 `plugin://` 引用。目标能力依赖插件 → 阻断规则 B。

---

## 阶段 2 — 业务功能识别（用户已明确时跳过）

**契约**：

| 项 | 内容 |
|---|------|
| 入口条件 | 阶段 1 完成 **且** 用户仅给源码未明确原子能力 |
| 产出物 | 结构化功能清单（JSON）**且已获得用户二次确认** |
| 下一步 | 用户确认 → 阶段 3 |
| 阻断条件 | 用户始终无法确认 → 停留本阶段 |

**动作**：

1. 针对阶段 0 选定的候选场景对应页面，按 `references/ANALYSIS_PATTERNS.md` 的模式分析页面用途、交互事件、数据流向
2. 从用户视角识别功能点（每个功能 = 一个原子接口）
3. 分析数据依赖（A 的返回值被 B 使用）

**产出物 JSON**（字段统一 camelCase）：

```json
[
  {
    "functionName": "检索商品",
    "pages": ["pages/items/list", "pages/search/index"],
    "sourceApis": ["GET /api/items/search"],
    "suggestedAtomicInterfaces": ["searchItems"],
    "needsComponent": true
  }
]
```

**必须将清单发给用户二次确认**才能进入阶段 3。

---

## 阶段 3 — 接口与 JSAPI 提取

**契约**：

| 项 | 内容 |
|---|------|
| 入口条件 | 已有用户确认的目标原子能力清单 |
| 产出物 | 每个能力的接口/JSAPI 清单 + 完整依赖链路 + 可行性校验结果 |
| 下一步 | 所有能力均找到对应实现 → 阶段 4 |
| 阻断条件 | 任一能力找不到对应实现 / 依赖链路含插件 → 阻断规则 B |

详细匹配模式见 `references/ANALYSIS_PATTERNS.md`。

**3.1 提取范围**：仅扫用户已确认能力对应的页面/模块，搜索网络调用（`wx.request` / `wx.cloud.{callFunction,database,callContainer}`）+ 白名单内 JSAPI（高频列表见"硬性约束 C"，完整清单见 `references/JSAPI_WHITELIST.md`）。

**3.2 依赖追踪**：对相关页面/模块的所有 `require` / `import` 递归追踪，识别完整依赖链路。阶段 5 把依赖**完整内联拷贝**到分包工具模块（`utils/util.js` 或 `utils/request.js` 等），**不要放到 `apis/` 下**——`apis/` 仅放 `mcp.json` 注册的接口。

**3.3 鉴权依赖确认**（必做）：结合阶段 1 的鉴权迁移清单，对每个目标接口确认 ① 是否需要登录态 ② token 来源（storage 直读 / 需先登录） ③ 登录方式（`wx.login` + 换 token / 其他）；标注后阶段 5 据此实现 `ensureLogin()`。

**3.4 插件依赖阻断**：依赖链路含 `requirePlugin` / `require('../plugin/')` / `plugin://` → 阻断规则 B。

**3.5 可行性三级校验**（必做）：

| 级别 | 识别特征 | 处理 |
|------|---------|------|
| ✅ 高置信 | 唯一接口/云函数，参数返回路径清晰 | 直接采用，进阶段 4 |
| ⚠️ 中置信 | 多个候选 / 参数模糊 / 依赖非白名单 JSAPI 需替代 | 列候选 + 差异 + **询问用户**后再进阶段 4（不可直接终止） |
| ❌ 无置信 | 遍历全部涉及页面仍找不到任何实现 | 阻断规则 B |

**中置信询问模板**：

```
以下原子能力在源码中存在多个候选实现，请确认选择：

能力：<能力名>
候选 1：<接口路径/云函数名> — 参数 <x>、返回 <y>（来自 pages/xxx.js 第 N 行）
候选 2：<接口路径/云函数名> — 参数 <x>、返回 <y>（来自 pages/yyy.js 第 M 行）

请回复序号（如"1"）或说明选择理由。
```

**3.6 运行时探测（probe）**：

> 命中 T1~T6 时**强制执行**，仅在环境不可用/用户拒绝时允许降级。完整 SOP 见 `references/RUNTIME_PROBE.md`。

**触发条件**（命中任一即执行）：

| # | 条件 | 原因 |
|---|------|------|
| T1 | URL 动态拼接 / 压缩不可读 | 无法确定真实 URL |
| T2 | 请求含签名/加密字段 | 无法离线复现 |
| T3 | 响应结构不可推断（T3a 透传无字段访问 / T3b 模板隐式消费） | 无法推断 outputSchema |
| T4 | 必须登录才返回业务数据 | 无法确认正常态字段 |
| T5 | 中置信且用户也不确定 | 静态匹配不足 |
| T6 | 参数传递链 >3 跳 + globalData | 静态追溯不可靠 |

建议探测（非强制）：压缩源码、字段类型不确定、T3b 可从 wxml 推断但需验证嵌套结构。

**执行流程**：

1. **静态分析产出中间结果** → 写入 `<源项目>/.ai-mode-skills/static-analysis.json`，标记各维度 `confidence: "high"/"partial"/"low"`
2. **判断是否需 probe**：存在非 `"high"` 维度或命中 T1~T6 → 需要
3. **环境检查**：确认 `miniprogram-automator` 已安装（装在 skill 的 `scripts/` 目录）、CLI 可用
4. **通知用户**（非阻断）→ 生成 `<源项目>/.ai-mode-skills/probe/plan.json` → 执行 `scripts/probe.mjs`
5. **合并结果**（见 `references/RUNTIME_PROBE.md` §5）→ 写入 `<源项目>/.ai-mode-skills/merged-result.json`
6. **降级**：probe 失败 → 离线兜底（HAR/抓包）；全失败 → 阻断规则 B

**代码注释溯源**（`apis/<name>.js` 顶部）：
```js
// [ai-mode:static] URL /api/items/search 来自 utils/request.js:42
// [ai-mode:probe] 2026-06-02 验证完整 URL https://shop.example.com/api/items/search
// [ai-mode:probe] 实际响应字段：list[].{id, name, price, img}, total(number)
```

---

## 阶段 4 — 原子接口设计

**契约**：

| 项 | 内容 |
|---|------|
| 入口条件 | `<源项目>/.ai-mode-skills/merged-result.json` 已生成（阶段 3 完成静态分析 + probe 合并后的最终结果）。⚠️ **如果 `static-analysis.json` 中存在 `requiresProbe: true` 的接口，则必须先完成 3.6 probe 执行（成功或降级兜底）后才能进入本阶段，否则禁止进入** |
| 产出物 | ① 原子接口清单；② API 依赖图；③ storage key 清单 |
| 下一步 | 三份产出物齐全 → 阶段 5 |

**4.1 技能划分**：同业务域（商品/订单/地址）原子接口聚合到同一 skill；共享 storage 上下文的接口必须在同一 skill 内；每 skill 推荐 3-8 个原子接口（更多则按子业务拆分）。

**4.2 接口字段**：每条接口含 `name`（驼峰、全局唯一）/ `description`（含内部串联操作，帮助小程序 AI 决策）/ `inputSchema`（仅小程序 AI 需从用户获取的参数；无参用 `{"type":"object","properties":{}}`）/ `outputSchema`（对应 `structuredContent`）/ `_meta.ui.componentPath`（**可选**，格式 `components/xxx/index`，纯操作型/中间态可省；声明则组件目录必须 4 文件齐全）。

> **多模态入参**：当接口需要用户上传图片（如 P 图、图像识别）时，对应 `inputSchema.properties.<field>` 加 `"format": "image"`，类型为 `string`（运行时填本地图片路径）。小程序 AI 输入框会据此识别为多模态字段、引导用户上传图片。

**4.3 按需关联组件**：返回值类型 → 组件模板对照（详见 `references/COMPONENT_TEMPLATES.md`）：列表/卡片项 → 通用列表；详情/单对象 → 详情卡片；购物车/带数量总价 → 购物车；下单成功/支付结果/操作确认 → 状态结果；单值/中间数据 → 可不配组件，需收束反馈时用状态结果（简化版）。

**4.4 产出物示例**：

```json
[{
  "skill": "business",
  "name": "searchItems",
  "title": "检索商品",
  "description": "根据关键词检索商品，返回商品列表",
  "inputSchema": { "type": "object", "properties": {} },
  "outputSchema": { "type": "object", "properties": { "items": { "type": "array" } } },
  "_meta": { "ui": { "componentPath": "components/item-list/index" } }
}]
```

API 依赖图（仅在通过 storage 传上下文时必备）：

```
searchProducts ──(storage: skills_shopping_lastSearchResult)──▶ addToCart
              └─(storage: skills_shopping_lastSearchResult)──▶ getProductDetail
```

storage key 命名统一 `skills_{skillName}_{dataName}`，列表含 `key` / 写入方 / 读取方 / 数据结构。

---

## 阶段 5 — 代码生成

**契约**：

| 项 | 内容 |
|---|------|
| 入口条件 | 阶段 4 三份产出物齐全 |
| 产出物 | 完整的 `skills/{skill-name}/`（`mcp.json` / `SKILL.md` / `index.js` / `apis/*` / `utils/*` / `components/*`） |
| 下一步 | 代码生成完成 → 阶段 6 |
| 阻断条件 | 产出物缺失 → 停留本阶段补齐 |

代码模板见 `references/CODE_TEMPLATES.md`、组件模板见 `references/COMPONENT_TEMPLATES.md`、**设计规范见 `references/ATOMIC_COMPONENT_DESIGN.md`（最高优先级）**、CSS 实现规范见 `references/ATOMIC_COMPONENT_CSS.md`。

### 5.0 三个强制前置（写任何组件 WXML/WXSS 前必须按序走完）

| 编号 | 主题 | 关键要点 | 详见 |
|------|------|---------|------|
| **5.0.0** 设计规范（最高优先级） | 尺寸/主题/边距/字体/布局/操作区 | ① 5 档宽高比 + 圆角 4px；② 主题色按 §2.1 流程从主包 `app.json`/`app.wxss` 抽（浅 + 暗都抽，wxss 顶部注释"色源=…"链路；主包 6 步都查不到才走 §2.3 兜底）；③ 边距 屏幕 16 / 卡片 12 / 元素 8·16；④ 字号 17/15/12 三档 + 同一基色 0.9/0.45/0.3 透明度分层；⑤ 主轴上下/左右布局；横向超长可用 `<scroll-view scroll-x>`，禁纵向滚动、禁 >2 列网格；⑥ ≤3 控件、主动作 ≤1、动宾文案、主按钮居右 | `references/ATOMIC_COMPONENT_DESIGN.md` |
| **5.0** 源样式提取 + 字段映射 | 7 步工作流 | 与设计规范冲突时以**设计规范为准**，仅迁移源项目品牌色与字段映射结果。**自检**：wxss 主色是 `#07c160` / `#ff4d4f` 且源页面未用，或 wxml 出现 `item.imageUrl` 但源 API 字段是 `cover`/`pic`/`thumb` — 视为"照抄模板"，必须回炉重做 | `references/STYLE_MIGRATION.md` |
| **5.0.1** 组件交互行为 | 组件是小程序 AI 的"回合出口"，不是"页面入口" | 每个组件都要同时考虑"展示什么"+"用户下一步做什么"——按 `mcp.json.apis[].description` + API 依赖图列出下一步，映射到 `mcp.json.apis[].name` **已存在**的接口；不存在则去掉按钮，**不要上行不存在的 name**。每个可交互元素绑 `bindtap` + `hover-class`，关键实体用 `data-*` 携带 | `references/COMPONENT_TEMPLATES.md` "上行消息"节 |

tap handler 优先形态 2（`text` + `api/call` 组合）：

```js
// 使用点必须现取 ctx；不要用 this._modelCtx 之类的缓存引用
wx.modelContext.getContext(this).sendFollowUpMessage({
  content: [
    { type: 'text', text: '<用户视角的简短中文，例如：选择拿铁>' },
    { type: 'api/call', data: { name: '<mcp.json 已声明的 api name>', arguments: { /* 对齐该接口 inputSchema */ } } },
  ],
})
```

只有当点击动作无法映射到原子接口时才退回形态 1（单 `text`）。每次上行 `api/call` 前打一行 `[ai-mode] {componentName} send api/call name=... args=...` console.info。**禁止**：组件内直调业务接口、单独发 `api/call` 不带前导 `text`、`arguments` 用占位值、`name` 不在 `mcp.json` 中、只展示不响应的"死"按钮、用 `this._modelCtx.sendFollowUpMessage(...)` 缓存引用调方法。

### 5.1 目录结构

```
{项目根目录}/
├── app.json                              # 含 agent.skills 注册
└── skills/                               # 独立分包（多 skill 共用）
    ├── _shared/                          # 可选：≥2 个 skill 共用的工具函数才放这里
    └── {skill-name}/
        ├── mcp.json                      # 原子接口 Schema 定义
        ├── SKILL.md                      # skill 路由说明
        ├── index.js                      # 接口注册入口
        ├── apis/                         # 原子接口实现（推荐目录；validator 兼容 tools/services/、tools/）
        ├── utils/                        # 工具模块（目录名不强制，常见 utils/services/helpers）
        └── components/{component-name}/  # index.js/json/wxml/wxss（路径强约束，与 mcp.json _meta.ui.componentPath 严格相等）
```

> **目录分层**：跨 skill **禁止** `require('../../{otherSkill}/...')`；多 skill 复用走 `skills/_shared/`（不在 `mcp.json` 注册、不调 `registerAPI`）。

### 5.2 mcp.json + 技能自身 SKILL.md + 返回值 + 日志

- **`mcp.json`**：顶层 `{ "apis": [...] }`，每项必含 `name` / `description` / `inputSchema` / `outputSchema` / `_meta.ui.componentPath`；可含 `components` 数组（声明组件网络能力，详见 C.3）。完整字段示例见 `references/CODE_TEMPLATES.md` 第四节
- **技能自身 `SKILL.md`**（**文件名严格全大写**）定位"路由说明"，**只允许 5 节按序**：能力域定位 → 触发场景（用户原话 few-shot）→ 不适用范围 → 前置条件 → 使用顺序。**通篇禁止**：驼峰 apiName / `inputSchema` / `outputSchema` / 参数表 / 返回值表 / `componentPath` / storage key / 接口依赖图 / 安装 CLI 运维。完整模板见 `references/CODE_TEMPLATES.md` 第五节
- **返回值格式**：`{ isError?, content: [{type:'text', text}], structuredContent?, _meta? }`——`content` 给 LLM 文本，`structuredContent` 对应 `outputSchema`，`_meta` 对 LLM 不可见可传 UI 组件
- **日志规范**：原子接口必打 入口 / 入参 / 请求前后 / 出口 / catch；原子组件必打 `created`/`attached` / 收到 Result / `setData` / `NotificationType.Overflow`（**必监听**，用于校验裁剪）。统一前缀 `[ai-mode]`。**日志不打够等于没日志**——真机失败看不到关键节点 → 回阶段 5 补齐重跑

---

## 阶段 6 — 配置集成

**契约**：

| 项 | 内容 |
|---|------|
| 入口条件 | 阶段 5 生成完整 `skills/{skill-name}/` |
| 产出物 | `app.json` 含 `agent.skills` + `subPackages`；`project.config.json` 的 `packOptions.include` 含 `skills` |
| 下一步 | 两份配置均已更新 → 交棒 `wxa-skills-validate` |
| 阻断条件 | 未更新配置直接交棒 → 必定失败，停留本阶段 |

配置格式见 `references/CODE_TEMPLATES.md` 第六节。关键要点：

- `agent.skills[].path` 指向 `skills/{skill-name}` 目录
- `subPackages` 中 `skills` 整体作为 `independent: true` 的独立分包；**多 skill 共用同一个分包**——新增 skill 只在 `agent.skills[]` 里追加，**不要**为每个 skill 加一条 `subPackages` 条目
- `project.config.json` 的 `packOptions.include` 需含 `{ "type": "folder", "value": "skills" }`

---

## 收尾 — 交棒给 wxa-skills-validate（强制）

阶段 6 完成后，**必须**在回复中明确告知用户：

```
代码生成与配置集成已完成。下一步请使用 `wxa-skills-validate` skill 对产物进行校验与真机验证：

- skills 路径：<abs-path>/skills
- project-path：<abs-path>（含 project.config.json 的 appid 为 <appid>）

wxa-skills-validate 会依次执行：静态校验 → cli agent tool execute → cli agent render → 交付文档。
```

**交棒步骤不可省略**。仅输出代码不算完成，必须在对话中显式提示用户切换到校验 skill。
