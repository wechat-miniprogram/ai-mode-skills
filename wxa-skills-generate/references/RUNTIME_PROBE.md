# 运行时探测（Automator Probe）

> 阶段 3「接口与 JSAPI 提取」命中 T1~T6 触发条件时**强制执行**。当源码静态分析无法得出可靠结论时，使用 [`miniprogram-automator`](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/automator.html) 启动微信开发者工具、在**源项目页面**上模拟用户交互、捕获**真实**的网络请求与响应，作为阶段 4 设计原子接口的依据。
>
> ⚠️ 本流程**只在源项目本身**操作，与生成中的 `skills/` 分包无关。探测的目标是**摸清源接口的真实形态**，而不是验证已生成的技能。
>
> ⚠️ **硬性约束**：阶段 3 标记 `requiresRuntimeProbe: true` 或命中 T1~T6 时，**必须执行本流程，禁止跳过直接进入阶段 4**。只有在 probe 执行失败（环境不可用/超时/用户明确拒绝）后，才允许降级到离线兜底。

---

## 一、何时触发（命中任一即**强制**启动）

| # | 触发条件 | 静态分析为何不够 |
|---|---------|----------------|
| **T1** | URL 由多层变量动态拼接（`${baseUrl}${prefix}${path}?${qs.stringify(params)}`），且关键片段在压缩/混淆代码中 | 无法静态确定真实 URL |
| **T2** | 请求体含**签名 / 加密字段**（`sign / signature / token / nonce`），由运行时函数计算 | 无法离线复现 |
| **T3** | 响应结构**不可推断**，满足以下任一子条件即命中： | 无法推断 outputSchema |
|  | **T3a** 响应被原样透传（`resolve(res.data)` / `return res.data`），调用方也未解构任何字段——整个代码链路无 `res.data.xxx` / `result.xxx` / `item.xxx` 等字段访问 | 不知道后端返回什么字段 |
|  | **T3b** 响应有字段访问但无解构（`res.data.list.forEach(item => { /* 直接绑模板 */ })`），字段名被模板隐式消费而未在 JS 中显式引用 | 看不到字段名 |
| **T4** | 接口**必须先登录**才能返回业务数据（无登录态则 401 / 兜底数据） | 无法确认正常态字段 |
| **T5** | 阶段 3.5 可行性判定为「⚠️ 中置信」且**用户也不确定**多个候选实现 | 静态匹配不足以决断 |
| **T6** | 列表页 → 详情页参数传递链超过 3 跳，且使用 `getApp().globalData` / 全局事件总线 | 静态追溯链路过长不可靠 |

### 建议（非强制）探测的场景

即使未严格命中 T1~T6，以下情况也**建议**运行 probe 以提高 outputSchema 的准确性：

| 场景 | 原因 |
|------|------|
| 源码经过压缩/混淆，字段名含义难以推断 | probe 能拿到真实 URL 和响应结构，避免猜错字段 |
| 接口的响应字段可能在 wxml 中使用但 JS 中未显式引用 | 属于 T3b 范畴，但即使能从 wxml 推断字段名，probe 仍能验证字段类型和嵌套结构 |
| outputSchema 的字段类型不确定（如不知道是 string 还是 number） | probe 拿到真实数据后可以精确判断类型 |

### 不触发的情况

URL 是常量、参数都直接来自用户输入或已知 storage、响应结构在源码中**通过 JS 字段访问**清晰可推断（如 `res.data.items.map(x => ({ id: x.id, name: x.name }))`）。注意：仅凭 `resolve(res.data)` 透传 + 调用方无字段访问 → 属于 T3a，**必须触发**。

### T3 判定示例

