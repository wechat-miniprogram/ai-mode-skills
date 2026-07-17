# 运行时探测（Automator Probe）

> 通过 [`miniprogram-automator`](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/automator.html) 启动开发者工具，在**源项目**上触发请求、捕获真实 URL 与响应，**用于验证 / 补齐**静态分析结果（而非替代）。
>
> 本流程只操作源项目，与 `skills/` 分包无关。

---

## 一、探测策略

> **probe 和 agent 无关 **：probe 只用普通开发者工具的**自动化能力**（`cli auto` + `miniprogram-automator`，在源项目运行时覆写 `wx.request` 抓真实响应），跑的是**源项目**、与 `skills/` 分包和 agent 模式无关。只要普通开发者工具能打开源项目、开启服务端口，probe 就能跑。不要因为担心 agent 权限而跳过 probe。

阶段 3 选出的每个原子接口所用的业务 api，全部进 plan 探测。无任何免探判定，不看置信度，不看响应字段是否看起来可推断。只探这些原子接口对应的 api，不探源项目其余无关请求。

静态分析只负责选出哪些 api、生成 trigger plan、给出 method 与鉴权与 URL 路径。probe 负责抓真实 URL 与真实响应结构并落盘。

目标：静态分析对响应字段名、类型、嵌套层级常判错，透传、模板隐式消费、聚合分组都会导致层级错位。响应结构一律以 probe 抓到的真实样本为准。

probe 失败时**不得静默回退**：先按 §四 多轮重试；连续 ≥3 轮仍失败则①显式提醒用户 probe 未执行、接口未经真机验证；②保留 `response.pendingProbe`、`merged-result.json` 该 api 标 `verified:false`；③用户确认后回退静态猜测，生成代码顶部标 `[ai-mode:UNVERIFIED]`（见 §四 失败处理、§六 原则 5）。

---

## 二、技术原理

通过 `miniProgram.evaluate` 在运行时覆写 `wx.request`，在 `success`/`fail` 回调中记录请求参数 + 响应数据到全局变量。原始请求正常发出，业务不受影响。

覆写在「跳转目标页之前」注入，且微信逻辑层是单一 JS Realm、`wx` 全局共享，覆写**跨页面持久**。因此三类请求都能捕获：

1. **点击/输入触发**：`trigger` 用 `tap`/`input`/`longpress`/`callMethod`
2. **进页面自动发**（`onLoad`/`onShow`，不靠点击）：`trigger` 留空，仅靠跳转即可捕获
3. **非 UI 直发 / 串联中间请求**：`trigger` 用 `request`（直接以已知 url/参数调 `wx.request`）或 `evaluate`（执行任意取数函数体）

> 例外：`app.js` `onLaunch` 阶段在 automator 接管前已执行，其请求需用 `request`/`evaluate` 重放。

---

## 三、环境要求

| 项 | 要求 |
|---|------|
| 微信开发者工具 | 已安装、已登录、「设置 → 安全设置 → 服务端口」已开启（服务端口是 IDE HTTP 服务） |
| `miniprogram-automator` | 安装到 skill 的 `scripts/` 目录（**禁止装到源项目**） |
| CLI 路径 | 环境变量 `WX_CLI_PATH` 或平台默认路径；不存在则通过 `--cli-path` 指定 |
| automator 端口 | `cli auto --auto-port` 拉起的 **WebSocket 端口**（默认 `9420`），**与服务端口是两个不同的东西**：服务端口是 IDE HTTP 服务，automator 端口（9420）是自动化协议的 WS 端口。端口被 TCP LISTEN ≠ automator 服务就绪——残留进程会占着端口但不响应协议消息，导致 `connect` 成功但 `evaluate` timeout。必须用 `cli auto --project <源项目> --auto-port 9420` 干净拉起 |

---

## 四、调用方式

### plan 生成

| 步骤 | 谁做 | 说明 |
|------|------|------|
| 产 plan | **大项目** `SUBAGENT_PROTOCOL.md` §2.4 probe-plan subagent；**小项目** 主 agent 从 interface-spec 写 | 主 agent **禁止手搓 plan（大项目）**、禁止为 plan 重读业务 `.js` |
| 执行 | `probe.mjs` | 见下方 |

`url_unmatched` 后改 plan：仍派 `SUBAGENT_PROTOCOL.md` §2.4 重产，或改 plan.json——仍禁止为改 plan 重读业务 `.js`。

### 推荐执行顺序

