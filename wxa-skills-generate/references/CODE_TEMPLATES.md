# 代码生成模板

> 第五阶段使用。包含 `utils/util.js` / 原子接口 / `index.js` / `mcp.json` / `SKILL.md` 的代码模板，以及 `app.json` / `project.config.json` 配置片段。

> ⚠️ **独立运行原则**：所有代码运行在独立分包 `skills/` 中，与主包 JS 环境完全隔离。不得出现 `getApp()`、跨包 `require/import`。工具函数、配置、初始化逻辑必须自包含在技能目录内。
>
> ⚠️ **目录分层原则**：工具函数统一放在 `utils/` 目录下，与 `apis/` **同级**；`apis/` 目录只存放**在 `mcp.json` 中注册的原子接口**，不要混入工具函数，以保持接口与工具层的清晰边界。
>
> ⚠️ **日志必写原则**：原子接口和原子组件在关键节点（入口/入参/请求前后/出口/catch；组件的 created/setData/attached）打 `[ai-mode]` 前缀的 `console.info` 日志，这是真机验证失败时唯一的排查依据。

## 目录

- [一、utils/util.js 工具函数](#一utilsutiljs-工具函数)
  - [1.1 必选：返回值工厂](#11-必选返回值工厂每个-skill-都需要)
  - [1.2 按需：云开发初始化](#12-按需云开发初始化使用-wxcloud-时才需要)
  - [1.3 按需：主包 storage 初始化迁移](#13-按需主包-storage-初始化迁移仅当主包-appjs-有写-storage-默认值时才需要)
  - [1.4 按需：HTTP 请求](#14-按需http-请求使用-wxrequest-时才需要)
  - [1.4.1 按需：登录鉴权](#141-按需登录鉴权接口需要登录态时才需要)
  - [1.5 按需：JSAPI 封装](#15-按需jsapi-封装仅白名单内)
  - [1.6 按需：接口间数据传递](#16-按需接口间数据传递)
- [二、原子接口模板](#二原子接口模板)
- [三、index.js 注册模板](#三indexjs-注册模板)
- [四、mcp.json 模板](#四mcpjson-模板)
- [五、SKILL.md 模板](#五skillmd-模板)
- [六、app.json + project.config.json 配置](#六appjson--projectconfigjson-配置)

---

## 一、utils/util.js 工具函数

`utils/util.js` 是分包的工具层，位于 `utils/` 目录下，与 `apis/` 同级。按实际需要**按需组合**以下能力块，只保留真正用到的部分。**不要把所有块都写进来**。

> 若工具函数较多，可以在 `utils/` 下再拆分文件（如 `utils/request.js`、`utils/login.js`），但**禁止把这些工具函数放到 `apis/` 下**——`apis/` 只能放 `mcp.json` 注册的原子接口。

### 1.1 必选：返回值工厂（每个 skill 都需要）

```javascript
// utils/util.js — 始终包含
function errorResult(msg) {
  return { isError: true, content: [{ type: 'text', text: msg }] }
}

function successResult(msg, structuredContent) {
  const result = { isError: false, content: [{ type: 'text', text: msg }] }
  if (structuredContent !== undefined) result.structuredContent = structuredContent
  return result
}

module.exports = { errorResult, successResult /* 按需追加其它导出 */ }
```

### 1.2 按需：云开发初始化（使用 `wx.cloud.*` 时才需要）

```javascript
let _cloudInited = false
function ensureCloudInit() {
  if (_cloudInited) return
  wx.cloud.init({ env: '{从 app.js 提取的实际 env ID}', traceUser: true })
  _cloudInited = true
}
```

### 1.3 按需：主包 storage 初始化迁移（仅当主包 app.js 有写 storage 默认值时才需要）

若主包 `app.js` 中存在 `wx.setStorageSync('key', defaultValue)` 初始化语句，需在分包内迁移，否则跳过此块：

```javascript
let _storageInited = false
function ensureStorageInit() {
  if (_storageInited) return
  // 从主包 app.js 扫描到的 setStorageSync 语句，按原样迁移到此处
  _storageInited = true
}
```

### 1.4 按需：HTTP 请求（使用 `wx.request` 时才需要）

鉴权方式**完全以主包 request 封装为准**——有些项目用 header token、有些用 cookie、有些用签名、有些无鉴权——生成时读主包 `utils/request.js` 确认后再写，不要套固定模式。

token 由 `ensureLogin()` 获取后保存在**模块级变量**中，`request` 函数从该变量读取附加到 header，不从 storage 读取。

```javascript
const BASE_URL = '{从主包提取的 baseUrl}'
let _token = ''  // 模块级变量，由 ensureLogin() 写入

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: options.url.startsWith('http') ? options.url : BASE_URL + options.url,
      header: Object.assign(
        { '{鉴权 header 字段名}': _token },  // 按主包实际方式替换
        options.header
      ),
      success(res) {
        res.statusCode >= 200 && res.statusCode < 300
          ? resolve(res.data)
          : reject(new Error(`HTTP ${res.statusCode}`))
      },
      fail: reject
    })
  })
}
```

### 1.4.1 按需：登录鉴权（接口需要登录态时才需要）

> **何时需要**：若主包中该业务接口的 `wx.request` 携带了 token / session / cookie 等鉴权信息，则分包必须实现 `ensureLogin()`，并在每个需要鉴权的原子接口入口处 `await ensureLogin()`。

**实现规则**（完全以主包登录逻辑为准，不要套固定写法）：

- 分包**不依赖 storage 中的登录态**，每次冷启动都重新走一遍登录流程
- 登录流程与主包完全相同（`wx.login` 换 token），从主包源码中提取接口路径、参数、返回字段后在分包内还原
- 登录成功后将 token 保存到**模块级变量**（如 `let _token = ''`），供同一进程内的后续请求复用；不写 storage
- 需防并发重复登录（多个接口同时调用 `ensureLogin` 时只发起一次登录请求）
- 关键节点打 `[ai-mode]` 前缀日志

> **使用方式**：在需要鉴权的原子接口文件入口处 `await ensureLogin()` 后再发起业务请求。

### 1.5 按需：JSAPI 封装（仅白名单内）

按实际接口自行封装，参考主包实现。常见示例：`wx.getLocation` / `wx.getFuzzyLocation` / `wx.openLocation` / `wx.chooseLocation` / `wx.requestPayment` / `wx.requestVirtualPayment` / `wx.openBusinessView`（仅 `wxpayScoreUse`/`wxpayScoreEnable`）/ `wx.login` / `wx.checkSession` / `wx.authorize` / `wx.shareAppMessage` / `wx.getPhoneNumber` / `wx.getRealtimePhoneNumber` / `wx.chooseMedia` / `wx.chooseMessageFile` / `wx.startFacialRecognitionVerify` / `wx.requestSubscribeMessage` / `wx.cloud.database`。**完整白名单见 `references/JSAPI_WHITELIST.md`**（`SKILL.md` 的"硬性约束 C"节只列高频项）。不要模板化复制——形式由主包实现决定。

### 1.6 按需：接口间数据传递

接口间数据传递有两种方式，**由业务逻辑决定用哪种，不要默认引入 storage 传递**：

- **直接通过 `inputSchema` 参数传递**：下游接口在 `mcp.json` 的 `inputSchema` 中声明所需字段，由小程序 AI 从上游 `structuredContent` 里提取后传入，分包内无需写任何 storage 代码——这是优先选项。
- **通过 `wx.setStorageSync` 传递**：仅当下游接口无法在 `inputSchema` 中描述依赖（例如需要静默传递大量中间态）时使用。key 命名格式 `skills_{skillName}_{dataName}`。

```javascript
// 仅在确认需要 storage 传递时才加入 utils/util.js
function setStepContext(key, value) { wx.setStorageSync(key, value) }
function getStepContext(key, defaultValue) { return wx.getStorageSync(key) || defaultValue }
function removeStepContext(key) { wx.removeStorageSync(key) }
```

---

## 二、原子接口模板

每个原子接口文件遵循以下骨架，内部逻辑完全由主包对应业务决定，不要套固定范式。

> ⚠️ **封装层强制复用**：网络请求**必须**通过 `require('../utils/request')` 的 `request()` 发起，禁止 API 文件中直接 `wx.request` 或自行拼 URL/header/query。API 文件只负责业务参数整理 + 响应归一化。
>
> ⚠️ **响应字段类型安全**：API 响应的数组字段调数组方法前加 `(x || [])` 或 `Array.isArray(x) ?` 保护，防 `TypeError` 崩溃。
>
> ⚠️ **响应状态码类型保护**：主包后端常返回字符串型状态码（如 PHP 接口的 `"ret_code":"1"`），不要写 `res.ret_code !== 1` 这种严格类型比较。生成代码时应显式归一化：`Number(res.ret_code) !== 1` 或 `String(res.ret_code) !== '1'`。

```javascript
// apis/{apiName}.js
const { errorResult, successResult } = require('../utils/util')
// 按需追加其它 utils 导入，如 require('../utils/request')

async function {apiName}(params = {}) {
  console.info('[ai-mode] {apiName} 入口, params=', JSON.stringify(params))
  try {
    // 1. 参数校验（仅校验真正必须的字段）
    // 2. 执行业务逻辑（网络请求 / JSAPI / storage 读写，完全对照主包）
    // 3. 整理返回值，返回 successResult
    return successResult('描述结果的一句话', { /* structuredContent */ })
  } catch (err) {
    console.error('[ai-mode] {apiName} 出错:', err.message)
    return errorResult(`操作失败: ${err.message}`)
  }
}

module.exports = {apiName}
```

> **生成原则**：
> - 业务逻辑完全以主包为准，不要根据模板臆造字段名、接口路径或 storage key。
> - 只校验真正影响业务的必填参数，不要过度防御。
> - 有需要传递数据给下游的，先考虑 `outputSchema` + 小程序 AI 传参；确实需要 storage 传递时再用。

---

## 三、index.js 注册模板

### 3.1 基础模式（无中间件）

```javascript
// skills/{skillName}/index.js

// 按 mcp.json 中 apis[].name 一一注册，三者必须完全一致：
// require 导入名 = registerAPI 第一参数 = mcp.json name
const {apiName1} = require('./apis/{apiName1}')
const {apiName2} = require('./apis/{apiName2}')

wx.modelContext.registerAPI('{apiName1}', {apiName1})
wx.modelContext.registerAPI('{apiName2}', {apiName2})
```

### 3.2 中间件模式（推荐用于需要统一登录态 / 上报 / 错误监听的场景）

Koa 式洋葱模型的中间件，每个原子接口都会执行一遍，可用于统一登录态、统一上报和错误监听等场景。

```javascript
// skills/{skillName}/index.js
const {apiName1} = require('./apis/{apiName1}')
const {apiName2} = require('./apis/{apiName2}')

const skill = wx.modelContext.createSkill('skills/{skillName}')

// 注册中间件（按需组合，执行顺序 = 注册顺序）
skill.use(async (ctx, next) => { // ← 中间件 1：鉴权
  console.info('[ai-mode] middleware: ensureLogin')
  await next()
})
skill.use(async (ctx, next) => { // ← 中间件 2：上报
  try {
    await next()
  } finally {
    console.info('[ai-mode] middleware: report', { name: ctx.name })
  }
})

// 注册原子接口（等同于 wx.modelContext.registerAPI）
skill.registerAPI('{apiName1}', {apiName1})
skill.registerAPI('{apiName2}', {apiName2})
```

**中间件 context 属性**：
- `ctx.name` — 原子接口名称
- `ctx.skillPath` — 中间件执行时的 skillPath
- `ctx.arguments` — 传递给原子接口的参数的**副本**，修改后不影响传递给原子接口的真实参数值

> **使用原则**：当多个原子接口有相同的前置逻辑（如 `ensureLogin()`、统一错误捕获）时，优先用中间件模式替代在每个接口入口处重复调用。中间件与 `ensureLogin()` 二选一，不要混用。

---

## 四、mcp.json 模板

```json
{
  "apis": [
    {
      "name": "{apiName}",
      "description": "{完整描述接口行为，含内部操作与前置依赖}",
      "_meta": { "ui": { "pagePath": "/pages/{page}/detail" } },
      "inputSchema": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
          "{param}": { "type": "string", "description": "{参数含义}" }
        },
        "required": ["{param}"],
        "additionalProperties": false
      },
      "outputSchema": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      }
    }
  ]
}
```

**多模态入参（接收用户上传图片）**：当接口需要图片时，对应字段类型为 `string` 并加 `"format": "image"`，运行时填本地图片路径；小程序 AI 输入框据此识别为多模态字段并引导用户上传。

```json
{
  "name": "editPhoto",
  "description": "帮用户 P 图",
  "inputSchema": {
    "type": "object",
    "properties": {
      "imagePath": { "type": "string", "format": "image", "description": "本地图片路径" },
      "query":     { "type": "string", "description": "用户的 P 图需求" }
    },
    "required": ["imagePath", "query"]
  }
}
```

> `components[]` **仅在用户明确要求生成原子组件时**才有（网络能力 / `expirable` + `expiredText`，见 `SKILL.md` C.3 / C.3.1）；`components[].path` 必须与对应接口的 `_meta.ui.componentPath` 字符串完全相等。`expirable` / `expiredText` 默认不写，仅在源业务确实有"卡片作废"语义时才声明，并在代码里相应调用 `wx.modelContext.expireAllCards()`（接口或组件均可，含自身）或 `wx.modelContext.getViewContext(this).expirePreviousCards()`（**仅原子组件可调用**，不含自身）。进小程序见下方 "handoff 接力页"（`_meta.ui.pagePath` + 返回值 `handoff`）。

### handoff 接力页（进小程序的主要方式，见 `SKILL.md` C.3.3）

默认只返回文本 + 小程序卡片，用户点卡片后由平台 handoff 进接力页。给"执行完停下等用户确认"类接口配 `pagePath` 并在返回值加 `handoff`。

**① `mcp.json`**：接口 `_meta.ui` 加 `pagePath`（接力页 path，不含 query）：

```json
{
  "apis": [
    {
      "name": "queryDrugUsage",
      "_meta": {
        "ui": {
          "pagePath": "/pages/drug/detail"
        }
      }
    }
  ]
}
```

**② 原子接口返回值**：顶层（与 `content` / `structuredContent` 同级）加 `handoff`，**兼容对象（立即模式）与函数（延迟模式）两种形态**：

```js
async function queryDrugUsage({ name }) {
  const drug = await fetchDrug(name)
  return {
    isError: false,
    content: [{ type: 'text', text: `已查询到${drug.name}用法用量` }],
    structuredContent: drug,
    // 函数模式（延迟）：入参为对象，data.result = 模型修改后的完整 result
    handoff: ({ result }) => ({
      query: { drugId: result.structuredContent.drugId },   // 对象：页面 query 键值对
      payload: result.structuredContent,                    // 可选：接力页首屏加速
      card: { title: `${result.structuredContent.name} · 用法用量` },  // 可选：卡片展示信息
    }),
    // —— 或者无需模型筛选时，直接用对象（立即模式，链路更短、更快）：
    // handoff: { query: { drugId: drug.drugId }, payload: drug, card: { title: `${drug.name} · 用法用量` } },
  }
}
```

> 形态选择：无需模型改动 result → 用**对象**（立即模式，更快）；需要用模型修改后的 result 拼 query/payload → 用**函数**（延迟模式，入参 `{ result }`，`result` 为模型修改后的完整 result）。

**③ 主包 `app.js`**：`onLaunch` 内注册（须早于 handoff 触发的 `onBeforeAppRoute`）：

```js
App({
  onLaunch() {
    wx.onAgentHandoff(({ pageId, path, query, payload }) => {
      this.globalData.agentHandoffs = this.globalData.agentHandoffs || {}
      this.globalData.agentHandoffs[pageId] = { path, query, payload }
    })
  },
})
```

> 回调参数：`pageId`（目标页实例 ID，用于按页投递 payload）/ `path`（平台实际打开的 path，不含 query）/ `query`（对象，页面 query 键值对，同 `handoff.query`）/ `payload?`。仅 handoff 场景触发，普通打开小程序不触发；`wx.offAgentHandoff()` 取消监听。

**④ 接力业务页**：`onLoad(query)` 消费——`query` 为对象（键值对），`payload` 有则先 `setData` 加速首屏：

```js
Page({
  onLoad(query) {
    const handoffs = getApp().globalData.agentHandoffs || {}
    const handoff = handoffs[this.getPageId()]
    delete handoffs[this.getPageId()]

    if (handoff && handoff.payload) this.setData({ drug: handoff.payload })

    const drugId = query.drugId
    if (drugId) this.loadDrugDetail(drugId).then(drug => this.setData({ drug }))
  },
})
```

> `wx.openAgent` / `wx.navigateBackAgent` 当前会失败，接力页勿依赖"打开/返回 Agent 对话"。

---

## 五、SKILL.md 模板

> **定位**：SKILL.md 是技能的**路由说明**，目标 = 让调度方在最少 token 内做对三件事：① 判断"用户当前需求该不该路由到我"；② 判断"我能/不能做什么"；③ 在多 skill 共存时不抢别人的活。

**写入内容清单**（只能写下表中的 5 类，按顺序排列；超出此清单一律不写）：

| # | 章节 | 写什么 | 不写什么 | 何时省略 |
|---|------|--------|----------|---------|
| 1 | 能力域定位 | 一句话锚点，位于 `# 标题` 下首行 | 多段落叙事、emoji、口号 | 不可省略 |
| 2 | 触发场景 | 3~6 条**用户原话 few-shot**，每条是一句真实用户口吻的自然语言（口语、片段、含俚语都行），覆盖不同表达方式 | 关键词清单；技术术语；照抄 `mcp.json.apis[].description` | 不可省略 |
| 3 | 不适用范围 | 反例短句（"xx 诉求 → 不在本技能范围 / 由 yy 技能处理"） | 自我否定式废话 | 项目内无易混淆兄弟 skill 时整节省略 |
| 4 | 前置条件 | 影响是否可路由的硬约束（已登录 / 授权 / 区域 / 账号资质） | 实现细节、token 来源、storage 初始化等技术内容 | 无前置条件时整节省略，**不要写"无"占行** |
| 5 | 使用顺序 | 能力之间业务依赖的**自然语言短句**（"加入购物车前需先检索到具体商品"） | 流程图、依赖图、表格、apiName、storage key | 各能力相互独立时整节省略 |

**硬性约束**（通篇生效，命中即重写）：

- 不出现驼峰 apiName，所有章节均为业务中文
- 不出现 `inputSchema` / `outputSchema` / 参数表 / 返回值表 / `_meta.ui.componentPath` / 组件路径 / JSON Schema 片段（接口契约只在 `mcp.json` 单一来源维护）
- 不出现 storage key 清单 / 接口依赖图（图状或表格化的形式；这些是阶段 4 的内部产出物）
- 不写安装 / CLI / 部署 / 如何使用本技能 等运维文档

```markdown
# {技能业务名，中文，例：商品检索与下单}

{一句话能力域定位。例：基于商品库进行关键词检索、查看详情、加入购物车并完成下单的能力集合。}

## 触发场景
用户原话举例（路由命中本技能）：
- "帮我搜下有没有那种轻便的{品类}"
- "我想买{品牌}的，有什么推荐"
- "把刚才那个加到购物车"
- "结一下账吧"
- ...（3~6 条；用真实用户口吻，覆盖不同表达方式；不要写关键词清单或技术术语）

## 不适用范围
- {反例 1，例：售后退款相关诉求 → 不在本技能范围}
- {反例 2，例：会员积分查询 → 由会员技能处理}
- ...（项目内无易混淆兄弟 skill 时整节省略）

## 前置条件
- {影响是否可路由的硬约束，例：需用户已登录 / 需定位授权 / 仅 xx 城市可用}
- ...（无前置条件时整节省略；不要写"无"占行）

## 使用顺序
- {自然语言短句描述能力之间的业务依赖，例：加入购物车前需先检索到具体商品；查看订单详情需先有订单号}
- ...（各能力相互独立时整节省略）
```

---

## 六、app.json + project.config.json 配置

```json
{
  "lazyCodeLoading": "requiredComponents",
  "agent": {
    "skills": [{ "name": "...", "description": "...", "path": "skills/..." }]
  },
  "subPackages": [{
    "root": "skills",
    "independent": true,
    "pages": []
  }]
}
```

> ⚠️ **`lazyCodeLoading` 由开发者在使用 skill 前自行添加，generate 不要写入此字段**（只用于展示完整目标形态）。阶段 1 扫描时若 `app.json` 顶层缺该字段，按阻断规则 B 终止流程并提示用户去补；不要"代为补全"或"忽略继续"。本次 generate 的写入范围只有 `agent` 和 `subPackages` 两块。

> **多 skill 共用一个独立分包**：`subPackages` 里 `root: "skills"` 指**外层目录**，多个 skill（`skills/foo/`、`skills/bar/`）整体作为**同一个**独立分包。新增 skill 时只在 `agent.skills[]` 数组里追加一项 `{ name, description, path: "skills/<新>" }`，**不要**为每个 skill 再加一条 `subPackages` 条目。

`project.config.json` 确保 `packOptions.include` 含 `{ "type": "folder", "value": "skills" }`。
