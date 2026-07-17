# AUTH_MIGRATION — 鉴权与登录迁移

鉴权 / 登录 / 通用参数 / 签名 / `request.js` 复刻的唯一规则源。本文件同时定义 **auth-spec 事实层**——鉴权 subagent 的产出契约（阶段 1.2）。大项目读源码分工见 `SUBAGENT_PROTOCOL.md`。

## 核心原则：事实结构化、代码逐字拷贝

从主包真实函数读出鉴权链路并复刻，**不凭函数名、字符串或通用模式推断**。源码里两类东西用两种载体承载，**不要混**：

| 类型 | 例子 | 载体 |
|------|------|------|
| **离散事实** | 登录 URL、请求/响应字段名、响应取值路径层级、host 映射、哪个 header 何时生效 | **结构化**（§2 的表格 / auth-spec）|
| **代码/算法** | 签名函数、哈希/加密依赖模块、请求封装闭包、设备指纹模块 | **verbatim 原样拷贝**（§3 snippets / 整模块拷）|

> ❌ **禁止把签名/算法写成"步骤数组"再还原**。算法只记"用哪个模块、输入是什么、输出哪几个字段名"，函数体整段拷贝。

字段名、路径表达式、HTTP method、content-type、成功/失败判定条件——一律从被引用行**逐字提取**，不要用"常见小程序写法"替换。

---

## 1. 红线

1. 「无登录需求」≠「无鉴权需求」：通用 header/query/body 参数即使公开接口也不能丢。
2. 源码 request 封装的每个通用参数全部按原样保留，**不判断"是否必要"**。
3. 生成侧 `utils/request.js` 是唯一请求入口，`apis/*.js` 必经它发请求，禁止直接 `wx.request` 或自拼 URL/header/query。**即使 `hasCentralWrapper=false`，生成侧也必须自建收口**，把通用参数收敛进去。
4. 签名/登录默认**可复刻**：有完整源码就产生产级代码，不塞空占位。仅当依赖验证码/短信等运行时人机交互（`blockers` 命中）才标不可复刻 → 触发阻断或人工接入。

---

## 2. auth-spec 事实层（阶段 1.2 产出，结构化）

鉴权 subagent 读完源码后，把下列**事实**填成结构化产物 `<源项目>/.ai-mode-skills/auth-spec.md`（表格即可，不必 JSON）。每条事实必须带 `来源 = 文件:行号`。不论链式 builder / 框架封装 / 裸 `wx.request`，都归约到下面这些维度。

### 2.1 元信息

| 项 | 值 | 说明 |
|----|----|----|
| `hasCentralWrapper` | true/false | false=源码无统一封装、通用参数靠每个请求手抄（生成侧仍要自建收口）|
| `confidence` | high/partial/low | |

### 2.2 host 体系（列表，非单一中心 map）

| id | 完整 base（含路径）| 来源 |
|----|----|----|
| `<hostId>` | `https://...` | `<文件>:<行号>` |
| `_inline` | （整 URL 在调用处硬写，interface-spec 直接记完整 url）| |

附 **host 解析规则**：从源码归纳「相对 url 如何拼成绝对 url」+ 来源行号。规则写**行为描述**，不要硬编码某一项目的 host 名或改写公式。

### 2.3 通用参数（一张表，用 channel 区分 header/query/body）

| name | channel | 值来源（kind）| 表达式/值 | 何时生效 | 注入方式 | 来源 |
|------|---------|-------------|----------|---------|---------|------|
| `<参数名>` | header \| query \| body | `<kind>` | `<源码中的表达式或字面量>` | `<生效条件>` | wrapper \| manual-repeat | `<文件>:<行号>` |

- **注入方式**：`wrapper`=封装自动注入；`manual-repeat`=每个请求手抄（`hasCentralWrapper=false` 时）→ 生成侧统一收进 `request.js`。
- `kind`（值来源类型）闭合枚举见 §2.8。
- 每行的 `name`、channel、表达式必须与源码**同名同通道**。

### 2.4 content-type 规则

| 方法 | content-type | 来源 |
|------|-------------|------|
| `<method>` | `<源码实际设置的 type>` | `<文件>:<行号>` |

按源码**逐 method**记录；不同 method 可以不同，不要假设全局统一。

### 2.5 登录 / token（来源 与 获取 分离）

**token 来源**（取值用）：

| 项 | 值 | 来源 |
|----|----|----|
| kind | storage / appGlobal / exchange | |
| key / path | `<storage key 或 globalData 路径>` | `<文件>:<行号>` |
| guard | `<源码中的登录态判断函数或条件>`（如有）| |

**token 获取**（怎么换来）：

