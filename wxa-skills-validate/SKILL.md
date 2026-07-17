---
name: wxa-skills-validate
description: 校验和修复小程序 AI SKILLs 产物。在以下场景触发：对 skills/ 目录做静态校验、跑通原子接口、验证原子组件渲染、修复校验报错、输出交付文档。依托微信开发者工具进行真机验证。
metadata:
  author: Tencent
  version: '0.2.1'
---

# wxa-skills-validate

对小程序 AI SKILLs 产物执行"**静态校验 → 原子接口执行 → 原子组件渲染 → 交付文档**"的闭环校验，并在每一步失败时按错误类型分类就地修复 skill 源文件。

## 依赖

- Node.js ≥ 18（`scripts/*.mjs` 用到 `node:crypto` / 原生 `fetch`）
- 微信开发者工具已安装，CLI 可执行：`<DEVTOOLS_APP_PATH>/Contents/MacOS/cli -h`（macOS 默认 `<DEVTOOLS_APP_PATH>=/Applications/wechatwebdevtools.app`）
- 项目 `project.config.json` 含 `appid`；`app.json` 含 `agent.skills`；每个 skill 目录含 `mcp.json` + `SKILL.md`

## 触发条件

出现下列任一情况时启动本技能：

- 显式要求对 skills 目录做 "校验 / 跑通 / 渲染 / 出交付文档" 中任一项
- 已有 skills 产物（无论来源）需要进入验证阶段
- 跑出 skills 的校验报错需要修复

## 必需信息

| 项 | 说明 | 缺失时动作 |
|---|---|---|
| `<project-path>` | 小程序项目根目录（含 `project.config.json` + `app.json`；`app.json` 的 `agent.skills[].path` 指向 skill 分包） | 向用户询问 |
| `<DEVTOOLS_APP_PATH>` | 微信开发者工具应用路径 | macOS 默认 `/Applications/wechatwebdevtools.app`，用户可覆盖 |
| `<AUTO_PORT>` | auto WebSocket 端口 | 默认 `9420` |

> 注：`<skills-path>` 已**不再作为入参**，脚本自动从 `app.json` 发现分包。

## 参考资料（按需加载）

进入"步骤 4：真机闭环"时**必须**先读 `references/CLI_AGENT_REFERENCE.md`，内含脚本用法、产物结构、读产物后的下一步动作、5 项核对对照表、失败回溯流程。

| 文件 | 用途 | 加载时机 |
|------|------|---------|
| `references/CLI_AGENT_REFERENCE.md` | CLI `agent` 命令参考 | 步骤 4 执行前 |
| `references/VALIDATE_RULES.md` | validate.mjs 内置的 V001~V018 规则详解 | 出现校验报错需定位 id 时 |
| `references/DELIVERY_TEMPLATE.md` | `DELIVERY.md` 交付模板 | 最终交付时 |

---

## 验收目标（不可降级）

- `<project-path>` 下 `app.json` 发现的每个 skill 分包，其 `mcp.json` 声明的所有原子接口必须跑通 execute（`status === "ok"` 且 `invokeResult.isError !== true`）。
- 所有带 `_meta.ui.componentPath` 的原子接口，必须跑通 render 且通过 5 项核对（见 `references/CLI_AGENT_REFERENCE.md` 第 2.3 节）。
- 单接口连续修复 5 轮仍不通过才允许挂起。不得跳过任何一项。
- 静态/编译通过 ≠ 验收通过：须真机 execute + render 5 项核对；execute 未跑成时不得判通过、不产出 `DELIVERY.md`（见「不可修复类」与「终止条件 4」）。

---

## 执行清单（复制后勾选，逐项完成）

```
阶段 1 — 静态校验 + 编译校验
- [ ] 运行 `node validate.mjs <project-path>`（单参数，脚本自动发现 skill 分包并决定是否跑 preview）
- [ ] summary.errors === 0（含 V001~V018），否则按 T1~T9 分类修复后重跑
- [ ] summary.buildStatus === "pass"（静态 0 error 时 preview 会自动运行；
      若为 "skipped" 说明静态未过，先按上一项修复）
- [ ] 阅读 Build 行：若 stage=compile + FAIL，说明有语法/编译错误，必须修复

阶段 2 — 准备
- [ ] 确认 CLI 可执行：<DEVTOOLS_APP_PATH>/Contents/MacOS/cli -h
- [ ] （可选）显式启动 cli auto

阶段 3 — 构建执行计划
- [ ] 解析每个 <skill>/mcp.json 的 apis[]，按书写顺序 + 参数依赖做拓扑排序
- [ ] 建立"已知数据池"（空）

阶段 4 — execute 与 render（可独立执行）
对每个 {name}：
- [ ] execute 成功（status=ok 且 !isError）
- [ ] 若 mcp.json 有 _meta.ui.componentPath，render 可在任何时间点执行（不要求紧跟 execute）
- [ ] render 通过 --from-execute 复用最新的 execute 产物（args 取自 invokeResult.structuredContent）；
      structuredContent 缺失时必须先重跑 execute
- [ ] 5 项核对全部通过（主要依据：`consoleMessages.snapshotCard` 中的生命周期日志 + `[ai-mode] ... overflow monitor=on` 基线日志 + 不出现 `overflowed=true`；仅在具备图像读取能力时再辅助读截图）

阶段 5 — 交付
- [ ] 写 ./cli-agent-run/report.md
- [ ] 若全部通过，按 references/DELIVERY_TEMPLATE.md 写 ./DELIVERY.md 并回贴内容
```

---

## 工作目录

在 `<project-path>` 同级建 `./cli-agent-run/` 统一存放产物：

