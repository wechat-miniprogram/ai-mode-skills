# 运行时探测（Automator Probe）

> 阶段 3 命中 T1~T6 时**强制执行**。通过 [`miniprogram-automator`](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/automator.html) 启动开发者工具，在**源项目**上模拟交互、捕获真实网络请求与响应，补齐静态分析的缺失部分。
>
> 本流程只操作源项目，与 `skills/` 分包无关。

---

## 一、触发条件（命中任一即强制启动）

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

### 建议（非强制）探测的场景

| 场景 | 原因 |
|------|------|
| 源码经过压缩/混淆，字段名含义难以推断 | probe 能拿到真实 URL 和响应结构，避免猜错字段 |
| outputSchema 的字段类型不确定（不知道是 string 还是 number） | probe 拿到真实数据后可精确判断类型 |
| T3b 场景能从 wxml 推断字段名 | probe 仍能验证字段类型和嵌套结构 |

### 不触发的情况

URL 是常量、参数都直接来自用户输入或已知 storage、响应结构在源码中**通过 JS 字段访问**清晰可推断（如 `res.data.items.map(x => ({ id: x.id, name: x.name }))`）。注意：仅凭 `resolve(res.data)` 透传 + 调用方无字段访问 → 属于 T3a，**必须触发**。

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

通过 `miniProgram.evaluate` 在运行时覆写 `wx.request`，在 `success`/`fail` 回调中记录请求参数 + 响应数据到全局变量。原始请求正常发出，业务不受影响。覆写仅存在于内存中，页面 reLaunch 或 automator 关闭后自动消失。

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
  }
]
```

| 字段 | 说明 |
|------|------|
| `api_name` | 接口标识 |
| `target_page` | 目标页面路径 |
| `matchUrlIncludes` | URL 匹配关键词（可选） |
| `captureWaitMs` | 等待超时，默认 10000ms |
| `trigger` | 触发操作：`tap` / `longpress` / `input` / `callMethod` / `wait` |
| `preSteps` | 前置步骤（如登录），含 `target_page` / `trigger` / `waitMs` |

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
阶段 3 静态分析 → 写入 static-analysis.json
   │
   ├─ 所有维度 high → 复制为 merged-result.json → 阶段 4
   │
   └─ 存在 partial/low 或命中 T1~T6
         │
         ├─ 生成 plan.json → 执行 probe → 合并写入 merged-result.json → 阶段 4
         │
         └─ probe 失败 → 离线兜底 → 全失败则阻断
```

**核心原则**：

1. **命中即执行，禁止跳过**——阶段 3 标记 `requiresProbe: true` 或命中 T1~T6 时，**必须执行 probe**。"标记了需要 probe 但直接进阶段 4"属于违规行为，生成的 outputSchema 将不可靠
2. **优先用 probe 验证**——对 outputSchema 的准确性至关重要，宁可多跑一次 automator，也不要在阶段 5 猜字段名导致 validator 反复修补
3. **起就一次起完**——一次性把所有需要探测的接口列入 plan 批量跑，不要反复启停
4. **probe 失败不等于阻断**——可以降级到离线兜底，只有「静态 + probe + 离线兜底全失败」才走阻断规则 B
5. **探测的是源项目，不是 skills/**——这一步在生成 skills/ 之前，与已生成的分包无关
6. **非阻断通知**——一次性告知用户将启动 automator，不等待确认；仅在环境检查失败时中断
7. **自检**：阶段 5 生成 `apis/<name>.js` 后检查顶部注释——如果只有 `[ai-mode:probe] 探测需求:...` 而没有 `验证：...` / `实际响应字段：...`，说明 probe 只标记了但未执行，必须回 3.6 补执行
