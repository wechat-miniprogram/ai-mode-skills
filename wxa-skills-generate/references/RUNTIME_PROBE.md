# 运行时探测（Automator Probe）

> 通过 [`miniprogram-automator`](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/automator.html) 启动开发者工具，在**源项目**上触发请求、捕获真实 URL 与响应，**用于验证 / 补齐**静态分析结果（而非替代）。
>
> 本流程只操作源项目，与 `skills/` 分包无关。

---

## 一、探测策略（probe-first 验证 + 静态分析兜底）

**默认策略**：阶段 3 选中的业务接口**默认都进 plan 探测**。静态分析负责「选哪些接口 + 生成导航/trigger plan + method/鉴权/URL 路径」，probe 负责「验证真实 URL + 抓真实响应结构」；probe 失败或环境不可用 → 回退到静态分析结果。

**为何不靠静态分析单干**：静态分析对 outputSchema 字段名/类型/嵌套常常不可靠（透传、模板隐式消费、压缩混淆）。**为何不全量纯 automator**：plan 本身依赖静态分析产出，且并非源项目所有请求都该暴露为原子接口。两者互补，不是二选一。

### 必探硬底线（命中任一即必须探测，禁止只标记不执行）

| # | 触发条件 | 静态分析为何不够 |
|---|---------|----------------|
| **T1** | URL 由多层变量动态拼接（比如`${baseUrl}${prefix}${path}?${qs.stringify(params)}`），且关键片段在压缩/混淆代码中 | 无法静态确定真实 URL |
| **T2** | 请求体含**签名 / 加密字段**（`sign / signature / token / nonce`），由运行时函数计算 | 无法离线复现 |
| **T3** | 响应结构**不可推断**，满足以下任一子条件即命中： | 无法推断 outputSchema |
|  | **T3a** 响应被原样透传（`resolve(res.data)` / `return res.data`），调用方也未解构任何字段——整个代码链路无 `res.data.xxx` / `result.xxx` / `item.xxx` 等字段访问 | 不知道后端返回什么字段 |
|  | **T3b** 响应有字段访问但无解构（`res.data.list.forEach(item => { /* 直接绑模板 */ })`），字段名被模板隐式消费而未在 JS 中显式引用 | 看不到完整字段名 |
| **T4** | 接口**必须先登录**才能返回业务数据（无登录态则 401 / 兜底数据） | 无法确认正常态字段 |
| **T5** | 阶段 3.5 可行性判定为「⚠️ 中置信」且**用户也不确定**多个候选实现 | 静态匹配不足以决断 |
| **T6** | 列表页 → 详情页参数传递链超过 3 跳，且使用 `getApp().globalData` / 全局事件总线 | 静态追溯链路过长不可靠 |

### 可降级为「仅验证」的情况

URL 是常量、参数都直接来自用户输入或已知 storage、响应结构在源码中**通过 JS 字段访问**清晰可推断（如 `res.data.items.map(x => ({ id: x.id, name: x.name }))`）——此类接口静态结果已可用，probe 仅做一次性验证；环境不可用时可直接采用静态结果，不阻断。

### T3 判定示例

| 场景 | 代码特征 | T3 判定 |
|------|---------|---------|
| 响应完全透传 | `success: r => resolve(r.data)` + 调用方只 `console.log(result)` / `showToast()` | **T3a ✅ 命中** |
| 响应透传但调用方有字段访问 | `resolve(res.data)` + 调用方 `result.list.forEach(...)` | T3 不命中（字段可推断） |
| 响应有字段访问但不解构 | `res.data.list.forEach(item => { that.setData({ items: item }) })` → wxml 中 `{{item.name}}` | **T3b ✅ 命中** |
| 响应结构清晰 | `const { items, total } = res.data; return { items: items.map(x => ({id: x.id, name: x.name})), total }` | T3 不命中 |
| 响应仅用于条件判断 | `if (res.data.success) { ... }` 无业务数据字段 | **T3a ✅ 命中**（只有 `success` 而无业务字段） |