```
cli-agent-run/
├── validate-report.json                   # 阶段 1 产物
├── execute-result.<apiName>.json          # 阶段 4 execute 产物（含 invokeResult.structuredContent 供 render 继承）
├── render-result.<apiName>.json           # 阶段 4 render 产物（snapshot 摘要 + consoleMessages + elementTree）
├── render-result.<apiName>.snapshot.png   # 阶段 4 render 截图
├── execute-trace.json                     # 每次尝试的回溯日志
└── report.md                              # 阶段 5 执行报告

项目根目录/
└── DELIVERY.md                            # 全部通过时的最终交付文档
```

同一接口重跑时必须复用 `--output`（文件会被覆盖）；不同接口必须用不同文件名。

---

## 阶段 1 — 静态校验 + 编译校验（合并为一次运行）

**运行**：

```bash
node <skill-dir>/scripts/validate.mjs <miniprogram-project-path>
```

**入参只需要一个——小程序项目根目录**（含 `project.config.json` + `app.json`）。脚本自动：

1. 读 `app.json` 的 `agent.skills[].path` 发现 skill 分包（没配置时回退到顶层 `metaServicePkg/` 或 `skills/`）
2. 静态规则只在 **skill 分包目录内** 执行，不触及主包代码
3. 把校验产物目录 `cli-agent-run/` 写入 `project.config.json` 的 `packOptions.ignore`（打包忽略）和 `watchOptions.ignore`（监听忽略），避免开发者工具持续监听产物变更触发循环编译（已存在不会重复追加；产物落盘前完成同步，结果挂在报告 `ignoreSync` 字段）
4. 静态校验通过（`errors === 0`）后自动调用 `cli preview` 做编译校验；有 error 则跳过 preview
5. 报告落盘到 `<project>/cli-agent-run/validate-report.json`（可用 `--output` 覆盖）

可选参数：`--rules <自定义规则 json>` / `--cli-path <CLI 路径>` / `--build-timeout <ms>` / `--output <path>`。

**退出码**：`0` 通过；`1` 存在 error 或 build 失败；`2` 运行异常。

**通过判据**：
- `summary.errors === 0`（warning 允许带着进入阶段 2）
- `summary.buildStatus === "pass"`（静态 0 error 后会自动触发 build；`"skipped"` 意味着静态未过，先按修复决策表修复）
- Build 行 `stage=compile + FAIL` 说明有语法/编译错，必须修复

**Build 编译报错时：优先检查集成配置，再动源码**。对照 wxa-skills-generate `SKILL.md` 的"阶段 6 — 配置集成"与 `references/CODE_TEMPLATES.md` 的"六、app.json + project.config.json 配置"核对 `app.json`（`agent.skills` / `subPackages`）与 `project.config.json`（`appid` / `packOptions.include`）。集成无误后才按日志改源码，**禁止用注释/删除源码的方式绕过集成问题**。

**CLI 未找到时的处理**：若输出 `Build: SKIPPED - 跳过：未找到微信开发者工具 CLI`，说明脚本未能自动定位到 `cli`。自动探测顺序为：`--cli-path` > 环境变量 `WECHAT_DEVTOOLS_CLI` / `WXA_CLI` > macOS `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` > 同路径的用户目录变体 > Windows `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`。此时应主动向用户询问微信开发者工具的安装路径，然后：

- 重跑：`node validate.mjs <project-path> --cli-path <用户提供的绝对 cli 路径>`
- 或建议用户设置环境变量：`export WECHAT_DEVTOOLS_CLI=<绝对路径>` 后重跑

CLI 缺失不影响静态规则的输出，只会让 build 阶段被 skip。

**执行顺序**（脚本内部闭环）：
1. 同步 `project.config.json` 的 `packOptions.ignore` + `watchOptions.ignore`（追加 `cli-agent-run/`）
2. 发现 skill 分包 → 只在分包内跑 V001~V018
3. 有 error → build=`skipped`（节省 preview 成本）；0 error → 调 `cli preview`
4. 到达 `upload` 阶段视为编译通过；即便上传失败（服务端校验、网络等），也不标记 build 失败

**失败时的修复决策表**（读完 `validate-report.json` 中 `results[].id` / `message` / `fix` 后匹配）：

