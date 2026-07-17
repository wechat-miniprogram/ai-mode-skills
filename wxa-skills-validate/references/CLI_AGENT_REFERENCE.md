# CLI `agent` 命令使用参考

> 真机闭环（阶段 4）必读：脚本怎么用 → 产物长什么样 → 读完产物下一步做什么。

## 目录

- [0. 前置条件](#0-前置条件)
- [1. execute — 调用原子接口](#1-execute--调用原子接口)
  - [1.1 用法](#11-用法)
  - [1.2 产物结构](#12-产物结构)
  - [1.3 通过判据](#13-通过判据)
  - [1.4 读完产物后做什么](#14-读完产物后做什么)
- [2. render — 调用原子接口并拿到卡片截图](#2-render--调用原子接口并拿到卡片截图)
  - [2.1 用法](#21-用法)
  - [2.2 产物结构](#22-产物结构)
  - [2.3 通过判据 + 5 项核对](#23-通过判据--5-项核对)
  - [2.4 读完产物后做什么](#24-读完产物后做什么)
- [3. 产物速查表](#3-产物速查表)
- [4. 依赖顺序 + 失败回溯](#4-依赖顺序--失败回溯)

---

## 0. 前置条件

| 项 | 要求 |
|---|---|
| 微信开发者工具 CLI | macOS 默认 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`；确认可执行：`<DEVTOOLS_APP_PATH>/Contents/MacOS/cli -h` |
| `project.config.json` | 含 `appid`；若配 `miniprogramRoot` 必须正确 |
| `app.json` | 含 `agent.skills[].path` |
| skill 目录 | 含 `mcp.json` + `SKILL.md` |

所有网络通信、端口、WebSocket 协议等细节都被 `execute.mjs` / `render.mjs` 封装，调用方无需关心。

---

## 1. execute — 调用原子接口

### 1.1 用法

```bash
node <skill-dir>/scripts/execute.mjs \
  --project <PROJECT_PATH> \
  --name <api-name> \
  [--args '{"query":"..."}'] \
  [--skill <skill-name-or-path>] \
  [--auto-port <AUTO_PORT>] \
  [--timeout <ms>] \
  --output ./cli-agent-run/execute-result.<name>.json
```

`execute.mjs` **仅支持** `--project / --name / --args / --output / --skill / --auto-port / --cli-path / --timeout / --help`。
toolCallId / sessionId / auto 相关票据由 CLI 内部自动处理，脚本既不接受也不下发。

### 1.2 产物结构

`execute-result.<name>.json`：

```json
{
  "command": "execute",
  "status": "ok",
  "params": {
    "name": "<API_NAME>",
    "arguments": { "query": "..." },
    "toolCallId": "<TOOL_CALL_ID>",
    "subpackage": "<SKILL_SUBPACKAGE_ROOT>",
    "componentPath": "<COMPONENT_PATH>"
  },
  "invokeResult": {
    "isError": false,
    "content": [{ "type": "text", "text": "..." }],
    "structuredContent": { /* mcp.json outputSchema 对应的结构化数据 */ },
    "hasCard": true
  },
  "consoleMessages": [ /* [ai-mode] 前缀的业务日志 */ ],
  "_meta": {
    "project": "<ABS_PATH>",
    "cliStderr": "...",
    "cliExitCode": 0
  }
}
```

关键字段：

- `status` — `"ok"` 或 `"error"`
- `invokeResult.isError` — 业务侧是否报错
- `invokeResult.structuredContent` — **下游接口的入参来源** + **render `--from-execute` 的 args 来源**；缺失时 render 会直接报错
- `params.toolCallId` — 由 CLI 内部生成，用于业务日志关联；脚本不再主动下发

### 1.3 通过判据

`status === "ok"` **且** `invokeResult.isError !== true` **且** `structuredContent` 结构符合 `mcp.json` 的 `outputSchema`。

脚本退出码：`0` 通过 / `1` 失败 / `2` 运行异常。

### 1.4 读完产物后做什么

| 情况 | 动作 |
|------|------|
| **通过** 且该接口 mcp.json 有 `_meta.ui.componentPath` | 跑 [2. render](#2-render--调用原子接口并拿到卡片截图) |
| **通过** 且无 `componentPath` | 该接口闭环完成；把 `structuredContent` 加入"已知数据池"供下游引用 |
| **失败** | 按 [4. 依赖顺序 + 失败回溯](#4-依赖顺序--失败回溯) 处理；严重错误（C 类）转 SKILL.md 阶段 4 C 类修复流程 |

---

## 2. render — 调用原子接口并拿到卡片截图

`render` 不会重新执行原子接口，而是把 `--args` 作为 `structuredContent` 直接喂给组件，触发一次完整的卡片渲染链路（创建 container → 渲染组件 → 生成 PNG 截图）。
适用场景：核对组件 UI 是否正确渲染、做视觉回归。

### 2.1 用法

**推荐：从 execute 产物继承 name / args**

```bash
node <skill-dir>/scripts/render.mjs \
  --project <PROJECT_PATH> \
  --from-execute ./cli-agent-run/execute-result.<name>.json \
  [--timeout 90000] \
  --output ./cli-agent-run/render-result.<name>.json
```

`--from-execute` 会自动继承 `name`（来自 `params.name`）和 `args`（**来自 `invokeResult.structuredContent`，
即 execute 的业务返回值**，不是 execute 的原始入参）。
任一字段被显式参数（`--name` / `--args`）覆盖时以显式值为准。

> **structuredContent 缺失时直接报错**：若 execute 产物里 `invokeResult.structuredContent` 为空或类型不对，
> render 会直接 exit 2，不会 fallback 到 `params.arguments`——因为用入参代替返回值会让组件渲染结果无意义。
> 正确做法：先重跑 execute，确认 `status=ok` 且 `invokeResult.isError !== true` 且 `structuredContent` 为非空对象后，再 render。

**独立指定**（没有 execute 产物，或需要手动指定 args）：

```bash
node <skill-dir>/scripts/render.mjs \
  --project <PROJECT_PATH> \
  --name <api-name> \
  --args '{"<字段>":"..."}' \
  [--timeout 90000] \
  --output ./cli-agent-run/render-result.<name>.json
```

`render.mjs` **仅支持** `--project / --name / --args / --from-execute / --output / --cli-path / --timeout / --help`。
CLI 下发的业务参数严格限定为 `--project / --name / --args / --output / --trust-project`（`--timeout` 在非默认值时下发），
toolCallId / sessionId / skill 由 CLI 内部每次自动生成，不暴露也不接受显式传入。

> render 首次 cold start 较慢（需要启动渲染容器），CI 或第一次调用建议 `--timeout 90000`。

### 2.2 产物结构

`render.mjs --output ./x.json` 会产出两份文件：

| 文件 | 内容 |
|------|------|
| `./x.json` | 渲染元信息 + 截图摘要 + 组件日志 + `elementTree`（由 CLI 透传，未下发时字段缺省） |
| `./x.snapshot.png` | 卡片渲染截图（PNG） |

**`./x.json` 关键字段**：

```json
{
  "command": "render",
  "status": "ok",
  "params": {
    "name": "<API_NAME>",
    "arguments": { "query": "..." },
    "toolCallId": "<TOOL_CALL_ID>",
    "componentPath": "<COMPONENT_PATH>"
  },
  "snapshot": {
    "mime": "image/png",
    "file": "x.snapshot.png",
    "absolutePath": "<ABS_PATH>/x.snapshot.png",
    "dataUrlLength": 30358
  },
  "consoleMessages": {
    "snapshotCard": [ /* 组件生命周期 + [ai-mode] 业务日志 */ ]
  },
  "elementTree": "<page:...>\n  <view:view class=\"card\">\n    ... 缩进格式的 shadow tree 字符串",
  "_meta": {
    "toolCallId": "<TOOL_CALL_ID>",
    "sessionId": "<SESSION_ID>",
    "snapshotPng": "<ABS_PATH>/x.snapshot.png",
    "verify": { "passed": true, "checks": { /* statusOk / commandIsRender / hasSnapshot / noInvokeError */ } }
  }
}
```

说明：

- `snapshot` 是摘要字段；完整 base64 已经被脚本拆出写入 `x.snapshot.png`，JSON 可直接 `read_file` 查看
- `consoleMessages.snapshotCard` 是从组件首次 `created` 到渲染完成期间采集到的所有日志，含 `[ai-mode]` 前缀业务日志和任何 `ERROR` 级异常
- `elementTree`：完全由 CLI render 下发，`render.mjs` / `lib.mjs` 不做任何加工或占位回填——CLI 没下发就没有该字段。
  格式是一段**缩进字符串**（不是 JSON 对象），序列化了卡片 shadow tree，节点形如
  `<view:view class="...">`、`<text:default-component class="temp"> 28°`、`<(virtual):wx:if>`。
  用作字段级核对的辅助信号（文案、绑定命中、列表 item 数量、`wx:if` 空状态），对字符串做 `grep` 即可；
  但**不参与 pass/fail**，缺失时以 `consoleMessages` 为准（截图仅在具备图像读取能力时辅助）
- render 产物**通常没有** 顶层 `invokeResult`（业务数据体现在 consoleMessages 的 "收到接口返回" 日志里）

**组件上行 toolCall 的期望日志**：组件内可交互元素点击后，规范要求通过
`modelCtx.sendFollowUpMessage({ content: [{ type: 'text', text }, { type: 'api/call', data: { name, arguments } }] })` 上行消息
（由 `wxa-skill-generate` 的 `COMPONENT_TEMPLATES.md` 定义）。`content` 数组中 `text` 可以单独出现（自然语言 followUp），
但 `api/call` 必须前面有 `text` 作为用户上下文。render 本身不会主动触发交互，
但在做交互可达性回归或开发态排错时，`consoleMessages.snapshotCard` 中应能看到如下业务日志：

```
[ai-mode] {componentName} send api/call name=<mcp.json 内存在的 api name> args={"<inputSchema 字段>":...}
```

若看到**组件内直接调业务接口**、`content` 只含 `api/call` 不含前导 `text`、缺 `content` 数组直接 `{ type: 'api/call', ... }`、
或 `name` 不在 `mcp.json.apis[]` 中 —— 组件实现违反上行协议，按 SKILL.md D 类修复。

### 2.3 通过判据 + 5 项核对

**基础通过**（`render.mjs` 退出码 0 的充要条件）：`command === "render"` 且 `status === "ok"` 且有 `snapshot` 文件。

但基础通过**不等于** UI 正确。必须再由调用方做 5 项核对：

| # | 核对项 | 主要依据：`consoleMessages.snapshotCard` | 辅助：截图 | 不通过时改什么 |
|---|--------|------------------------------------------|------------|----------------|
| ① | 组件已渲染 | 出现 `created` → "收到接口返回" → `setData` 三条日志 | 非纯白 / 纯黑，有内容 | 缺 `created`：查 `componentPath` / `usingComponents`；缺 `setData`：查 Result 监听 |
| ② | 数据字段齐全 | setData 字段名与接口返回字段一致 | 所有字段文本可见且非默认值 | 修 WXML 绑定 或 `result.structuredContent.xxx` 访问路径；必要时字段归一化 |
| ③ | 未被裁剪，列表 ≥ 3 item | 先看 `[ai-mode] <component> overflow monitor=on` 基线日志是否存在（缺失 = 未接入监听，判不通过）；再看有无 `[ai-mode] <component> overflow overflowed=true ...`（或 `data.overflowHeight > 0`）：出现即判裁剪不通过；只有 `monitor=on`、不出现 `overflowed=true` 即判未裁剪通过 | 底部是否存在被裁断的内容（截图仅作为辅助信号，环境不具备图像读取能力时跳过，不作判据） | `overflowed=true`：压缩 item 高度；列表做了 slice 时在 WXML 渲染"还有 N 项未展示"；缺 `monitor=on`：补监听 + 基线日志（见 wxa-skills-generate 的组件 JS 骨架） |
| ④ | 样式与源页面还原度一致 | — | 字号 / 间距 / 圆角 / 颜色与主包源页面一致（环境不具备图像读取能力时跳过） | 回主包读 `.wxml`/`.wxss`/`app.wxss` 重提视觉 token，覆盖组件 `index.wxss` |
| ⑤ | 长文本省略生效 | `elementTree` 里可 `grep` 到 `…` 或被 `-webkit-line-clamp` 压缩的文本；同时核对 ③ 判定未裁剪（存在 `monitor=on`、不出现 `overflowed=true`） | 长文本末尾 `…`，无横向溢出（辅助信号） | 给长文本加 `-webkit-line-clamp` / `text-overflow: ellipsis` 省略样式 |

> **工具能力自适应**：若当前执行环境不具备图像读取能力（无法以图像方式 `read_file` PNG 或缺少多模态输入通道），**跳过**所有基于截图的核对步骤，仅凭 `consoleMessages.snapshotCard` 的 `[ai-mode]` 日志（尤其是 `overflow`）和 `elementTree` 做判定，不将"无法读取图像"视为失败。
>
> `elementTree` 由 CLI 原样透传（缩进格式的字符串），不参与 5 项核对的 pass/fail。
> 当 CLI 下发了组件树时可作为辅助信号：核对 ② 的字段绑定、核对 ③ 的列表节点数、核对 ⑤ 的省略文本都能直接在 `elementTree` 里 `grep` 到。
> 该字段缺失时仍以 `consoleMessages` 为主。

### 2.4 读完产物后做什么

**必须读取 `render-result.<name>.json`**（仅看退出码 0 不够）：

1. 读 `consoleMessages.snapshotCard`，做核对 ①②③⑤
   - 重点 1：在里面搜 `[ai-mode] <component> overflow monitor=on`，缺失说明组件未接入 `NotificationType.Overflow` 监听，按不通过处理，回到 wxa-skill-generate 的组件 JS 骨架补齐
   - 重点 2：若能搜到 `[ai-mode] <component> overflow overflowed=true ...`（或 `data.overflowHeight > 0`），判定为裁剪（核对 ③ 不通过）；只有 `monitor=on`、没有 `overflowed=true` 即视为未裁剪通过
2. 读 `elementTree`（若存在），辅助核对 ②⑤ 的字段绑定 / 省略文本
3. **若当前环境可以图像方式 `read_file` 读入** `render-result.<name>.snapshot.png`：再对照核对 ①④（样式还原度），作为辅助信号
4. **若当前环境不具备图像读取能力**：跳过截图步骤，不作为通过/不通过的判据；核对 ④（样式还原度）在这种情况下退化为"`elementTree` 中字段存在即视为通过"，并在 `report.md` 中注明"本次运行未进行截图比对"

然后：

| 情况 | 动作 |
|------|------|
| 5 项核对全部通过 | 该接口闭环完成 |
| 截图空白 / 内容缺失 | 查 `consoleMessages.snapshotCard`：若有 `ERROR` 级日志（如 `ReferenceError: xxx is not defined`），是业务组件初始化异常，按 SKILL.md D 类修复流程处理 |
| 数据字段缺失 / 路径取错（核对 ②） | 回 `execute-result.<name>.json` 看 `invokeResult.structuredContent` 的真实字段名，改 `components/<name>/index.js` 的取值路径，重跑 render（无需重跑 execute） |
| 样式 / 裁剪 / 省略问题（核对 ③④⑤） | 只改 `components/<name>/index.wxml` + `index.wxss`，重跑 render 复用已有 execute 产物 |
| `status === "error"`（如 `timeout waiting for snapshotCard callback`） | 先重试一次（render cold start 偶发超时）；重试仍失败按 SKILL.md D 类处理 |

---

## 3. 产物速查表

| 脚本 | 主产物 | 关键字段 | 下游用途 |
|------|--------|----------|----------|
| `validate.mjs` | `cli-agent-run/validate-report.json` | `summary.errors` / `results[]` / `build` | 阶段 1 通过判据 |
| `execute.mjs` | `cli-agent-run/execute-result.<name>.json` | `status` / `invokeResult.isError` / `invokeResult.structuredContent` | 下游接口入参；`render.mjs --from-execute` 的 args 来源（缺 structuredContent 时 render 会直接报错） |
| `render.mjs` | `cli-agent-run/render-result.<name>.json` + `render-result.<name>.snapshot.png` | `status` / `snapshot.*` / `consoleMessages.snapshotCard` / `elementTree`（CLI 原样透传，可缺失） | 5 项核对 |

**重要约定**：

1. 多接口时 `--output` 必须带接口名，避免互相覆盖；同一接口重跑可覆盖同名文件
2. `render` 不会重新执行原子接口，CLI 直接把 `--args` 作为 `structuredContent` 喂给组件渲染；`--from-execute`
   只是把 execute 的 `invokeResult.structuredContent` 作为 args 喂给 render，节省手写 args 的成本
3. render 产物 JSON 里的 `snapshot` 已是摘要（无 base64），可安全 `read_file`；PNG 独立存放于同名 `.snapshot.png`

---

## 4. 依赖顺序 + 失败回溯

### 4.1 按依赖拓扑顺序执行 execute

执行前先构建依赖图：

- 从 `mcp.json` 的 `description` / `inputSchema` 文字识别参数依赖
- 从 `SKILL.md` 的 storage key 清单识别写入方 → 读取方关系

合并排序得到序列 `[A, B, C, ...]`，按序跑 execute。每步成功后把 `structuredContent` 记入"已知数据池"。

**入参来源优先级**：

1. 用户明确指定的 `--args`
2. 上游 `structuredContent` 同名 / 同义字段（自动取自已知数据池）
3. storage 内部读取（该接口实现会自己读 storage，无需传参）
4. 类型默认值（同时在 `execute-trace.json` 记录"使用默认值"）

### 4.2 execute 失败回溯

`invokeResult.isError === true` 时先按错误文本分类，不要立刻转 C 类：

| 错误特征 | 类型 | 回溯动作 | 重试上限 |
|----------|------|----------|----------|
| `missing required parameter` / `参数不能为空` / `xxx is undefined` | A | 依赖图找上游，先跑上游提取字段后带参重试 | 3 |
| `invalid parameter` / `参数格式错误` / `类型不匹配` | A | 同上，额外做字段名 / 类型映射 | 3 |
| `no data` / `读取 storage 失败` / `getStorageSync 返回 null` | B | 先跑 storage 写入方接口再重试 | 2 |
| 返回空列表 / 空对象但 `isError === false` | **E 空结果** | **不能直接判通过**——先排查请求是否正确（见下方 E 类流程）| 3 |
| `network` / `timeout` / `500` / `unauthorized` | C | 直接进 SKILL.md C 类（改 `apis/*.js` / `utils/util.js`） | 0 |
| `not registered` / `undefined handler` | C | T6 注册缺失，改 `index.js` registerAPI | 0 |
| `Skill code loading failed` / `module ... is not defined` / `require args is ...` | C | 进 SKILL.md **C.2 子类**：核对 `app.json` 的 `subPackages`（skills 分包 + `independent:true`）、`agent.skills[].path`、`project.config.json` 的 `packOptions.include` | 0 |

**A / B 类回溯流程**：

```
接口 X 失败
  → 读 invokeResult.error + consoleMessages 的 [ai-mode] 日志判定类型
  → A：依赖图找上游 Y → 若未跑则先 execute Y → 带参重跑 X
       Y 已跑但字段名不匹配 → 字段映射后重试
       依赖图无 Y → 转 C
  → B：storage key 清单找写入方 Z → execute Z → 重跑 X
       Z 已跑但 storage 仍空 → 转 T7（storage 链路问题，SKILL.md）
  → C：进 SKILL.md C 类修复流程
```

**E 类（空结果）排查流程**：

```
接口 X success 但 structuredContent 业务数据为空（空列表 / 空对象 / total:0 / 只有 error 字段）
  → 步骤 1：读 consoleMessages 的 [ai-mode] 日志，确认请求实际发出的 URL / 参数 / header
  → 步骤 2：读主包源码定位该接口真实请求结构
       URL / method / 参数名 / 鉴权头 / 响应拆包路径
       主包真实响应有数据？ 
        → 有 → 代码请求构造有误（参数名/值/通道/header 缺失）→ 改 apis/<X>.js → 重跑
        → 无 → 继续步骤 3
  → 步骤 3：对比主包真实请求与代码实际发出的请求
       URL / method / 参数名 / 鉴权头是否一致？ 
        → 不一致 → 改 apis/<X>.js 或 utils/request.js → 重跑
        → 一致 → 继续步骤 4
  → 步骤 4：鉴权排查
       主包请求封装需要的登录态/token，apis/<X>.js 入口是否补齐 await ensureLogin() 等？
        → 否 → 补上 → 重跑
        → 是 → 继续步骤 5
  → 步骤 5：确认请求与主包真实请求完全一致仍空
       → 可能是后端环境差异（测试账号无数据 / 非业务时段 / 数据被清理）
       → 在 trace 记录"已排查请求正确，疑似环境无数据"，允许带声明通过
```

> **关键原则**：空结果 ≠ 成功。`isError === false` 只代表接口没抛异常，不代表业务数据正确。生成侧代码的 URL/参数/鉴权任何一个出错，后端都可能返回 200 + 空数据而非报错——这种情况必须排查到"请求与 probe 真实请求一致"才能放行，如果有必要，可以重读源码。

回溯全程追加写入 `./cli-agent-run/execute-trace.json`（字段见 SKILL.md "回溯记录" 节）。
重试上限耗尽仍失败才升级为 C 类。