| 场景 | 代码特征 | T3 判定 |
|------|---------|---------|
| 响应完全透传 | `success: r => resolve(r.data)` + 调用方只 `console.log(result)` / `showToast()` | **T3a ✅ 命中** |
| 响应透传但调用方有字段访问 | `resolve(res.data)` + 调用方 `result.list.forEach(...)` | T3 不命中（字段可推断） |
| 响应有字段访问但不解构 | `res.data.list.forEach(item => { that.setData({ items: item }) })` → wxml 中 `{{item.name}}` | **T3b ✅ 命中**（字段名在 wxml 模板中隐式使用，JS 中看不到完整结构） |
| 响应结构清晰 | `const { items, total } = res.data; return { items: items.map(x => ({id: x.id, name: x.name})), total }` | T3 不命中 |
| 响应仅用于条件判断 | `if (res.data.success) { ... }` | T3 不命中（至少知道 `success` 字段，但仍缺业务数据字段 → **需结合具体场景**，若只有 `success` 而无业务字段仍属 T3a） |

---

## 二、探测能力与限制

### 能做到的

| 能力 | 说明 |
|------|------|
| 捕获完整请求参数 | URL（含动态拼接）、method、data、header |
| 捕获真实响应数据 | statusCode、header、response body |
| 透传业务行为 | 原始请求正常发出，业务逻辑不受影响 |
| 前置步骤支持 | 支持 `preSteps` 定义登录等前置操作 |

### 做不到的 / 需要用户配合的

| 限制 | 应对方式 |
|------|---------|
| 需要扫码登录的场景 | 使用 `preSteps` 等待用户扫码，或在 connect 模式下先手动登录 |
| 开发者工具未安装 / 服务端口未开 | 提示用户安装或开启，无法自动代为操作 |
| 接口需要特定前置数据（如需先有订单才能查订单详情） | 在 `preSteps` 中定义创建前置数据的步骤 |

### 技术原理

通过 `miniProgram.evaluate` 在小程序运行时内覆写 `wx.request`，在 `success`/`fail` 回调中同时记录请求参数与响应数据到全局变量，再通过 `evaluate` 读取。**不使用 `mockWxMethod`**——因为 `mockWxMethod` 的回调函数会被序列化传递，`this.origin` 对 `wx.request` 等异步 API 的 `success`/`fail` 回调无法触发，无法获取响应数据。

---

## 三、触发前必须做的事

### 3.1 用户通知（非阻断）

启动 automator 会**真实拉起开发者工具窗口**（或连接已打开的窗口），可能弹登录二维码、影响用户当前调试状态。**一次性通知用户**，不等待确认：

```
将启动微信开发者工具自动化（automator）探测以下接口：
  - <api 1>：<原因，如"URL 动态拼接，无法确定真实路径">
  - <api 2>：<原因>

前置条件：
  1. 微信开发者工具已安装
  2. 已在工具中登录（首次需扫码）
  3. 工具内"设置 → 安全设置 → 服务端口"已开启
```

**仅在以下情况中断**：
- 开发者工具未安装 / 服务端口未开 → 告知用户具体修复步骤，等用户解决后重试
- 用户明确拒绝 → 改走离线兜底

### 3.2 环境前置检查（**模型必须自行完成**）

| 项 | 要求 | 不满足时的处理 |
|---|------|--------------|
| `miniprogram-automator` | 安装到 **skill 的 `scripts/` 目录**（`scripts/node_modules/miniprogram-automator`） | 模型执行 `cd <skill-path>/scripts && npm install miniprogram-automator`。**禁止安装到小程序源项目**，避免污染主包 |
| 开发者工具 CLI | macOS 默认 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`；Win 默认 `C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat`；支持环境变量 `WX_CLI_PATH` | CLI 找不到 → 告知用户安装路径或设置 `WX_CLI_PATH` |
| CLI/HTTP 端口 | 工具内「设置 → 安全设置 → 服务端口」开启 | 告知用户开启步骤 |
| `auto-port` | 默认 `9420`，被占用时自动切换 connect 模式 | 自动切换，无需用户干预 |

**原则**：`miniprogram-automator` 安装到 skill 的 `scripts/` 目录，不向源项目写入任何文件；只有需要用户物理操作的（如安装开发者工具、开启服务端口、扫码登录）才中断告知用户。

### 3.3 探测计划清单

调起 probe 之前，先列一份计划：

```yaml
probe_plan:
  - api_name: searchMovies
    target_page: pages/movie/list
    trigger: tap '#search-btn' after input.input('阿凡达')
    matchUrlIncludes: /api/movie/search
    capture: [request.url, request.data, response.data]
    expected_field_keys: [id, title, poster, score]   # 期望从响应中验证的字段
  - api_name: getMovieDetail
    target_page: pages/movie/detail?id=<from_searchMovies.first.id>
    trigger: navigateTo only
    capture: [request.url, request.data, response.data]
    preSteps:                          # 可选：前置步骤
      - target_page: pages/login/index
        trigger:
          - kind: tap
            selector: '#login-btn'
        waitMs: 3000                   # 等待用户扫码登录