| 错误类型 | 识别特征 | 修复范围 | 动作 |
|---------|---------|---------|------|
| **T1 命名拼写** | 字段大小写/拼写错 | 单文件单行 | 直接改 |
| **T2 Schema 不一致** | `structuredContent` 与 `outputSchema.properties` 字段不匹配（V009） | `apis/{name}.js` + `mcp.json` | 对齐字段 |
| **T3 组件绑定不一致** | WXML `{{}}` 与 `setData` 字段对不上（V011） | `components/{x}/index.{js,wxml}` | 对齐绑定 |
| **T4 组件取值路径错** | `result.structuredContent.xxx` 与接口返回字段不符（V010） | `components/{x}/index.js` | 修访问路径 |
| **T5 合规性违规** | 非白名单 WXML 标签 / CSS 属性（V003/V005/V006） | 单文件改写 | 用白名单实现替换 |
| **T6 注册缺失** | `mcp.json` 的 `name` 在 `index.js` 未 `registerAPI`，或反之（V007/V008） | `index.js` | 补/删注册 |
| **T7 依赖链路问题** | storage key 写入方/读取方对不上 | 跨接口 + `utils/util.js` | 跨文件调整 |
| **T8 原子接口粒度错** | 接口职责重叠 | `mcp.json` + `index.js` + `apis/*.js` | 拆分/合并 `apis[]` |
| **T-mcp-size** | `mcp.json` 去除 outputSchema 后超过 24000 字符（V013；后台也会拒绝） | `mcp.json` 的 description/title/inputSchema；或重划 skill 分包 | 压缩描述文字；接口多到难以精简时按职责拆分为多个 skill 分包，**不要把示例/枚举硬塞进 outputSchema** |
| **T-auth 鉴权缺失** | `401` / `unauthorized` / `token 无效` 等（静态阶段通常由 V007/V008 连带触发） | `utils/util.js` / `apis/{name}.js` | **读主包**还原登录流程 |
| **T-wx-jsapi 非白名单** | 运行时 `wx.<xxx> is not a function` / `wx.<ns>` 为 undefined | `apis/{name}.js` / `components/{x}/index.js` | 对照 wxa-skills-generate `SKILL.md` D.1/D.2 白名单（**完整清单**见 `wxa-skills-generate/references/JSAPI_WHITELIST.md`），按 D.7 替换或改网络请求；无替代标 T9（详见阶段 4 C 类） |
| **T-build 编译失败** | Build 行显示 FAIL 且 stage=compile | 项目集成 / `.js` / `.wxml` / `.wxss` | 先对照 wxa-skills-generate `SKILL.md` 阶段 6 "配置集成" 核对 `app.json` / `project.config.json`，集成无误后再按日志修源码 |
| **T-skill-description** | `app.json` 的 `agent.skills[].description` 缺失或为空（V016） | `app.json` | 在该条目中补充非空的 `description` 字段 |
| **T-handoff** | 接力页 `_meta.ui.pagePath` 格式错/页面不存在/带 query，或声明了 pagePath 却未返回 `handoff`（V017） | `mcp.json` + `apis/{name}.js` | pagePath 以 `/` 开头、不含 query、页面真实存在；返回值顶层补 `handoff: { query, payload? }`（详见 wxa-skills-generate `SKILL.md` D.6） |
| **T-handoff-query** | `handoff.query` 的 key 与接力页 `onLoad` 参数名不匹配（V018） | `apis/{name}.js` | 读接力页 `<pagePath>.js` 的 `onLoad(param)` 确认其读取的 `param.xxx` 名称，将 `handoff.query` 的 key 改为页面实际读取的名称 |
| **T9 能力无法实现** | 所有候选都违反硬约束 | — | ⛔ 终止，告知用户 |

V001~V018 规则详情见 `references/VALIDATE_RULES.md`。

**判别口诀**：文件内能改完 → T1~T6；需改 storage 清单或接口划分 → T7/T8；连修复方案都违规 → T9。

**迭代规则**：

| 情况 | 动作 |
|------|------|
| `summary.errors === 0` | ✅ 进入阶段 2 |
| errors 数较上一轮减少 | 继续修复，重跑 |
| 连续 3 轮相同 finding id | 升级为 T7/T8 跨文件调整 |
| 累计 5 轮仍未通过 | ⛔ 终止，请求人工介入 |

---

## 阶段 2 — 准备 CLI `agent` 命令

**确认 CLI 可执行**：

```bash
<DEVTOOLS_APP_PATH>/Contents/MacOS/cli -h
```

失败则告知用户 "确认微信开发者工具已安装" 后停止，不要强行绕过。

**（推荐）先 open 预热再 auto**（约 10s，大项目可延长），减少 websocket 超时：

```bash
<DEVTOOLS_APP_PATH>/Contents/MacOS/cli open --project <PROJECT_PATH>
<DEVTOOLS_APP_PATH>/Contents/MacOS/cli auto \
  --project <PROJECT_PATH> --auto-port <AUTO_PORT> --trust-project
```

跳过此步时脚本会自动拉起 auto；遇超时或 `agent compile mode is disabled` 时按「不可修复类 / 工具不稳定」处理。

---

## 阶段 3 — 构建执行计划

读取 `<project-path>` 下 `app.json` 发现的每个 skill 分包的 `mcp.json`（`validate-report.json` 中的 `skillDirs` 字段给出了具体分包路径）：

1. 汇总 `apis[]` 的 `name` / `description` / `inputSchema` / `outputSchema` / `_meta.ui.componentPath`。
2. **按入参依赖排序**（拓扑序）：
   - 无参接口（`inputSchema.properties` 为空或无 `required`）→ **最先执行**
   - 有参接口 → 排在其参数来源接口之后
   - `description` 或 `inputSchema` 含 "需要先调用 X" 类表述时，将 X 前置
3. 维护"已知数据池"：每个接口成功后把 `structuredContent` 存入池中，供下游参数引用。
4. **有参接口的参数填充优先级**：先查已知数据池（上游接口 `structuredContent` 的同义字段），池中没有才考虑用户指定或默认值——**禁止在有数据池可用时直接用默认值测试有参接口**。

---

## 阶段 4 — execute 与 render

`execute` 和 `render` 是**两个独立可重入**的命令：

- `execute` 调用原子接口，产出业务数据（`invokeResult.structuredContent`）。
- `render` 通过 `--from-execute` 把 execute 的 `invokeResult.structuredContent` 作为渲染数据源喂给组件；
  也可以 `--name` + `--args` 独立指定。CLI 内部每次 render 会自动生成一次性 toolCallId / sessionId，
  不依赖 execute 的运行时上下文。

**执行灵活度**：

- 可以一次 execute 所有原子接口、再统一批量 render
- 也可以"单接口 execute → render"交替进行
- render 的数据来源优先级：`--args` 显式指定 > `--from-execute` 读到的 `invokeResult.structuredContent`

**硬约束**（仅保留真正必要的）：

- **执行顺序：先无参后有参**——无参接口先批量 execute 成功，其 `structuredContent` 入数据池后，有参接口再从池中取参数值 execute。禁止在有数据池可用时直接用默认值测试有参接口
- 按 `apis[]` 顺序依赖关系准备好入参（下游接口的 args 若依赖上游 `structuredContent`，仍需先 execute 上游）
- 每个带 `componentPath` 的接口最终都要 render 通过；完整通过的判据仍然是"execute 成功 + render 5 项核对通过"
- 同一条 CLI 调用内，`render.mjs` 不能并发执行（CLI 后台 auto 是串行的）
- `--from-execute` 的 execute 产物必须含 `invokeResult.structuredContent`；若缺失，`render.mjs` 会直接报错，需先重新 execute 成功后再 render

