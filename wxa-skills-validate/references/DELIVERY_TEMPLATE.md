# 交付文档模板（DELIVERY.md）

> CLI `agent` 命令真机闭环全部通过后使用本模板。原样套用下方模板，所有 `{占位符}` 必须替换为实际值，不得保留。

```markdown
# 小程序 AI SKILL 交付文档

> 生成时间：{ISO 8601 时间戳}
> 验证工具：wxa-skills-validate（validate.mjs + cli agent tool + cli agent render 真机闭环）

## 一、生成结果概览

✅ 生成成功

## 二、生成的 SKILLs

### skills/{skillName1}（{N} 个原子接口）

| 原子接口 | 标题 | 关联组件 | 入参 | 返回结构 |
|---------|------|---------|------|---------|
| `{apiName1}` | {title} | `components/{xxx}/index` | {inputSchema 摘要} | {outputSchema 摘要} |
| `{apiName2}` | {title} | `components/{xxx}/index` | {inputSchema 摘要} | {outputSchema 摘要} |

### skills/{skillName2}（{M} 个原子接口）

（同上格式）

## 三、覆盖的用户需求

- ✅ {需求 1}（由 {apiName1} / {apiName2} 实现）
- ✅ {需求 2}（由 {apiName3} 实现）

## 四、未能覆盖的需求

- ⚠️ {需求}（原因：源码中未定位到相关接口 / 依赖小程序插件 / 使用了非白名单 JSAPI）

> 若全部覆盖，本节写"无"。

## 五、校验结果

### 5.1 静态校验（`validate.mjs`）

- 通过状态：✅ 通过 / ⚠️ 含 {N} 个 warning
- 报告路径：`./cli-agent-run/validate-report.json`

### 5.2 真机验证（`cli agent tool` + `cli agent render`）

| 原子接口 | execute | render 5 项核对 | 截图 | 组件树 |
|---------|---------|----------------|------|-------|
| `{apiName1}` | ✅ `isError: false` | ✅✅✅✅✅ | `./cli-agent-run/render-result.{apiName1}.snapshot.png` | `./cli-agent-run/render-result.{apiName1}.json` |
| `{apiName2}` | ✅ `isError: false` | ✅✅✅✅✅ | `./cli-agent-run/render-result.{apiName2}.snapshot.png` | `./cli-agent-run/render-result.{apiName2}.json` |

## 六、产物路径

| 类别 | 路径 |
|------|------|
| SKILL 代码 | `skills/` |
| 静态校验报告 | `./cli-agent-run/validate-report.json` |
| 执行结果 | `./cli-agent-run/execute-result.*.json` |
| 回溯记录 | `./cli-agent-run/execute-trace.json` |
| 渲染组件树 | `./cli-agent-run/render-result.*.json` |
| 渲染截图 | `./cli-agent-run/render-result.*.snapshot.png` |
| 执行报告 | `./cli-agent-run/report.md` |
| 配置变更 | `app.json`（`agent.skills` + `subPackages`）、`project.config.json`（`packOptions.include`） |

## 七、建议的后续动作

1. 在微信开发者工具中打开项目，人工预览分包加载体验
2. 如更换项目（不同 `project.config.json`），需重新跑 `validate → execute → render` 整套验证
3. 如需二次验证组件渲染，重新执行 `node <skill-dir>/scripts/render.mjs --project <path> --from-execute <path>`
4. 新增原子能力时，重跑 `validate → execute → render` 确保增量不破坏既有接口

## 八、已知限制 / 注意事项

- {如有：列表截断 / 裁剪 / 外部依赖等注意项}
- {如无：本节写"无"}
```

## 填充规则

1. 所有 `{占位符}` 必须替换为实际值。
2. "未能覆盖的需求""已知限制"即使为空也必须保留标题并写"无"。
3. 校验结果表格须如实反映真机闭环产物路径；未验证的接口标 ❌ 并在"已知限制"说明。
4. 写入文件后，在对话中同时贴出完整 MD 内容给用户。