```

---

## 四、标准探测流程（SOP）

### 4.1 调用脚本

使用 `scripts/probe.mjs`（与本 skill 同目录）。**LLM 不要手写 automator 调用代码**——直接调脚本：

```bash
node wxa-skills-generate/scripts/probe.mjs \
  --project /path/to/source-miniprogram \
  --plan /tmp/probe-plan.json \
  --output /tmp/probe-result.json \
  [--auto-port 9420] \
  [--cli-path /Applications/wechatwebdevtools.app/Contents/MacOS/cli]
```

`--plan` 文件即上节 3.3 的清单 JSON 化。脚本内部会按计划顺序：

1. `automator.launch()` 启动工具并打开源项目（端口已占用时自动切换 `connect` 模式）
2. 通过 `evaluate` 覆写 `wx.request`，在回调中记录请求参数 + 响应数据到全局变量
3. 如有 `preSteps`，先执行前置步骤（导航 + 触发操作 + 等待），然后清空前置期间产生的请求记录
4. 按 `target_page` `reLaunch` / `navigateTo`
5. 按 `trigger` 字段执行 `input` / `tap` / `callMethod`
6. 轮询读取全局变量，等待匹配请求出现
7. 通过 `evaluate` 读取捕获结果
8. 进入下一条 plan
9. 全部完成后 `mp.close()`（connect 模式不关闭）

### 4.2 plan.json 完整格式

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
      {
        "target_page": "/pages/login/index",
        "trigger": [
          { "kind": "tap", "selector": "#login-btn" }
        ],
        "waitMs": 3000
      }
    ]
  }
]
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `api_name` | string | 是 | 接口标识，结果中回写 |
| `target_page` | string | 是 | 目标页面路径 |
| `matchUrlIncludes` | string | 否 | URL 匹配关键词，用于从多条请求中筛选目标 |
| `captureWaitMs` | number | 否 | 等待请求的超时（默认 10000ms） |
| `trigger` | array | 否 | 触发操作列表 |
| `preSteps` | array | 否 | 前置步骤（登录等） |

`trigger` 每项支持：`tap` / `longpress` / `input` / `callMethod` / `wait`

`preSteps` 每项支持：`target_page`（导航目标） / `trigger`（触发操作） / `waitMs`（等待时长）

### 4.3 产出物（落盘到 `<workdir>/.probe/<run-id>.json`）

```json
{
  "runId": "20260602-1530",
  "project": "/path/to/source",
  "mode": "launch",
  "results": [
    {
      "api_name": "searchMovies",
      "target_page": "/pages/movie/list",
      "status": "ok",
      "request": {
        "url": "https://api.maoyan.com/mmdb/search/movie/v2",
        "method": "GET",
        "header": { "Authorization": "Bearer ..." },
        "data": { "kw": "阿凡达", "ci": 1, "limit": 20 }
      },
      "response": {
        "statusCode": 200,
        "header": { "Content-Type": "application/json" },
        "data": {
          "movies": [
            { "id": 1296091, "nm": "阿凡达：水之道", "img": "https://...", "sc": 8.5 }
          ],
          "hasMore": true
        }
      },
      "duration_ms": 412
    }
  ]
}
```

### 4.4 失败兜底

| 失败类型 | 处理 |
|---------|------|
| 无法启动 cli（`ENOENT`） | 告知用户检查 `--cli-path`，不重试 |
| 端口被占用 | 自动切换 connect 模式；connect 也失败则要求用户手动 `cli --auto <project> --auto-port 9421` |
| 登录失效 / 二维码弹出 | 在 `preSteps` 中安排等待，超时 60s 仍未登录则标记 `auth_required`，**不要**伪造 token 重试 |
| 接口超时无响应 | 标记 `status: "timeout"`，记录已捕获的中间数据（如有） |
| 用户拒绝授权 / 后端 401 | 标记 `status: "auth_required"`，**不要**伪造 token 重试 |
| 请求已发出但无匹配 | 标记 `status: "url_unmatched"`，列出所有捕获到的请求供 LLM 人工判断 |

任一接口探测失败 → **不要**继续写阶段 4，先告知用户：

```
接口 <name> 探测失败：<原因>
建议：
  1. 提供抓包文件（HAR/Charles）让我离线分析；或
  2. 手动操作页面后，把控制台 Network 面板的请求详情粘贴给我；或
  3. 跳过此原子接口（在阶段 4 清单中标记为"暂不生成"）
