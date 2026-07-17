# Subagent 隔离探测协议（大项目必用）

> 项目页面 >30 / 多分包 / 源码展开后单文件巨大时按本协议执行。小项目（页面 ≤~30 且无多分包且源码总体量小）跳过本文件，主 agent 直接 `read` 源码。

---

## 一、能力索引（先定位再读，只产坐标）

先产"能力索引"再开始读源码。

### 数据源限制

- 仅限：`app.json`(`pages`/`subPackages`) + 各目标页面 `.json`(标题) + `.wxml`(按钮 / 输入框文案、`bind*` 名) + 页面 `.js` 的**函数名与行号**（用 `grep` 取 `bindtap`/`methods`/函数声明的行号，**不读函数体**）。
- **优先用 `grep`**（按能力关键词 / 文案 / handler 名搜命中行号），而非 `read` 整文件。
- **分包级裁剪**：能力清单已知时，先用 `app.json` + `.wxml` 文案把每个能力锁定到 **1~2 个分包/页面**，其余分包不进视野。

### 索引产物

落盘 `<源项目>/.ai-mode-skills/capability-index.json`，只存坐标、零源码体：

```jsonc
{
  "projectScale": { "pageCount": 12, "subPackageCount": 79, "large": true },
  "capabilities": [
    {
      "name": "搜索影院",
      "subPackage": "movieNPro",
      "page": "movieNPro/pages/cinema-list/index",
      "entryHandler": { "name": "onSearchConfirm", "line": 88 },
      "uiHints": ["搜索影院", "城市切换"]
    }
  ]
}
```

### 复用

已存在 `capability-index.json` 时**直接读用，不重产**。

> 本步只回答"每个能力在哪个分包/页面/handler"，不回答"调了什么接口"（那是 §二 subagent 精读的事）。

---

## 二、subagent 隔离探测协议

主 agent 不亲自通读源码，派 subagent 去读，每个 subagent 只回传**固定格式的结论清单**。

本协议共五类 subagent，前四类全部**只读探测、只写产物、不写代码**（代码统一由主 agent 在阶段 5 生成），第五类在交棒后做校验隔离。数量受控 = 鉴权 1 个 + 鉴权核对 1 个 + 每能力 1 个 + probe-plan 1 个 + 校验 1 个；各类内部不得再派 subagent / 递归全读。

### 源码忠实铁律（§2.3 / §2.4 subagent 必遵守）

§2.3 从真实入口读到请求构造并落盘 `interface-spec.<cap>.md`；§2.4 只读 interface-spec 写 `probe/plan.json`，**不得偏离、不得重读业务 `.js` 改接口语义**。阶段 5 生成 `apis/*.js` 须与 interface-spec 一致。

#### 接口由真实入口唯一确定

能力与接口**一一对应**——以触发该能力的**真实事件 handler 实际调用**为准，禁止凭接口名「语义相近」挑选。

| 反例 | 正确做法 |
|------|---------|
| 搜索能力选了 `*_search` 接口 | 读搜索框 `bindinput`/`bindconfirm` 绑定的函数，看它实际调的 URL 与分支参数 |
| 列表/详情入口语义相近，挑「更好实现」的接口 | 只认用户要暴露的那条真实入口链路 |

interface-spec 须含：真实入口（页面/handler + 来源行号）、请求构造、`authRefs`（只引用 auth-spec，不重写鉴权事实）。

#### 每个入参追到真实赋值来源

不止复刻 `wx.request` 那一行——每个请求字段继续向上追：

`页面 data` ← `onLoad`/`onShow`/事件回调 ← JSAPI / `wx.getStorageSync` / `globalData` / 用户输入

- 动态值（定位、设备、登录态等）→ 标注到 interface-spec，阶段 5 生成 `ensureXxx()`（见 `AUTH_MIGRATION.md` §4）
- **禁止**来源未追清时用 `|| 0` / `|| ''` / 固定值兜底
- 正常路径 + 失败/缺省分支须与主包一致（阶段 5 细则见 `AUTH_MIGRATION.md` §4 第 2–4 条）
- **probe 不能替代**读真实鉴权函数；probe 只验证响应结构

#### 写 plan 时（§2.4）

- `target_page` / `matchUrlIncludes` / `trigger` 必须与 interface-spec 的**同一真实入口**对齐，不得为「更好触发」换页或换接口
- 同 URL 多 api 时，`trigger` 必须复现 interface-spec 里记录的分支差异（tab/stype/模式标志等），禁止复制粘贴同一条
- selector 缺失时仅 grep 对应 `.wxml`，**禁止**回读 `.js` 函数体做接口分析或改 url

### 2.1 鉴权 subagent（1 个，只读一次）—— 产 auth-spec

**指令**：读 `app.js` + request 封装 + 登录文件 + 签名/指纹模块，按 `references/AUTH_MIGRATION.md §2` 的**事实层表格**逐项填写，落盘两份产物：

- `<源项目>/.ai-mode-skills/auth-spec.md`：§2 全部维度（hasCentralWrapper / hosts+解析规则 / 通用参数表含 channel / content-type / 登录来源+获取+variants+replicable / 签名列表 / 动态值 / 响应信封 / 鉴权错误 / storageInit），**每条带来源 `文件:行号`**。
- `<源项目>/.ai-mode-skills/auth-spec.snippets.txt`：§3 要求的 **verbatim 代码片段**（签名函数体、整文件拷的 `md5.js`/`token-auth.js`/`uuid.js`/指纹模块、封装注入段），每段带 `#anchor` + 来源行号。