| 项 | 值 |
|----|----|
| kind | exchange / module-oauth / sms |
| trigger | `<触发 JSAPI 或用户动作>` |
| 换取 URL + host | `<路径>` @ `<hostRef>`（hostRef = §2.2 的 hostId）|
| 请求字段名 | `<字段名>=<值来源>`（每个字段一行，名与源码一致）|
| method / content-type | `<method>` / `<type>` |
| **响应取值路径** | `<从响应体取凭证的路径>`（请求字段名与响应字段名可能不同，分别记录）|
| successCondition | `<源码判定成功的表达式>` |
| **variants[]** | 多登录入口时各记一行：`入口标识` → `响应取值路径` |
| `replicable` / `blockers` | true / `[]`；不可自动复刻时 false + `["captcha"]` 等 |

来源行号必填。换取接口的请求字段名、响应取值路径必须从对应 `wx.request`（或封装）那一行向上追到赋值处，逐字照抄，不用别名或简化路径。

> **登录常是多级链路，必须整条按序记全**：若最终业务凭证要经多次顺序请求换取，把 `token 获取` 写成**有序步骤表**——每一级记 `url/host/method/请求字段（来自上一级的哪个产出）/响应取值路径/successCondition`，并标明步骤顺序。**不允许只记到中间某级就停**。

### 2.6 签名 / 反爬（列表，可为空）

| id | scope | 触发 | 密钥 | 输出字段（channel）| 依赖模块（整文件拷）| 原文片段 | 来源 |
|----|-------|------|------|------------------|------------------|---------|------|
| `<signId>` | global \| per-interface | `<触发条件或调用点>` | `<密钥来源>` | `<字段名>`(header/query/body) | `<模块路径>` | snippets#`<anchor>` | `<文件>:<行号>` |

- **算法本体不写在这里**——只记输入、输出字段名、依赖模块、原文片段指针。函数体进 §3 verbatim。
- `scope=per-interface`：签名盐值（salt）/输入逐接口不同时，interface-spec 用 `kind:computed` 引用本方案 + 给本接口的具体 salt 表达式。
- 无签名 = 空表。

### 2.7 运行时动态值（每个都要有 `ensureXxx()` 复刻取值）

| id | 取值方式 | ensureFn（取值函数名）| 来源 |
|----|---------|----------|------|
| `<动态值 id>` | `<JSAPI / 计算 / 登录链路>` | `ensure<Name>` | `<文件>:<行号>` |

`ensureFn` = 阶段 5 为该动态值生成的取值函数名（如 `ensureLocation`、`ensureLogin`），命名与 §4 生成侧一致。

### 2.8 响应信封 + 鉴权错误 + storage 初始化

**响应信封**（全局，生成侧 `request.js` 必须复刻拆包）：

| 项 | 路径 | 来源 |
|----|------|------|
| successPath | `<源码判定成功的表达式>` | `<文件>:<行号>` |
| dataPath | `<业务 data 所在路径>` | |
| errorMessagePath | `<错误文案字段路径（可多候选，与源码一致）>` | |

**鉴权错误生命周期**（不复刻 → token 失效后永久失败）：从源码提取「何种响应/状态码 → 清 token / 重新登录 / 跳转」等动作，逐条记入表：

| 命中 | 动作 |
|------|------|
| `<条件>` | logout \| clearToken \| `<源码实际动作>` |

**storage 初始化**：主包启动时写入、分包需 `ensureStorageInit()` 自建的 key——列出 key 与生成方式 + 来源。

**`valueSource.kind` 闭合枚举**——每个参数的「值来源类型」标签，决定阶段 5 代码生成时该参数怎么取值，**只有以下 8 种**：

| kind | 含义 | 阶段 5 代码生成时的处理 |
|------|------|----------------------|
| `literal` | 字面量（如 `appId: "wx123"`） | 直接硬编码 |
| `computedConstant` | 常量 + decode/拼接（如 base64 解码） | 代码里照抄拼接/解码逻辑 |
| `computed` | 模块函数计算（如签名函数） | 函数体从 §3 verbatim 拷贝，不重写成"步骤" |
| `appGlobal` | `getApp().globalData.xxx` | 分包内自建模块级变量（禁止 `getApp()`） |
| `storage` | `wx.getStorageSync` | 分包 `ensureStorageInit()` 自建 |
| `dynamic` | JSAPI / 登录态（如定位坐标、token） | **必须生成 `ensure<Name>()` 函数**，实调取真值并 `await`（§4 铁律） |
| `userInput` | 用户输入 | 从 `inputSchema` 传入 |
| `upstreamRequest` | 上游接口下发的 token/seed | 上游接口 `structuredContent` 传下来，在 `inputSchema` 声明 |

---