### 4.1 execute

**运行**：

```bash
node <skill-dir>/scripts/execute.mjs \
  --project <PROJECT_PATH> \
  --name <name> \
  [--args '{"query":"..."}'] \
  [--auto-port <AUTO_PORT>] \
  [--skill <skill-name-or-path>] \
  [--timeout <ms>] \
  --output ./cli-agent-run/execute-result.<name>.json
```

`execute.mjs` **只接受** 上述参数；toolCallId / sessionId / auto 相关票据由 CLI 内部自动处理，脚本不再暴露。

**入参来源优先级**：

1. 用户指定
2. **已知数据池**（上游接口 `structuredContent` 的同义字段）——有参接口必须先尝试从已成功执行的无参/上游接口的 `structuredContent` 中提取参数值，而非直接用默认值。例：`getOrderDetail` 需要 `orderId` → 先跑 `listOrders`（无参），从其 `structuredContent.orders[0].id` 取 `orderId`
3. `inputSchema` 允许为空 → 省略 `--args`
4. 类型默认值（string `""`、number `0`、array `[]`、object `{}`），日志标注"使用默认值"——**仅当数据池无对应字段且用户未指定时才用**

**成功判据**：`status === "ok"` 且 `invokeResult.isError !== true` 且 `invokeResult.structuredContent` 为非空对象
（后者是 render `--from-execute` 的前置条件）。

**空结果排查（success 但 structuredContent 业务数据为空）**：`isError !== true` 但返回的 `structuredContent` 是空列表 / 空对象 / `total: 0` / 只有 `error` 字段时，**不能直接判通过**——这通常是请求参数错误、鉴权未生效、URL 拼错或响应拆包路径错的症状，而非业务上真的无数据。按以下顺序排查：

1. **读 consoleMessages 的 `[ai-mode]` 日志**：确认请求实际发出的 URL / 参数 / header 是否正确（入口日志 → 请求前日志 → 请求后日志）
2. **读主包源码定位真实请求**：找到该接口在主包中对应的页面/请求封装，确认真实 URL / method / 参数名 / 鉴权头 / 响应拆包路径
3. **对比主包真实请求与 `apis/<name>.js` 实际发出的请求**：URL / method / 参数名 / 鉴权头是否一致？不一致 → 回 `apis/<name>.js` 或 `utils/request.js` 修正
4. **鉴权排查**：主包请求封装需要的登录态/token，`apis/<name>.js` 入口是否补齐 `await ensureLogin()` 等 → 鉴权缺失会导致后端返回空而非报错
5. 排查后修正 → 重跑 execute；仍空且确认请求与主包真实请求完全一致 → 可能是后端环境差异（测试账号无数据），在 trace 记录"已排查请求正确，疑似环境无数据"，允许带声明通过

**execute 失败**：先检查产物 `_meta.diagnosis` 是否为不可修复类（若是则立即停止），否则按下方"阶段 4 失败分类"的 A/B/C/D 类处理。

### 4.2 render（仅当 mcp.json 中该 api 有 `_meta.ui.componentPath` 时执行）

只要给对的 `name` + `args`（渲染数据源）就能渲染。CLI 的 render **不会重新执行原子接口**，而是把 `--args`
作为 `structuredContent` 直接喂给组件渲染；`--from-execute` 只是一个语法糖，用来把 execute 产物里的
`invokeResult.structuredContent` 直接喂给 render。

**推荐运行方式**（从 execute 产物继承 `name` / `args`，args 来源为 `invokeResult.structuredContent`）：

```bash
node <skill-dir>/scripts/render.mjs \
  --project <PROJECT_PATH> \
  --from-execute ./cli-agent-run/execute-result.<name>.json \
  [--timeout 90000] \
  --output ./cli-agent-run/render-result.<name>.json
```

> 若 execute 产物缺 `invokeResult.structuredContent`，脚本会直接 exit 2 报错——
> 此时必须先重跑 execute 并确认 `status=ok` + `invokeResult.isError!==true` + `structuredContent` 为非空对象。

**独立指定上下文**（没有 execute 产物，或需要手动指定 args）：

```bash
node <skill-dir>/scripts/render.mjs \
  --project <PROJECT_PATH> \
  --name <tool-name> \
  --args '{"<字段>":"..."}' \
  [--timeout 90000] \
  --output ./cli-agent-run/render-result.<name>.json
```

`render.mjs` 自动从 `--from-execute` 继承 `name` / `args`；任一字段被 `--name` / `--args`
等显式参数提供时以显式值为准。CLI 下发的参数仅限 `--project / --name / --args / --output / --trust-project`
（及必要时的 `--timeout`），其它上下文由 CLI 内部自动生成，无需也无法从脚本显式传入。

> render cold start 通常比 execute 慢（需要创建 container + 渲染组件），首次调用或 CI 环境建议 `--timeout 90000`。
> 详细参数、产物结构、读产物后下一步动作见 `references/CLI_AGENT_REFERENCE.md` 第 2 节。

**必须读取的产物**（仅靠 `render.mjs` 退出码 `0` 不足以判通过）：

- **console 日志（主要依据）**：`render-result.<name>.json` 的 `consoleMessages.snapshotCard`。必看：
  - `[ai-mode] ... created` → `[ai-mode] ... 收到接口返回` → `[ai-mode] ... setData` 三条生命周期日志（缺任何一条 → 组件初始化或 Result 监听有问题）
  - `[ai-mode] <component> overflow monitor=on`（**基线日志，必存在**）：组件已绑定 `NotificationType.Overflow` 监听。缺失 → 视为未接入监听，回 wxa-skill-generate 的组件 JS 骨架补齐
  - `[ai-mode] <component> overflow overflowed=true data=<JSON>`（或 `data.overflowHeight > 0`）：有裁剪，核对 ③ 不通过。只要出现一次就判失败；只有 `monitor=on`、没有 `overflowed=true` 记录则视为未裁剪通过
  - 任何 `ERROR` 级日志基本意味着业务组件初始化失败，截图会是空白