**铁律**：
- 离散事实进 `auth-spec.md` 表格；算法/函数体进 `snippets.txt` **原样拷贝**，**禁止把签名算法写成"步骤数组"**（见 AUTH_MIGRATION 核心原则）。
- 登录换取接口的字段名（`code` vs `js_code`）、响应取值路径（`data.openid` vs `data.data.openid`、不同名如 `openIdSec=encryptedOpenId`）逐字照抄，这是最常记错处。
- 回传给主 agent 的只是「两份产物已落盘 + 一段≤20 行的事实摘要」，**不回传源码原文**。主 agent 后续全程引用产物，不再读 app.js/request.js。

### 2.2 鉴权核对 subagent（1 个，窄上下文）—— 校验 auth-spec

**指令**：输入 `auth-spec.md` + `auth-spec.snippets.txt`。逐条事实拿其 `来源 文件:行号` 回到源码对应行**逐字比对**，只读这些被引用的行（不通读）。输出：

- `PASS`，或
- 差异清单 `[{字段, spec值, 源码实际值, 文件:行号}]`。

有差异 → 回 2.1 修正后重核，直到 PASS。**核对器只判离散事实是否忠实于源码**，不评价代码风格。

### 2.3 逐能力探测 subagent（每能力 1 个，可并行）—— 产 interface-spec

**指令**：输入「能力名 + §一索引里的入口坐标（分包 + 页面 path + handler 名/行号）+ 已就绪的 auth-spec」。**铁律见上文「源码忠实铁律」**。从入口顺真实调用读到发起请求处，落盘 `<源项目>/.ai-mode-skills/interface-spec.<cap>.md`，含：

- **`api_name`**（与阶段 4 原子接口 `name` 一致，probe plan 靠它对齐）
- 真实入口（页面/handler + 逐字触发代码片段 + 来源行号）
- 请求构造（中性表示）：method / urlPath（或 inline 整 url）/ `hostRef`（引用 auth-spec.hosts[].id）/ 参数所在通道
- 每个请求字段名 **及其真实赋值来源**（页面 data ← onLoad/onShow/事件 ← JSAPI/storage/globalData/用户输入；**含失败/缺省分支的真实回退值，照抄不自造**）
- 鉴权只填 `authRefs`：`requiresLogin`(由真实请求是否带 token 判定) / `signing`(引用 auth-spec.signing[].id，可空) / `dynamicValues` / 通用参数 inherit —— **不重新定义鉴权，避免与 auth-spec 漂移**
- 响应：`pendingProbe:true` + 静态猜测（由阶段 3.7 probe 真机回填）

> §2.3 只产**接口语义**（入口、url、参数），不写 `plan.json`——那是 §2.4 的事。

### 2.4 probe-plan subagent（1 个，整批）—— 产 plan.json

**指令**：输入各 `interface-spec.<cap>.md` + `auth-spec.md`（拼 `preSteps` 时引用）。**铁律见上文「源码忠实铁律」**（尤其「写 plan 时」）。按 `references/RUNTIME_PROBE.md` 的 plan 格式，落盘 `<源项目>/.ai-mode-skills/probe/plan.json`：

- 每个 interface-spec 的 `api_name` **必须有且仅有一条** plan 条目
- `target_page` / `matchUrlIncludes` 与 interface-spec 的入口页、urlPath 对齐
- `trigger`：UI 触发用 `tap`/`input`/`callMethod`；进页自动发则留空；非 UI 或 hook 捕不到时用 `request`/`evaluate`
- 同 URL 多 api（如不同 tab/stype）时，trigger 必须可区分，不能复制粘贴同一条

**读取边界**：

- ✅ 允许：`interface-spec.*.md`、`auth-spec.md`、`capability-index.json`（补页面路径）
- ✅ selector 缺失时：仅对 `target_page` 对应 `.wxml` **grep** class/id/`bind*`（不读 `.js` 函数体）
- ❌ 禁止：重新通读业务 `.js` 做接口分析（那是 §2.3 的事）

回传主 agent：「plan 已落盘 + ≤20 行摘要（N 条、有无 preSteps、有无 request fallback）」，**不回传源码**。

probe 结果 `url_unmatched` 需改 plan 时：仍派 §2.4 重产（可加输入最新 `probe/<run-id>.json` 的 extras），或主 agent 只改 plan.json 后重跑 probe——**仍禁止**为改 plan 重读业务 `.js`，**禁止**手写 probe run 文件。

### 2.5 回传纪律 + 读取预算（四类通用）

- **凭索引坐标直达**：从 §一索引给的坐标文件起步，`read` 那个 handler 那一段（行号 offset/limit），不得从 `app.json` 重新满项目找入口。
- **只读 1 跳依赖**：只允许打开「坐标文件 + 它直接 `import`/`require` 的那 1 层依赖」；不得跨分包递归追第 2、3 跳。鉴权公共封装走 auth-spec（已由鉴权 subagent 读过），不重复深追。
- **单 subagent 读取硬上限**：累计打开文件 ≤ ~5 个（或字节超阈值即停）。逼近上限仍未定位 → 停止，回传 `{status:"need_confirm", reason, 已读文件列表}`，交主 agent 决策。
- **回传纯结论**：产物落盘，只回结论摘要、零源码原文。

### 2.6 校验 subagent（1 个，交棒后执行）—— 隔离运行 wxa-skills-validate

> **规则**：生成阶段完成、需要运行 `wxa-skills-validate` 做校验时，**必须派 subagent 执行**，只要有 subagent 能力，就禁止在主 agent 上下文中直接运行。

**指令**：输入「项目路径 `<project-path>` + validate skill 路径」。subagent 拥有独立的上下文窗口，完整执行 wxa-skills-validate 的全流程（阶段 1 静态校验 → 阶段 2 准备 CLI → 阶段 3 执行计划 → 阶段 4 execute + render → 阶段 5 交付）。