```

---

## 五、把探测结果接到阶段 4

阶段 4 设计 `inputSchema` / `outputSchema` 时，**优先**使用 probe 结果而非静态推断：

| 字段 | 来源 |
|------|------|
| `inputSchema.properties.<x>` 的字段名/类型 | `request.data` 的 key + 类型推断（数字/字符串/布尔） |
| `inputSchema` 的 required | 探测时变更 → 接口失败的字段（如改为空字符串后 400） |
| `outputSchema.properties.<x>` | `response.data` 顶层字段 + 一层嵌套（再深的不强制） |
| 字段中文描述 | 源页面 wxml 上下文（label / placeholder / 模板渲染时的文案） |

**写代码时引用 probe 结果**：在 `apis/<name>.js` 顶部注释里写明：

```js
// [ai-mode:probe] 2026-06-02 验证：实际请求 GET https://api.maoyan.com/mmdb/search/movie/v2
// [ai-mode:probe] 实际响应字段：movies[].{id, nm, img, sc, hasMore}
```

便于 validator / 后期排查回溯当时是怎么决断的。

---

## 六、Probe 与生成主流程的关系

```
阶段 3 提取
   │
   ├─ 静态分析能搞清楚 → 直接进阶段 4
   │
   └─ 命中触发条件 T1~T6（或建议探测场景）
         │
         ├─ 一次性通知用户 → 直接启动 probe
         │     │
         │     ├─ 探测成功 → 写入 .probe/<run>.json → 阶段 4
         │     └─ 探测失败 → 告知用户，提供离线兜底选项
         │
         └─ 用户明确拒绝启动 probe
               └─ 改走「请提供请求示例 / 抓包数据」的离线兜底
```

**核心原则**：

1. **命中即执行，禁止跳过**——阶段 3 标记 `requiresRuntimeProbe: true` 或命中 T1~T6 时，**必须执行 probe**。"标记了需要 probe 但直接进阶段 4"属于违规行为，生成的 outputSchema 将不可靠
2. **优先用 probe 验证**——对 outputSchema 的准确性至关重要，宁可多跑一次 automator，也不要在阶段 5 猜字段名导致 validator 反复修补
3. **起就一次起完**——一次性把所有需要探测的接口列入 plan 批量跑，不要反复启停
4. **probe 失败不等于阻断**——可以降级到离线兜底，只有「静态 + probe + 离线兜底全失败」才走阻断规则 B
5. **探测的是源项目，不是 skills/**——这一步在生成 skills/ 之前，与已生成的分包无关
6. **非阻断通知**——一次性告知用户将启动 automator，不等待确认；仅在环境检查失败时中断
7. **自检**：阶段 5 生成 `apis/<name>.js` 后检查顶部注释——如果只有 `[ai-mode:probe] 探测需求:...` 而没有 `验证：实际请求...` / `实际响应字段：...`，说明 probe 只标记了但未执行，必须回 3.6 补执行