> 🔴 **`cli auto` 必须带 `--project <源项目>`**。只跑 `cli auto --auto-port 9420` 常报 websocket 错误且 **9420 不会开**，后续 connect/launch 全失败。

```bash
CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"   # 或 $WX_CLI_PATH
PROJ="/path/to/source-miniprogram"

# 1) 预热：打开源项目并等待加载
"$CLI" open --project "$PROJ"
sleep 10   # 大项目可延长

# 2) 拉起自动化端口
"$CLI" auto --auto-port 9420 --project "$PROJ"
sleep 5
nc -z 127.0.0.1 9420 && echo "9420 OPEN" || echo "9420 closed"   # 必须 OPEN 才继续

# 3) connect 模式跑 probe（9420 已开时优先 connect，不要直接 launch）
#    每次执行落盘 probe/<run-id>.json（runId 由脚本生成，见文件内字段）；
#    多轮重试会产生多个 run 文件，勿覆盖、勿手写。
node wxa-skills-generate/scripts/probe.mjs \
  --project "$PROJ" \
  --plan "$PROJ/.ai-mode-skills/probe/plan.json" \
  --auto-port 9420 \
  --mode connect \
  --cli-path "$CLI"
```

**plan trigger 偏好**：优先 `tap`/`input`/`callMethod` 走真实 UI；进页 `onLoad`/`onShow` 自动发的留空 `trigger`。`evaluate` 里调 `getApp().request()` 在 automator 里常因 `getApp()` 未就绪报错——非 UI 直发优先 `kind:request`（`options` 为 `wx.request` 参数）。

连接更稳的做法：probe 期间让开发者工具保持前台；加载慢的大项目 `cli open` 后多等几秒再 `cli auto`。

> 🔴 **连接失败先多轮重试**：至少 3 轮、每轮都走「`cli open --project` → `cli auto --auto-port 9420 --project` → 确认 9420 OPEN → `probe --mode connect`」。仍失败再试 `cli quit` 后重开 IDE。连续 ≥3 轮都失败才标 UNVERIFIED 并回退静态。**单次失败即回退属违规。**

`probe.mjs` 也可一行调用（**前提是已按上方顺序把 9420 拉起**）：

```bash
node wxa-skills-generate/scripts/probe.mjs \
  --project /path/to/source-miniprogram \
  --plan /path/to/source-miniprogram/.ai-mode-skills/probe/plan.json \
  [--output /path/to/source-miniprogram/.ai-mode-skills/probe/<run-id>.json] \
  [--auto-port 9420] \
  [--mode connect] \
  [--cli-path /path/to/cli]
```

> 省略 `--output` 时，脚本自动写入 `<project>/.ai-mode-skills/probe/<runId>.json`（`runId` 为 UTC 时间戳字符串，写在 JSON 根字段）。**禁止** agent 手写/覆盖 probe 目录下的 json 来伪造探测结果。

### probe run 文件 vs merged-result.json

| 文件 | 谁写 | 有几个 | 用途 |
|------|------|--------|------|
| `probe/<run-id>.json` | **`probe.mjs` 唯一** | **每执行一次 probe 一个**；≥3 轮重试会有多个 run 文件 | 原始 automator 捕获：`results[]` 含 request/response/status；供 agent **读取**后回填 interface-spec |
| `merged-result.json` | **主 agent**（阶段 3.7 合并步骤） | **每个项目一份**（覆盖更新） | 把 auth-spec + 各 interface-spec + **最新成功 probe 样本** 合成阶段 4 唯一输入；含 `verified:true/false`、合并后的 request/response schema |

流程：`interface-spec`（静态，`pendingProbe`）→ `plan.json` → **N 次** `probe/<run-id>.json` → agent 读**最佳/最新成功** run → 回填 interface-spec → 写 **一份** `merged-result.json` → 阶段 4。

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
| 端口被占但协议不响应 | `probe-lib.mjs` 自动检测并报错；用 `cli auto --project <源项目> --auto-port 9420` 重新拉起 |
| 登录失效 | `preSteps` 等待扫码；超时标记 `auth_required` |
| 接口无响应 | 标记 `no_request` |
| URL 不匹配 | 标记 `url_unmatched`，列出所有捕获的请求 |

**自动化不可用时的降级**（`cli auto` 端口拉不起 / ws 连接被拒 / 协议验证失败）：