- **组件树 `elementTree`**（辅助核对，原样透传）：`render-result.<name>.json` 的 `elementTree` 完全由 CLI render
  返回，是一段缩进格式的**字符串**（非 JSON 对象），序列化了卡片的 shadow tree，形如
  `<view:view class="addr-row">...`、`<text:default-component class="temp">... 28°`、
  `<(virtual):wx:if>` 等节点。`render.mjs` / `lib.mjs` 不做任何加工或占位回填——CLI 没下发就没有该字段。
  它**不参与 pass/fail 判定**，仅作为辅助信号：用来核对字段文案是否命中绑定、列表节点数量、
  `wx:if` 空状态是否生效等（对字符串做 `grep` 即可）
- **截图（辅助）**：`render-result.<name>.snapshot.png`。**仅在当前运行环境具备图像读取能力**时，以图像方式 `read_file` 读入，辅助核对样式还原度（核对 ④）。若当前环境不具备图像读取能力，**跳过**截图读取，不视为失败；核对 ③（裁剪）完全以 `overflow` 日志为准，不回退到基于截图的视觉判断

**5 项核对**见 `references/CLI_AGENT_REFERENCE.md` 第 2.3 节。任一不通过 → 留在本接口继续修复。

### 4.3 闭环自检（整体判通过前的硬门闩）

每个带 `componentPath` 的接口都满足下列全部才允许标为通过：

- [ ] 存在 `execute-result.<name>.json`，其 `status === "ok"` 且 `invokeResult.isError !== true`
- [ ] 存在 `render-result.<name>.json`
- [ ] 5 项核对全部通过（含 `consoleMessages.snapshotCard` 中存在 `[ai-mode] ... overflow monitor=on` 基线日志、且不出现 `overflowed=true`；截图仅在具备图像读取能力时作为辅助信号）

---

## 阶段 4 失败分类与修复流程

### 不可修复类：环境 / 权限问题（非代码错误）

**先检查 `_meta.diagnosis`**：非 null 即环境/权限问题，停止改代码，把 `hint` 原样转述给用户（勿笼统断言"无权限"）。此情形不得判通过、不产出 `DELIVERY.md`。

按 `_meta.diagnosis.type` 区分处理：

**`miniprogram_not_runnable`**（CLI 返回 `agent compile mode is disabled`）：表示小程序主包/分包未能正常编译运行——agent 能力要在小程序能正常跑起来时才自动就绪（`cli preview` 走到 upload 的"编译通过"只代表能打包，不代表运行时不白屏）。按 `hint` 逐条排查：
1. 在开发者工具打开项目，确认能正常运行、无白屏，控制台无 `app.js` / `hack.js` 运行时报错（如 `Cannot set properties of undefined`、`appServiceSDKScriptError`）
2. `regeneratorRuntime` 类报错通常源于 `project.config.json` 的 `es6` / `enhance` 编译设置与线上不一致，按能正常运行的配置对齐。
3. `appid missing` / cloud init error 说明 `project.config.json` 缺 `appid` 或云开发未初始化，补齐后重试
4. 确认 `app.json` 的 `agent.skills` / `subPackages` 配置正确，skill 目录含 `mcp.json`
5. 首次打开可能尚未就绪，重开一次项目预热后再重试

**`agent_env_unreachable`**：CLI stdout 含 `timeout waiting for auto websocket` 且 stderr 含 `Fetching AppID (wx...) detailed information ✖`。多种可能，**不可直接归因为无权限**，须把 `hint` 里的可能性逐条转述给用户，排查顺序：
1. 开发者工具 / 基础库 agent 运行时异常或版本过旧 → 切线上基础库、用 `--debug` 重试
2. 自动化通道未连上 / 端口不一致 → 确认服务端口已开启，必要时指定 `--auto-port`
3. 工具未登录或账号不是该 AppID 成员 → 重新登录并确认账号权限
4. 网络无法访问微信后台 → 检查代理 / VPN / 防火墙
5. 以上均正常仍失败，才考虑 AppID 未开通 AI 开发模式权限

**工具不稳定**（`_meta.diagnosis` 为 null 但 execute 超时/掉线/`Adapter wait timeout`/runtime 未 attach）：非代码 bug，禁止改代码判通过。处理：`cli open` 预热 → `--timeout 120000+` → 工具保持前台，必要时重启；仍失败则停止，不产出 `DELIVERY.md`。

> **`diagnosis === null` ≠ 都是"工具不稳定"**——`execute.mjs`/`render.mjs` 仅在识别到确定性环境信号（`agent compile mode is disabled` / `Fetching AppID ✖` 等）时写 `diagnosis`；其余一律留 null。`diagnosis === null` 时按 `error` / `consoleMessages` 的**具体错误特征**判定归类：
> - 超时 / 掉线 / `Adapter wait timeout` / runtime 未 attach → **工具不稳定**（本节）
> - `missing required parameter` / `xxx is undefined` → **A 类**（下方）
> - `no data` / `getStorageSync 返回 null` → **B 类**（下方）
> - `network` / `500` / `unauthorized` / `wx.<xxx> is not a function` / JS 抛异常 → **C 类**（下方）
> - `status: ok` + `isError: false` + 数据空 → **E 类**（下方）
>
> **禁止**把 A/B/C/E 类业务错误伪装成"工具不稳定"逃避修复。

---

### 修复范式（确认非不可修复类后，每次失败按此顺序走）