---

## 二、技术原理

通过 `miniProgram.evaluate` 在运行时覆写 `wx.request`，在 `success`/`fail` 回调中记录请求参数 + 响应数据到全局变量。原始请求正常发出，业务不受影响。

覆写在「跳转目标页之前」注入，且微信逻辑层是单一 JS Realm、`wx` 全局共享，覆写**跨页面持久**。因此三类请求都能捕获：

1. **点击/输入触发**：`trigger` 用 `tap`/`input`/`longpress`/`callMethod`
2. **进页面自动发**（`onLoad`/`onShow`，不靠点击）：`trigger` 留空，仅靠跳转即可捕获
3. **非 UI 直发 / 串联中间请求**：`trigger` 用 `request`（直接以已知 url/参数调 `wx.request`）或 `evaluate`（执行任意取数函数体）

> 例外：`app.js` `onLaunch` 阶段在 automator 接管前已执行，其请求需用 `request`/`evaluate` 重放，或走离线兜底。

---

## 三、环境要求

| 项 | 要求 |
|---|------|
| 微信开发者工具 | 已安装、已登录、「设置 → 安全设置 → 服务端口」已开启 |
| `miniprogram-automator` | 安装到 skill 的 `scripts/` 目录（**禁止装到源项目**） |
| CLI 路径 | 环境变量 `WX_CLI_PATH` 或平台默认路径；不存在则通过 `--cli-path` 指定 |
| auto-port | 默认 `9420`，被占用时自动切换 connect 模式 |

---

## 四、调用方式

```bash
node wxa-skills-generate/scripts/probe.mjs \
  --project /path/to/source-miniprogram \
  --plan /path/to/source-miniprogram/.ai-mode-skills/probe/plan.json \
  --output /path/to/source-miniprogram/.ai-mode-skills/probe/result.json \
  [--auto-port 9420] \
  [--cli-path /path/to/cli]
```

### plan.json 格式

```json
[
  {
    "api_name": "searchMovies",
    "target_page": "/pages/movie/list",
    "matchUrlIncludes": "/api/movie/search",
    "captureWaitMs": 6000,
    "trigger": [
      { "kind": "input", "selector": "#search-input", "value": "阿凡达" },
      { "kind": "tap", "selector": "#search-btn", "delayAfterMs": 200 }
    ],
    "preSteps": [
      { "target_page": "/pages/login/index", "trigger": [{ "kind": "tap", "selector": "#login-btn" }], "waitMs": 3000 }
    ]
  },
  {
    "api_name": "submitOrder",
    "target_page": "/pages/cart/index",
    "matchUrlIncludes": ["/api/stock/check", "/api/order/create", "/api/pay/prepay"],
    "trigger": [
      { "kind": "request", "options": { "url": "https://shop.example.com/api/stock/check", "method": "POST", "data": { "skuId": 1 } } },
      { "kind": "evaluate", "code": "getCurrentPages().pop().submit()" }
    ]
  }
]
```

| 字段 | 说明 |
|------|------|
| `api_name` | 接口标识 |
| `target_page` | 目标页面路径 |
| `matchUrlIncludes` | URL 匹配关键词。**string**=单请求；**数组**=「一个能力 = 多请求」，按序逐个匹配 |
| `captureWaitMs` | 等待超时，默认 10000ms |
| `trigger` | 触发操作（可为空数组=纯靠进页面自动发请求）：`tap` / `longpress` / `input` / `callMethod` / `wait` / **`request`**（`options` 为 wx.request 参数，非 UI 直发） / **`evaluate`**（`code` 为运行时函数体字符串） |
| `preSteps` | 前置步骤（如登录），含 `target_page` / `trigger` / `waitMs` |

### result 关键字段

| 字段 | 说明 |
|------|------|
| `status` | `ok` / `partial`（多请求部分命中） / `no_request` / `url_unmatched` / `error` |
| `request` / `response` | 单请求结果（`matchUrlIncludes` 为 string 时） |
| `requests` | 多请求有序结果数组 `[{ matchUrlIncludes, request, response, matched }]`（`matchUrlIncludes` 为数组时） |
| `extras` | 未匹配关键词的其余捕获请求 |

