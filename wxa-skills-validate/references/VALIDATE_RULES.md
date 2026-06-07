# validate.mjs 内置规则详解（V001~V014）

> 本文件列出 `scripts/validate.mjs` 内置的所有校验规则。当 `validate-report.json` 中出现未知的 `id` 时按本文定位。
>
> 自定义规则通过 `--rules <path>` 合并（相同 id 覆盖内置）。

---

## 目录

- [单文件规则（regex 扫描）](#单文件规则regex-扫描)
  - [V001 禁止依赖主包](#v001-禁止依赖主包)
  - [V002 已注册接口必须为 async function](#v002-已注册接口必须为-async-function)
  - [V003 WXML 组件白名单](#v003-wxml-组件白名单)
  - [V005 CSS 禁止属性](#v005-css-禁止属性)
  - [V006 CSS 禁止选择器](#v006-css-禁止选择器)
- [跨文件规则](#跨文件规则)
  - [V007 定义-注册一致性](#v007-定义-注册一致性)
  - [V008 注册-实现一致性](#v008-注册-实现一致性)
  - [V009 接口返回值-outputSchema 一致性](#v009-接口返回值-outputschema-一致性)
  - [V010 组件取值-接口返回一致性](#v010-组件取值-接口返回一致性)
  - [V011 setData-WXML 绑定一致性](#v011-setdata-wxml-绑定一致性)
  - [V012 原子接口若关联原子组件则需文件齐全](#v012-原子接口若关联原子组件则需文件齐全)
  - [V014 SKILL.md 必须存在且文件名严格大写](#v014-skillmd-必须存在且文件名严格大写)
  - [V015 原子组件必须配置关联小程序页面](#v015-原子组件必须配置关联小程序页面)
  - [V016 app.json 的 agent.skills[].description 必须存在且非空](#v016-appjson-的-agentskillsdescription-必须存在且非空)
- [规则与错误类型映射](#规则与错误类型映射)

---

## 单文件规则（regex 扫描）

### V001 禁止依赖主包

- **阶段**：`registration`，**级别**：`error`，**目标**：`**/*.js`
- **字面量禁用**：`getApp()`、`import ... from '@/...'`（命中即报错）
- **越界检查**（`require/import` 中以 `.` 开头的相对路径）：以 `app.json` 的 `subPackages[].root` 作为边界
  - 落在分包根子树内 → ✅ 合法（**含分包根下 `_shared/` 等公共目录**）
  - 落到分包根之外 → ❌ "超出 skill 分包边界"
  - 落入兄弟 skill 私有子树 → ❌ "落入另一个 skill 的私有目录"
- **典型修复**：跨 skill 复用工具 → 抽到 `skills/_shared/`，用 `require('../../_shared/xxx')`；越界相对路径 → 把目标模块挪入分包，或改为入参/JSAPI

### V002 已注册接口必须为 async function

- **阶段**：`registration`
- **级别**：`error`
- **类型**：跨文件校验（基于 `mcp.json` 的注册列表）
- **目标**：仅 `mcp.json` 中 `apis[].name` 对应的实现文件（在 `apis/` / `tools/services/` / `tools/` 下按同名 `.js` 解析）

规则会读取 `mcp.json` 列出的 API 名称，对每个已注册接口，校验其实现文件内是否存在以下任一形态：

- `async function <name>(...)`
- `const <name> = async (...) => ...` / `let` / `var`
- `<name> = async ...`（如 `module.exports.<name>`）
- `{ <name>: async (...) => ... }`
- `{ async <name>(...) { } }`

`apis/` 目录下未被 `mcp.json` 注册的工具函数**不会**被检查，避免对辅助模块的误判。

**典型修复**：把注册接口改为 `async function` 或 `async () => {}`；若目标函数只是工具函数，请将其移到同级 `utils/` 目录并在 `mcp.json` 中取消其注册。

### V003 WXML 组件白名单

- **阶段**：`component`
- **级别**：`error`
- **类型**：`regex_absent`（以下模式**不允许出现**）
- **目标**：`*/components/*/index.wxml`

| 正则 | 含义 |
|------|------|
| `<(?!view\|text\|image\|map\|button\|canvas\|scroll-view\|block\|template\|\\/\|!--)[a-zA-Z]` | 仅允许 `view` / `text` / `image` / `map` / `button` / `canvas` / `scroll-view` 七种内置组件（含 `block` / `template` 和注释）。禁用 `navigator` / `swiper` / `input` / `textarea` / `picker` / `checkbox` / `radio` / `form` / `slider` / `switch` / `editor` / `rich-text` / `icon` / `progress` / `web-view` 等 |
| `<button[^>]*\sopen-type\s*=` | 原子组件的 `<button>` 不支持 `open-type` 属性（`share` / `getPhoneNumber` / `getRealtimePhoneNumber` 等半屏页面才可用） |
| `<scroll-view(?![^>]*\sscroll-x(?:[\s=>]\|$))` | `<scroll-view>` 必须显式声明 `scroll-x`（仅支持横向滚动） |
| `<scroll-view[^>]*\sscroll-y\s*=\s*["']?(?:true\|\{\{\s*true\s*\}\})` | `<scroll-view>` 不支持 `scroll-y="true"`（纵向滚动不支持） |

**典型修复**：
- 横向超长内容 → `<scroll-view scroll-x="true">` 包裹横向列表（如商品横滚卡片）
- `<scroll-view scroll-y>` 纵向滚动 → 改为减少展示条数 + 上行"查看更多"`api/call`
- `<navigator>` → `<view>` 带 `bindtap`（小程序 AI 不在页面栈内导航时直接删除）
- `<swiper>` → 用 `<view>` 列表平铺，或 `<scroll-view scroll-x>` 横滚展示
- `<input>` / `<textarea>` / `<picker>` → 交互类不适合原子组件，删除后由小程序 AI 对话收集入参
- `<button open-type="getPhoneNumber" bindgetphonenumber="...">` → `<button bindtap="onTap">` + 在 tap handler 内调 `wx.getPhoneNumber()`
- `<button open-type="share">` → `<button bindtap="onShare">` + 在 handler 内调 `wx.shareAppMessage(...)`

### V005 CSS 禁止属性

- **阶段**：`component`
- **级别**：`error`
- **类型**：`regex_absent`
- **目标**：`*/components/*/index.wxss`

| 正则 | 禁用内容 |
|------|----------|
| `position\s*:\s*fixed` | `position: fixed` |
| `position\s*:\s*sticky` | `position: sticky` |
| `z-index\s*:` | `z-index` |
| `display\s*:\s*grid` | `display: grid` |
| `display\s*:\s*table` | `display: table` |
| `display\s*:\s*inline-flex` | `display: inline-flex` |
| `float\s*:` | `float` |
| `text-decoration\s*:` | `text-decoration` |
| `--[a-zA-Z][\w-]*\s*:` | CSS 变量 `--*` |
| `transition\s*:[^;]*(?!opacity\|transform)[a-zA-Z-]+` | `transition` 仅允许 `opacity` / `transform` |

**典型修复**：`position: fixed` → `position: absolute`；`display: grid` → `flex`；自定义变量改常量。

### V006 CSS 禁止选择器

- **阶段**：`component`
- **级别**：`error`
- **类型**：`regex_absent`
- **目标**：`*/components/*/index.wxss`

禁：子选择器 `>`、相邻兄弟 `+`、通用兄弟 `~`、伪元素 `::*`、伪类 `:hover`/`:focus`/`:active`/`:checked`/`:disabled`/`:first-child`/`:last-child`/`:nth-child`、属性选择器 `[attr=]`。

**典型修复**：全部用**类名选择器**替代；状态用类切换；奇偶行用 JS 预计算类名。

---

## 跨文件规则

### V007 定义-注册一致性

- **阶段**：`registration`
- **级别**：`error`

比对 `<skill>/mcp.json` 的 `apis[].name` 与 `<skill>/index.js` 中的 `wx.modelContext.registerAPI('name', fn)`。

**典型 fail**：

- `mcp.json` 定义了 `searchItems`，但 `index.js` 未注册 → 补 `wx.modelContext.registerAPI('searchItems', searchItems)`
- `index.js` 注册了 `searchItems`，但 `mcp.json` 未定义 → 在 `mcp.json` 中补 `apis[]` 条目

### V008 注册-实现一致性

- **阶段**：`registration`
- **级别**：`error`

比对 `index.js` 的 `require('./apis/xxx')` 与实际 `apis/xxx.js` 文件是否存在。

**典型 fail**：`require('./apis/searchItems')` 但 `apis/searchItems.js` 文件不存在 → 创建该文件。

### V009 接口返回值-outputSchema 一致性

- **阶段**：`output`
- **级别**：`error`

比对 `apis/<name>.js` 中 `structuredContent: { ... }` 字面量的字段名与 `mcp.json` 中 `outputSchema.properties` 的字段名。

**典型 fail**：

- 接口返回了 `{ items: [] }`，但 outputSchema 未声明 `items` → 在 `mcp.json` 的 `outputSchema.properties` 补 `items`
- `outputSchema.required` 声明了 `items`，但接口未返回 → 在 `structuredContent` 补 `items`

### V010 组件取值-接口返回一致性

- **阶段**：`component`
- **级别**：`error`

比对组件 `components/<name>/index.js` 中的 `result.structuredContent.xxx` 与对应接口的 `structuredContent` 字段。

**关联规则**：
- 优先按组件 JS 中 `atomicApi: 'xxx'` 元信息匹配接口
- 其次按 `apis/*.js` 中找字段全集匹配

**典型 fail**：组件读 `result.structuredContent.items`，但接口返回的是 `list` → 在 `structuredContent` 补 `items`（或改组件读 `list`）。

### V011 setData-WXML 绑定一致性

- **阶段**：`component`
- **级别**：`error`

双向校验组件 `index.js` 的 `setData({ field: ... })` 与 `index.wxml` 的 `{{field}}`：

- `setData` 有 `x` 但 WXML 未用 `{{x}}` → fail（冗余 setData）
- WXML 用 `{{x}}` 但 `setData` / `properties` / 忽略名单中都没有 `x` → fail（未定义字段）

**忽略名单**：`item`、`index`、`wx`（`wx:for` 内部变量）。

### V012 原子接口若关联原子组件则需文件齐全

- **阶段**：`component`
- **级别**：`error`

`mcp.json` 中的 `apis[]` **按需**声明 `_meta.ui.componentPath`（纯操作型/中间态数据接口可不声明，仅负责执行）。**若已声明**，则组件目录必须完整。

**检查项**：

- `_meta.ui.componentPath` 未声明 → 直接 pass，跳过组件目录检查
- 若已声明：
  - 格式为 `components/<name>/index`
  - 目标目录下存在 `index.js` + `index.json` + `index.wxml` + `index.wxss` 四件套

**典型 fail**：

- `componentPath` 格式不对 → 改为 `"components/<name>/index"`
- 组件目录缺 `index.wxss` → 创建该文件

### V014 SKILL.md 必须存在且文件名严格大写

- **阶段**：`registration`，**级别**：`error`

每个 skill 目录必须存在文件名**严格为** `SKILL.md` 的文件。`skill.md` / `Skill.md` 等大小写变体一律 fail（macOS / Windows 的默认文件系统通常不区分大小写，本地编辑容易绕过检查，但 Linux / CI / 后台严格区分）。

**典型修复**：把文件重命名为 `SKILL.md`。在默认不区分大小写的系统上直接改大小写可能"改了等于没改"，可先改成临时名再改回：终端执行 `mv skill.md tmp && mv tmp SKILL.md`（用 git 管理时也可 `git mv skill.md SKILL.md`）。文件不存在则按 wxa-skills-generate `references/CODE_TEMPLATES.md` 第五节模板新建。

### V015 原子组件必须配置关联小程序页面

- **阶段**：`component`，**级别**：`error`

对 `mcp.json.apis[]` 中每个声明了 `_meta.ui.componentPath` 的接口，要求 `mcp.json` 顶层 `components[]` 存在一条 `path` 与该 `componentPath` **字符串完全相等**（含末尾 `/index`，严格相等、不做归一化）的条目，且其 `relatedPage` 字段满足：

1. **非空**（trim 后非空字符串）；
2. **必须以 `/` 开头**（绝对路径，强制约束）；
3. 去掉前导 `/` 后，**存在于项目 `app.json` 的可路由页面集合**中。该集合 = 主包 `pages[]` ∪ 所有分包 `subPackages[]`（兼容历史命名 `subpackages[]`）的 `root + '/' + page` 拼接结果；两侧均做去前导/末尾 `/` 归一化后比对。

读不到项目 `app.json` 时跳过第 3 条 pages 字面值比对，第 1、2 条仍然生效。

**典型修复**：在 `mcp.json` 顶层 `components[]` 追加 `{ "path": "<与接口 _meta.ui.componentPath 完全一致的字符串>", "relatedPage": "/<主包 pages[] 中的页面 或 分包 root+page 拼接>" }`（注意 `relatedPage` 前导 `/` 必填）；业务上没有对应页面时**兜底用 `/<app.json.pages[0]>` 首页（同样带 `/`）**。详见 wxa-skills-generate `SKILL.md` 的 C.3 节。

### V016 app.json 的 agent.skills[].description 必须存在且非空

- **阶段**：`registration`，**级别**：`error`
- **类型**：项目级校验（仅执行一次，不按 skill 目录循环）

每个 `app.json` 中 `agent.skills[]` 的条目必须包含**非空的 `description` 字段**。这是后台的硬性要求，若缺失将导致 skill 无法正常注册。

**检查项**：
- `agent.skills[]` 数组存在且非空
- 每个条目中 `description` 字段存在，且 `trim()` 后非空

**典型 fail**：
- `agent.skills` 条目只有 `{ "path": "skills/xxx" }`，缺少 `description`
- `{ "name": "xxx", "path": "skills/xxx", "description": "" }` — `description` 为空字符串

**典型修复**：在 `app.json` 的 `agent.skills` 中为每个条目补上非空的 `description`，如：`{ "name": "xxx", "description": "该 skill 的业务描述", "path": "skills/xxx" }`。

---

## 规则与错误类型映射

| 规则 id | 错误类型（SKILL.md 中的分类） | 典型修复路径 |
|---------|------------------------------|-------------|
| V001 | T5 合规性违规 | 去除主包依赖，数据通过入参传入 |
| V002 | T1 命名/结构 | 函数头补 `async` |
| V003 / V005 / V006 | T5 合规性违规 | 白名单内等价实现 |
| V007 | T6 注册缺失 | 补 `registerAPI` 或在 `mcp.json` 补 `apis[]` |
| V008 | T6 注册缺失 | 创建缺失的 `apis/<name>.js` |
| V009 | T2 Schema 不一致 | 对齐 `structuredContent` 与 `outputSchema` |
| V010 | T4 组件取值路径错 | 修 `result.structuredContent.xxx` 访问路径 |
| V011 | T3 组件绑定不一致 | 对齐 `setData` 与 WXML `{{}}` |
| V012 | T6 注册缺失（组件维度） | 若已声明 `componentPath`，补齐组件四件套 / 修正路径格式 |
| V014 | T1 命名/结构 | `SKILL.md` 文件名严格大写 |
| V015 | T-relatedPage 关联页面缺失 / path 不一致 / 缺前导 `/` | 在 `mcp.json.components[]` 补 `{ path, relatedPage }`，`path` 与接口 `_meta.ui.componentPath` **字符串完全相等**（含末尾 `/index`），`relatedPage` **必须以 `/` 开头**，无业务对应页面时填首页（`/<pages[0]>`） |
| V016 | T-skill-description skill 描述缺失 | 在 `app.json` 的 `agent.skills[]` 中为该条目补 `description` 字段 |

---

## 自定义规则

通过 `--rules <path>` 合并自定义规则 JSON：

```json
{
  "rules": [
    {
      "id": "V100",
      "name": "自定义规则示例",
      "stage": "registration",
      "level": "warning",
      "type": "regex_absent",
      "targets": ["*/apis/*.js", "*/utils/*.js"],
      "patterns": [
        { "regex": "console\\.log", "message": "生产代码不应有 console.log" }
      ]
    }
  ],
  "crossFileRules": []
}
```

相同 `id` 会覆盖内置规则。