## 3. verbatim 代码片段（`auth-spec.snippets.txt`，原样拷贝）

凡 §2 表格里 `原文片段` / `依赖模块` 指向的代码，**原文照搬**到此文件（压缩代码也照抄，不格式化成"步骤"），代码生成时直接保留/内联，不重写：

- 签名/反爬函数本体
- 表格中列出的依赖模块（**整文件**）
- 请求封装闭包里通用参数注入的那一段（若 `hasCentralWrapper=true`）

每段标 `#anchor` + 来源 `文件:行号`，供 §2 引用、供核对器回比。

---

## 4. JSAPI 动态值获取铁律（逐字复刻主包链路，不得简化）

1. `ensureXxx()` 调用对应 JSAPI 取真值。`inputSchema` 中标可选 = 用户可不传，**不等于代码内部可跳过该 JSAPI**。
2. 复刻主包取值顺序：① 先读同 key 缓存占位 → ② 实时调同一 JSAPI 刷新 → ③ 失败/缺省分支回退到主包真实使用的值。正常路径与失败分支**二者缺一不可**。
3. **异步 JSAPI 必须 `await` 完成再发请求**：用 Promise 包装并 `await` 拿到结果后才发请求；禁止同步 `try/catch` 包异步后立刻发请求。
4. 失败回退值**读出来而非猜**：打开主包对应分支照抄实际回退值；禁止 `|| 0` / `|| ''` / 默认坐标等臆造兜底。结果为空就如实返回空状态，不伪造默认数据。
5. **坐标 / 位置参数必须实调 `wx.getLocation` / `wx.getFuzzyLocation` 取真值**：当接口请求参数含经纬度 / 坐标时，生成 `ensureLocation()`，入口 `await ensureLocation()` 取真实坐标后再发请求。**禁止硬编码坐标 / `|| 0` 兜底 / 从 storage 读缓存坐标当唯一来源**（缓存只是占位，必须实时刷新）。阶段 6 在 `app.json` 补 `requiredPrivateInfos: ["getLocation"]`（或 `getFuzzyLocation`，与源码一致）。
6. 需隐私/权限声明的 JSAPI：阶段 6 在 `app.json` 一并补 `requiredPrivateInfos` / `permission` 等与源码一致的配置。

---

## 5. 代码生成（阶段 5.6）：按需登录

- `request.js`：`ensureLogin()` 防并发（登录 Promise 缓存）+ 凭证存模块级变量 + 统一注入 §2.3 通用参数 + 复刻 §2.8 响应拆包与鉴权错误处理。骨架见 `CODE_TEMPLATES.md §1.4/§3`。
- 变量引用经导出的 getter（取值函数）或闭包直接引用；禁止从模块解构未导出的字段。
- **登录按需，不默认前置**：是否在某 `apis/*.js` 入口 `await ensureLogin()`，以「主包该业务接口本身是否带鉴权」为准：
  - 带鉴权 → 入口 `await ensureLogin()` 后再发请求。`ensureLogin()` 必须**一次跑完 §2.5 整条登录链路**（多级请求按序全部执行、上一级产出喂给下一级），直到产出最终凭证并落到模块级变量。**禁止只做半程**，**禁止把可复刻的登录态标为「外部注入」/留空凭证**。
  - 可匿名 → **不要**调 `ensureLogin()`，直接发。
  - 鉴权「锦上添花」（带 token 给个性化、不带也返回公共结果）→ 登录降级为非阻塞，失败/超时即继续匿名请求。

---

## 6. 自检（生成前逐条过）

- [ ] 登录换取接口的 URL / host / 请求字段名 / method / 响应取值路径与 auth-spec、源码一致（重点核对：登录 code 类字段别名、响应嵌套层级、请求/响应字段不同名）
- [ ] §2.3 每个通用参数都在 `request.js` 里按 channel（header/query/body）逐条出现，字段名与源码一致
- [ ] 签名字段名与源码一致、依赖模块**整文件拷贝**、函数体取自 §3 verbatim 而非重写
- [ ] 响应拆包（successPath/dataPath）与鉴权错误处理已复刻；**鉴权失败如实返回错误，不得归一化成"空结果/0 条"掩盖**
- [ ] auth-spec 标为需登录态的每个 `apis/*.js`，入口都 `await ensureLogin()` 且跑完了 §2.5 整条多级链路（无半程、无外部注入占位）
- [ ] 模块级鉴权变量无空串未初始化；引用经 getter（取值函数），不解构未导出字段
- [ ] JSAPI 动态值实调取真值并 `await`，无假默认值，失败回退值照抄主包
- [ ] `hasCentralWrapper=false` 时，已把手抄的通用参数收敛进生成侧 `request.js` 统一入口