1. **≥3 轮重试**：每轮 `cli open --project <源项目>` → `cli auto --auto-port 9420 --project <源项目>` → 确认 9420 OPEN → `probe.mjs --mode connect`；仍失败再 `cli quit` 重开 IDE。单次失败即回退属违规。
2. **连续 ≥3 轮失败后**：提醒用户"probe 未执行 → 接口响应结构未经真机验证"，`interface-spec` 保留 `response.pendingProbe:true`、`merged-result.json` 标 `verified:false`、`apis/<name>.js` 顶部写 `[ai-mode:UNVERIFIED]`。
3. **禁止**伪造 probe run 文件、禁止把未验证当已验证交付。

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

**读 probe run（合并时）**：用 `jq` 按 `api_name` 抽取，禁止整文件 `read`。大数组只保留 `[0]` 看 item 形状；写入 `merged-result.json` 的仅为字段路径/类型摘要，禁止拷贝全量 `response.data`。

```bash
jq '.results[] | select(.api_name=="<api>") | .response.data | walk(if type=="array" then .[:1] else . end)' probe/<run-id>.json
```

### 5.2 产出文件

所有分析产物写入**源项目**的 `.ai-mode-skills/` 目录：

```
<源项目>/.ai-mode-skills/
├── auth-spec.md             ← 鉴权事实层（阶段 1.2）
├── auth-spec.snippets.txt   ← 鉴权 verbatim 代码片段
├── interface-spec.<cap>.md  ← 逐能力静态分析层（阶段 3.2，含 response.pendingProbe）
├── merged-result.json       ← auth-spec + 各 interface-spec 合并、probe 回填后的最终结果（阶段 4 读取此文件）
└── probe/
    ├── plan.json            ← 探测计划（大项目 `SUBAGENT_PROTOCOL.md` §2.4 subagent 产；小项目主 agent 从 interface-spec 写）
    ├── <id>.json   ← 示例：单次 probe.mjs 执行的原始结果（文件名 = JSON 内 runId）
```

各 `interface-spec.<cap>.md` 的 `response` 初始为 `pendingProbe:true`；probe 成功后 agent 读对应 `probe/<run-id>.json` 回填真实响应、清除该标记，再与 auth-spec **合并写一份** `merged-result.json`（阶段 4 只读此文件，不直接读 probe run）。probe 全失败时用静态猜测写 `merged-result.json` 并标 `verified:false`。

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
阶段 3.2 逐能力静态分析 → 各 interface-spec.<cap>.md（含 api_name、response.pendingProbe）
   │
   ├─ 大项目：`SUBAGENT_PROTOCOL.md` §2.4 probe-plan subagent → probe/plan.json
   │  小项目：主 agent 从 interface-spec 写 plan
   │
   └─ 选出的每个 api 全部进 plan → 一次性批量 probe → 落盘 probe/<run-id>.json
        → 回填 interface-spec.response + 合并 auth-spec 落盘 merged-result.json → 阶段 4
         │
         ├─ probe 成功：以真实样本覆盖 outputSchema
         └─ probe 失败：先按 3 轮循环重试拉起 → 连续 ≥3 轮仍失败则提醒用户+保留 pendingProbe/verified:false+用户确认后回退静态并标 [ai-mode:UNVERIFIED]
```

**核心原则**：

1. **默认全探，无判定开关**——选出的每个原子接口所用 api 一律进 plan，不按置信度或"字段是否看起来可推断"决定要不要探。只探这些 api，不探源项目其余无关请求
2. **响应结构以真实样本为准**——outputSchema / 字段归一化的依据只能是 probe 抓到的真实响应，**不允许**纯静态推断定稿（聚合分组、透传、模板隐式消费都易判错层级）
3. **两档落盘、职责分离**——`probe.mjs` 每次执行写 `<源项目>/.ai-mode-skills/probe/<run-id>.json`（可多个）；主 agent 合并后写**一份** `merged-result.json`；阶段 4 **只读** `merged-result.json`，禁止跳过合并直接读 probe run 设计 schema
4. **一次性探测全部接口**——一次性把所有 api 列入 plan 批量跑，不要反复启动开发者工具
5. **连接失败先多轮重试再谈降级**——按 §四降级流程执行，单次失败即回退属违规
6. **探测的是源项目，不是 skills/**——这一步在生成 skills 分包之前，与已生成的分包无关
7. **直接执行**——直接启动 automator / 开发者工具执行 probe，无需通知或等待用户确认；仅在环境检查失败时中断
8. **自检**：阶段 5 生成 `apis/<name>.js` 后检查顶部注释——凡有响应字段映射却没有 `[ai-mode:probe] 实际响应字段：...`（只有 `[ai-mode:static]` 或只有 `探测需求:...`），即 probe 未实际执行/未落盘，必须回阶段 3.7 补执行