### 失败处理

| 失败类型 | 处理 |
|---------|------|
| CLI 找不到 | 告知用户指定 `--cli-path` |
| 端口占用 | 自动切换 connect 模式 |
| 登录失效 | `preSteps` 等待扫码；超时标记 `auth_required` |
| 接口无响应 | 标记 `no_request` |
| URL 不匹配 | 标记 `url_unmatched`，列出所有捕获的请求 |

探测失败时告知用户提供 HAR/抓包数据作为离线兜底。

---

## 五、静态分析 + Probe 合并策略

probe 的作用是**补齐静态分析的缺失部分**，而非替代。

### 5.1 合并规则

| 维度 | 合并规则 |
|------|---------|
| URL | 静态只有部分路径 → probe 覆盖；静态已完整 → probe 验证 |
| method | 保留静态结果 |
| inputSchema 字段名 | 合并（静态 + probe 新发现的字段；签名字段标记为运行时计算） |
| inputSchema/outputSchema 字段类型 | probe 覆盖 |
| outputSchema 嵌套结构 | probe 补充 |
| header 鉴权 | 保留静态结果 |

### 5.2 产出文件

所有分析产物写入**源项目**的 `.ai-mode-skills/` 目录：

```
<源项目>/.ai-mode-skills/
├── static-analysis.json   ← 静态分析中间结果（带 confidence 标记）
├── merged-result.json     ← 合并后最终结果（阶段 4 读取此文件）
└── probe/
    ├── plan.json          ← 探测计划
    └── <run-id>.json      ← probe 原始结果
```

`static-analysis.json` 每条接口标记各维度 `confidence: "high" | "partial" | "low"`。probe 后按合并规则更新为 `merged-result.json`。无需 probe 时两者相同。

### 5.3 阶段 4 使用

阶段 4 读取 `merged-result.json` 设计 inputSchema / outputSchema。代码注释溯源：

```js
// [ai-mode:static] URL /api/items/search 来自 utils/request.js:42
// [ai-mode:probe] 2026-06-02 验证完整 URL https://shop.example.com/api/items/search
// [ai-mode:probe] 实际响应字段：list[].{id, name, price, img}, total(number)
```

---

## 六、流程总览

```
阶段 3 静态分析 → 写入 static-analysis.json（含选中的业务接口）
   │
   └─ 选中接口默认进 plan → 一次性批量 probe → 合并写入 merged-result.json → 阶段 4
         │
         ├─ 命中 T1~T6：必探，结果不可信则阻断
         ├─ 仅验证类：probe 成功则覆盖，环境不可用直接用静态结果
         └─ probe 失败 → 离线兜底 → 全失败则阻断
```

**核心原则**：

1. **默认探测，命中 T1~T6 必探**——选中接口默认进 plan；命中 T1~T6 或标记 `requiresProbe: true` 时**禁止只标记不执行**，否则 outputSchema 不可靠
2. **probe 验证、静态兜底**——probe 用来验证/覆盖静态结果；环境不可用或非必探接口可回退静态结果，不阻断
3. **起就一次起完**——一次性把所有需要探测的接口列入 plan 批量跑，不要反复启停
4. **probe 失败不等于阻断**——可以降级到离线兜底，只有「静态 + probe + 离线兜底全失败」才走阻断规则 B
5. **探测的是源项目，不是 skills/**——这一步在生成 skills/ 之前，与已生成的分包无关
6. **非阻断通知**——一次性告知用户将启动 automator，不等待确认；仅在环境检查失败时中断
7. **自检**：阶段 5 生成 `apis/<name>.js` 后检查顶部注释——如果只有 `[ai-mode:probe] 探测需求:...` 而没有 `验证：...` / `实际响应字段：...`，说明 probe 只标记了但未执行，必须回 3.6 补执行
