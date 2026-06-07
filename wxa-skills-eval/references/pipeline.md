# Pipeline — 12 节点串行管线

## 1. 节点执行顺序

执行顺序严格遵循 `NODE_ORDER`：

| # | 节点 | 职责 |
|---|---|---|
| 1 | `start` | DevTools 连接、项目解析、源文件指纹采集 |
| 2 | `component_check` | 检查原子组件深色模式适配（wxss + js 双条件） |
| 3 | `gen_api_deps` | 分析 mcp.json API 依赖关系 |
| 4 | `explore` | LLM 驱动页面探索，产出 traces |
| 5 | `entity_pool` | 从 traces 中收割原始实体并清洗、生成 intent_seeds |
| 6 | `skill_review` | LLM 审查 skill 定义合理性 |
| 7 | `gen_intent` | 由 intent_seed 生成具体测试意图 |
| 8 | `gen_trajectory` | LLM 多轮对话产生工具调用轨迹 |
| 9 | `gen_checklist` | 基于 intent 生成评估 checklist |
| 10 | `eval` | 用 checklist 对 trajectory 打分 |
| 11 | `attribution` | 失败归因（结合所有上游产物） |
| 12 | `gen_report` | 聚合所有 skill × case 输出 HTML |

> 流程概览：在所有参与 skill 合并的 run 上跑一次前 6 个节点 → 再为每个 case (run 内全局编号) 跑后 5 个 per-case 节点 → 最后聚合输出整体报告。

## 2. workdir 目录布局

```
<workdir>/
├── eval_report.html       ← 最终 HTML 报告（gen_report 产物）
├── llm.json               ← LLM 调用统计（gen_report 产物）
├── timing.json            ← 节点耗时统计（gen_report 产物）
├── start.json / component_check.json / gen_api_deps.json / explore.json / entity_pool.json / skill_review.json   ← run 级共享产物
└── cases/<idx>/
    └── <各 per-case 节点>.json     （gen_intent / gen_trajectory / gen_checklist / eval / attribution）
```

> 旧布局（`<workdir>/skills/<skill>/...`）在开启 multi-skill 后已废弃；老 workdir 续跑会报错，需重新冷启。

## 3. 续跑机制

三种触发方式：

| 入口 | 行为 |
|---|---|
| **隐式跳过**（默认） | 检测到产物文件存在且 schema 校验通过即跳过；输出 `♻️ <node> (已复用)` |
| **`--resume`** | 扫描 run 内所有 case，定位首个未完成节点，从该处重启 |
| **`--from <node>`** | 强制从指定节点重跑（包含其下游），用于修改某节点逻辑后重新评测 |

> 跳过条件：产物文件存在 ∧ JSON 可解析 ∧ 字段 schema 通过。任一不满足即标记为未完成、需重跑。