```
- [ ] 步骤 1：读运行时产物（execute-result / render-result 的 `error` / `consoleMessages`；
      `elementTree` 由 CLI 返回时可辅助定位字段/绑定问题，缺失时跳过；
      `snapshot.png` 仅当环境具备图像读取能力时再辅助核对，否则跳过）
   - 先检查 `_meta.diagnosis` —— 若非 null → 不可修复类，立即停止
   - **若报错形如 `wx.<xxx> is not a function` / `Cannot read property '<xxx>' of undefined`
     → 直接跳到 C.1 子类按白名单比对处理**
- [ ] 步骤 2：回到主包源码定位真实逻辑（页面 .js / utils/request.js / app.js / cloudfunctions/*）
- [ ] 步骤 3：对比分包实现，列出差异点再改（`apis/<name>.js` / `utils/util.js` / `components/<name>/*`）
- [ ] 步骤 4：若涉及接口划分 / storage 链路，改 mcp.json 的 apis[] 并同步 index.js 注册
- [ ] 步骤 5：重跑 execute 验证数据正确；涉及 UI/WXML/WXSS 改动时单独跑 render 验证渲染
      （render 可通过 --from-execute 复用之前的 execute 产物，前提是该产物仍含 invokeResult.structuredContent）
- [ ] 步骤 6：仍失败重复步骤 1~5，单接口上限 5 次
```

核心原则：**真相只在主包里**。分包是独立运行的拷贝，逻辑差异以主包为准。禁止在未读主包源码的情况下臆测修改。

---

### A 类：execute 参数失败

特征：`missing required parameter` / `xxx is undefined` / `参数格式错误`。

1. 依赖图找上游接口；未跑则先跑上游，提取字段后重拼 `--args`（上限 3 次）
2. 字段名不一致 → 做字段映射后重试
3. 找不到上游来源 → 读主包确认真实依赖 → 改 `apis/<name>.js` 入参拼装 → 重跑
4. 3 次仍失败 → 转 C 类

### B 类：execute 读取 storage 失败

特征：`no data` / `getStorageSync 返回 null`。

1. 在 `<skill>/SKILL.md` 的 storage 清单中找写入方接口，先跑一次再重跑当前接口（上限 2 次）
2. 若 key 应由主包 `app.js` 初始化 → 读主包 → 在 `utils/util.js` 的 `ensureStorageInit()` 补初始化逻辑 → 重跑
3. 2 次仍失败 → 转 C 类

### C 类：execute 代码/网络失败

特征：`network` / `timeout` / `500` / `unauthorized` / `not registered` / JS 抛异常 / 返回字段与 `outputSchema` 不一致。

1. 读 `execute-result.<name>.json` 的 `invokeResult.error` + `consoleMessages`（`[ai-mode]` 前缀日志）锁定失败步骤
2. 读主包**必读清单**：
   - 源页面 `.js`：拼装入参（headers / token / 签名 / 查询串）
   - `utils/request.js` / `utils/http.js` / `api/*.js`：`baseUrl` / 鉴权头 / 错误码 / 返回结构（是否包了 `data`/`code`/`msg`）
   - `app.js`：`wx.cloud.init({ env })` / 全局 token / `globalData`
   - 云开发项目：`cloudfunctions/<fn>/index.js` 的真实字段名
3. 列差异点后只改 `apis/<name>.js` / `utils/util.js`，不重写整个文件
4. 若返回字段变了 → 同步改 `components/<name>/index.js` 的访问路径与 `index.wxml` 绑定
5. 重跑 execute；仍失败重复 1~4，上限 5 次
6. 5 次仍失败：
   - 涉及接口划分 / storage 依赖 → 改 `mcp.json` 的 `apis[]` 结构 + `ensureStorageInit`，重跑阶段 1
   - 源码无对应能力或依赖非白名单 → 标记 T9，在 `report.md` 记录后终止本接口

#### C.1 子类：wx JSAPI 未定义（非白名单）

特征：运行时报 `wx.<xxx> is not a function` / `Cannot read property '<xxx>' of undefined`（`wx.<ns>` 为 undefined）。

**优先假设不是代码写错，而是该 JSAPI 不在技能分包白名单内**。按以下顺序处理：

1. 从报错提取 API 名，对照 wxa-skills-generate `SKILL.md` 的 D.1（接口侧）/ D.2（组件侧）白名单（**完整清单**见 `wxa-skills-generate/references/JSAPI_WHITELIST.md`）
2. 在白名单内 → 检查调用上下文是否错位（组件/接口侧专属）、`wx.request` 在组件侧是否漏声明 `permissions["scope.dynamic"]`
3. 不在白名单 → 按 D.7 替换（如 `chooseImage` → `chooseMedia`）或改网络请求实现
4. 无等价替代 → 标 T9 终止。**禁止用 `if (wx.x)` / `try/catch` 吞异常当修好**

#### C.2 子类：Skill 模块加载失败（分包未注册）

特征：运行时报 `Skill code loading failed: module 'skills/<skill>/index.js' is not defined, require args is 'skills/<skill>/index.js'`（或类似 `module ... is not defined` / `require args is ...` 的模块解析错）。

**优先假设不是 JS 代码错，而是分包集成没接对**。按以下顺序核对（**不要动 `apis/` 或 `components/`**）：

1. **`app.json` 的 `subPackages` 是否把 skills 声明为独立分包**（缺此项是最常见原因）：
   ```json
   "subPackages": [
     { "root": "skills", "name": "skills", "pages": [], "independent": true }
   ]
   ```
   - `root` 必须是 skills 目录的相对路径；`independent` 必须为 `true`；`pages` 可为 `[]`
2. **`app.json` 的 `agent.skills[].path`** 是否指向 `skills/<skill>`（与 `subPackages.root` 一致）
3. **`project.config.json` 的 `packOptions.include`** 是否包含 `{ "type": "folder", "value": "skills" }`（否则 CLI 构建时不打包该目录）
4. **目录自身**：`skills/<skill>/index.js` 实际存在，且其中通过 `wx.modelContext.registerAPI('<name>', fn)` 注册了报错对应的 `<name>`
5. 以上四项完整且正确 → 才按 C 类主流程去读 `apis/<name>.js` 的代码

> **对照 wxa-skills-generate `SKILL.md` 阶段 6 与 `references/CODE_TEMPLATES.md` 第六节** 的配置片段做核对，不要乱写。

### E 类：execute success 但业务数据为空

特征：`status === "ok"` 且 `invokeResult.isError !== true`，但 `structuredContent` 是空列表 / 空对象 / `total: 0` / 只有 `error` 字段。**不能直接判通过**——这通常是请求参数错误、鉴权未生效、URL 拼错或响应拆包路径错的症状。

按以下顺序排查（详见 `references/CLI_AGENT_REFERENCE.md` E 类排查流程）：

1. 读 consoleMessages 的 `[ai-mode]` 日志，确认请求实际发出的 URL / 参数 / header
2. 读主包源码定位该接口真实请求结构（URL / method / 参数名 / 鉴权头 / 响应拆包路径）
3. 对比主包真实请求与 `apis/<name>.js` 实际发出的请求：URL / method / 参数名 / 鉴权头是否一致
4. 鉴权排查：主包请求封装需要的登录态/token，`apis/<name>.js` 入口是否补齐 `await ensureLogin()` 等
5. 排查后修正 → 重跑 execute；仍空且确认请求与主包真实请求完全一致 → 可能是后端环境差异，在 trace 记录"已排查请求正确，疑似环境无数据"，允许带声明通过

上限 3 轮；排查后确认是代码问题 → 转 C 类修 `apis/<name>.js` / `utils/request.js`。

### D 类：render 核对不通过（含"被裁剪"/"样式还原度不达标"）

1. 读产物定位：`consoleMessages.snapshotCard`（主要依据，尤其是 `[ai-mode] ... overflow` 日志）+ `elementTree`（若 CLI 下发，辅助核对字段绑定 / 列表长度 / 空状态文案）；仅在环境具备图像读取能力时，再以图像方式 `read_file` 读 `snapshot.png` 作为样式还原度的辅助信号
2. 按问题类型改（只改 `components/<name>/`，不动 `mcp.json` / `apis/*`）：
   - **被裁剪（`[ai-mode] ... overflow overflowed=true` 或 `data.overflowHeight > 0`）**：`index.wxss` 压缩 item 高度、用 `-webkit-line-clamp:1~2`、根节点保留 `overflow: hidden` 但**不要写 `max-height` / `min-height` / `height`**（外层尺寸由宿主自动施加，组件自行设高会让 `NotificationType.Overflow` 回调失效）；数据超量时在 `index.js` 计算 `visibleItems` + `omittedCount = total - visibleItems.length`，WXML 渲染"还有 {{omittedCount}} 条未展示"
   - **未接入溢出监听（`consoleMessages.snapshotCard` 中找不到 `[ai-mode] ... overflow monitor=on` 基线日志）**：回 wxa-skill-generate 的组件 JS 骨架，在 `created` 中通过 `wx.modelContext.getViewContext(this).on(NotificationType.Overflow, ...)` 绑定监听，并在绑定后同步 `console.info('[ai-mode] {componentName} overflow monitor=on')` 打出基线日志
   - **样式与源页面不一致（还原度不达标）**：回主包读 `.wxml` / `.wxss` + `app.wxss`，重提视觉 token（主色、字号、圆角、间距、分割线、图片比例）覆盖 `index.wxss`。单位推荐 `vw`（`1vw ≈ 7.5rpx`）
   - **图片不展示（软性优化）**：在 `index.js` 的 `NotificationType.Result` 分支做字段归一化（如 `imageUrl: item.imageUrl || item.cover || item.pic || item.thumb || item.image`）
   - **组件上行协议违规**（点击"活"按钮但小程序 AI 拿不到下一跳、或组件自己调业务接口）：上行合法形态有两种：① 单 `text`（自然语言 followUp）；② `text` + `api/call` 组合（结构化 toolCall）——
     `wx.modelContext.getContext(this).sendFollowUpMessage({ content: [{ type: 'text', text }, { type: 'api/call', data: { name, arguments } }] })`，
     `text` 是用户视角的简短中文（≤ 12 字）、`name` 必须在当前 skill `mcp.json.apis[].name` 中存在、`arguments` 字段与目标接口 `inputSchema.properties` 对齐、值从 `e.currentTarget.dataset` / `this.data` 取。
     违规形态包括：`content` 只含 `api/call` 不含前导 `text`（缺用户上下文，小程序 AI 拿不到意图描述）、缺 `content` 数组直接 `{ type: 'api/call', ... }`、`name` 在 mcp.json 中不存在、`arguments` 字段名错或带占位值、组件内直接 `wx.request` 业务接口、在 handler 里用 `this._modelCtx.sendFollowUpMessage(...)` / `this._viewCtx.getDimensions(...)` 这种缓存引用调方法（必须改为 `wx.modelContext.getContext(this).sendFollowUpMessage(...)` 等现取写法）。
     只改 `components/<name>/index.js` 的 tap handler，**不改 apis/ 和 mcp.json**；每次上行前补一行 `console.info('[ai-mode] {componentName} send api/call name=... args=...')` 便于下次 render 在 `consoleMessages.snapshotCard` 中核验
3. 改完 `components/<name>/` 后重跑 render（UI 类改动不需要重新 execute，可通过 `--from-execute` 复用现有产物）→ 再次读 `render-result.<name>.json` 的 `consoleMessages.snapshotCard`：基线 `overflow monitor=on` 日志必须存在、且不出现 `overflowed=true`（具备图像读取能力时可附加读取截图作为样式还原度的辅助信号），不得仅依据退出码 0 放行
4. 上限 5 轮，仍不通过按 C 类退出条件处理

### 禁止动作

- 禁止用 `curl` / `fetch` / HTTP 工具直接验证网络接口。原因：① 小程序沙箱的鉴权上下文（session / cookie / 签名 / wx.login code）在终端无法复现；② 验证结果对 skill 分包无参考价值。网络请求改动只能通过 `execute.mjs` 验证。
- 禁止在未读主包源码的情况下臆测修改分包代码。
- render 可通过 `--from-execute` 复用已有 execute 产物（args 取自 `invokeResult.structuredContent`）；但 render 关心的是 **UI 渲染正确**，因此若改动会影响接口返回数据（改 apis/ / outputSchema），需要先重新 execute 再 render，不应用旧产物；仅改 UI（wxml/wxss/components/index.js）时可复用。
- 禁止多个接口的 CLI 命令并发执行。
- 禁止改动 skill 的总体目录结构（`<skill>/apis/` / `<skill>/components/` / `mcp.json` / `SKILL.md`），只在文件内容层面做最小修复。

---

## 回溯记录

每次 execute / render 追加写入 `./cli-agent-run/execute-trace.json`：

```json
{
  "skill": "<skill-dir>",
  "api": "<name>",
  "attempt": 1,
  "argumentsUsed": { },
  "argumentsSource": "user | upstream:<apiName> | default | empty",
  "executeStatus": "ok | error",
  "executeError": null,
  "renderChecks": { "rendered": true, "fieldsComplete": true, "overflow": false, "style": true, "ellipsis": true },
  "renderFailReason": null,
  "recovery": null
}
```

---

## 终止条件

满足任一即终止：

1. 阶段 1 通过 + 每个声明的 `api` execute 成功 + 有 `componentPath` 的接口 5 项核对全部通过
2. 阶段 1 连续 5 轮未通过 → 停止，输出失败报告
3. 阶段 4 累计 5 轮仍有接口未通过 → 停止，输出失败报告
4. 不可修复类（`_meta.diagnosis` 非 null）或工具不稳定经预热/加 timeout/重启仍失败 → 停止，转述 `hint`，不产出 `DELIVERY.md`
5. T9 类问题 → 立即终止，告知用户

---

## 阶段 5 — 交付产物

### 1. 执行报告 `./cli-agent-run/report.md`（每次终止都输出）

```markdown
# CLI `agent` 命令校验报告

- 执行时间：<ISO>
- project-path：<abs-path>
- skill 分包：<metaServicePkg, ...>（validate-report.json 中 skillDirs 字段）
- devtools：<DEVTOOLS_APP_PATH>

## 接口结果

| skill | api | componentPath | execute | render 5 项 | 产物 |
|-------|-----|---------------|---------|------------|------|
| business | searchItems | components/item-list/index | ✔ | ✔✔✔✔✔ | execute-result.searchItems.json / render-result.searchItems.snapshot.png |

## 未通过接口

- <apiName>：<原因简述>，详见 <产物路径>

## 修复摘要

- `skills/<skill>/apis/<name>.js`：<一行摘要>
```

### 2. 交付文档 `./DELIVERY.md`（仅终止条件 1 成立时产出）

终止条件 1 成立时必须产出：

- 写入路径：`./DELIVERY.md`（项目根；用户指定其它路径时以用户为准，但必须是 `.md`）
- 模板：严格套用 `references/DELIVERY_TEMPLATE.md`，所有 `{占位符}` 必须替换为实际值
- `execute-trace.json` 存在时在"已知限制"节引用
- 写入后**必须在对话中同时贴出完整 MD 内容**，不能只说"文件已生成"
- 无法写入（权限）→ 将 MD 内容直接输出在对话中作为替代

**仅输出 `report.md` 不算任务完成；`DELIVERY.md` 才是最终交付物。**

### 3. 未通过时的修复建议（追加到 report.md 末尾）

- **阶段 4 不可修复类 / 工具不稳定** → 禁止改代码，按 `diagnosis.hint` 转述；提示用户工具恢复后重跑 execute，不产出 `DELIVERY.md`
- 阶段 1 T1~T6 → 直接修对应文件，重跑 validate
- 阶段 1 T7/T8 → 调整 `mcp.json` 的 `apis[]` / `utils/util.js` 的 storage 逻辑 / `index.js` 的 `registerAPI`，重跑 validate
- 阶段 4 A/B 类 → 修 `apis/<name>.js` 入参拼装或 `utils/util.js` 的 `ensureStorageInit`，重跑 execute
- 阶段 4 C 类 → 对照主包源码修 `apis/<name>.js` / `utils/util.js`，必要时调整 `mcp.json` 的 `outputSchema` 与组件取值路径，重跑 execute
- 阶段 4 D 类 → 修 `components/<name>/` 的 wxml/wxss/js，重跑 render
- T9 → 终止，告知用户功能不支持或建议更换实现路径

---

## 关键约束（再次强调）

- 验收目标不可降级：所有原子接口与带 `componentPath` 的原子组件都必须通过；挂起仅限"连续 5 轮仍未通过"硬上限
- render 必须读取 `consoleMessages.snapshotCard` 做判断，不能只看 `execute-result`；具备图像读取能力时再辅助读截图
- "未裁剪 + 样式还原"是硬判据：**未裁剪**以 `consoleMessages.snapshotCard` 中存在 `[ai-mode] ... overflow monitor=on` 基线日志且不出现 `overflowed=true` 为准（缺 `monitor=on` = 未接入监听，按不通过处理）；**样式还原度**在具备图像读取能力时再读 `snapshot.png` 作为辅助信号，否则以 `elementTree` 字段完整性兜底
- 修复必须跨主包 + 分包联动，真相只在主包里
- 根据 `mcp.json` 的 `apis[]` 依赖关系安排 execute 顺序；存在上游依赖时，上游 execute 必须先于下游。render 无此顺序约束
- 不要新增依赖、不要重写整个文件
