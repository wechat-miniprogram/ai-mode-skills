# Pipeline — 13 节点串行管线

## 1. 节点执行顺序

执行顺序严格遵循 `NODE_ORDER`：

| #   | 节点              | 类型                   | 职责                                                                       |
| --- | ----------------- | ---------------------- | -------------------------------------------------------------------------- |
| 1   | `start`           | per-skill              | DevTools 连接、项目解析、源文件指纹采集                                    |
| 2   | `component_check` | per-skill              | 检查原子组件深色模式适配（wxss + js 双条件，纯规则）                       |
| 3   | `gen_api_deps`    | per-skill              | 分析 `mcp.json` API 依赖关系                                               |
| 4   | `explore`         | per-skill              | LLM 驱动页面探索，产出 traces                                              |
| 5   | `entity_pool`     | per-skill              | 从 traces 中收割原始实体并清洗、生成 intent_seeds                          |
| 6   | `skill_review`    | per-skill              | LLM 审查 skill 定义合理性                                                  |
| 7   | `gen_intent`      | per-case               | 由 intent_seed 生成具体测试意图（K 次执行间复用）                          |
| 8   | `gen_checklist`   | per-case               | 基于 intent 生成评估 checklist（K 次执行间复用）                           |
| 9   | `gen_trajectory`  | per-case + per-attempt | LLM 多轮对话产生工具调用轨迹（K 次独立采样，每次独占 DevTools）            |
| 10  | `eval`            | per-case + per-attempt | 用 checklist 对 attempt N 的 trajectory 打分                               |
| 11  | `attribution`     | per-case + per-attempt | attempt N 的失败归因（结合所有上游产物）                                   |
| 12  | `pass_k`          | per-case               | 收集该 case 全部 K 个 attempt 的 eval 结果，输出 pass@k（K=1 也运行）      |
| 13  | `gen_report`      | aggregate              | 聚合所有 skill × case 产物，输出 HTML 报告                                 |

> 流程概览：所有 skill 合并的 run 上跑一次前 6 个 per-skill 节点 → 再为每个 case 跑后 7 个 per-case 节点（其中 `gen_trajectory` / `eval` / `attribution` 跑 K 次）→ 最后 `gen_report` 聚合输出整体报告。
>
> attempt 个数 K 由宿主通过 `runOrchestrator({ passAtK })` 透传，默认 1。

## 2. workdir 目录布局

```
<workdir>/
├── eval_report.html       ← 最终 HTML 报告（gen_report 产物）
├── llm.json               ← LLM 调用统计（gen_report 产物）
├── timing.json            ← 节点耗时统计（gen_report 产物）
├── summary.json           ← 评测整体摘要（gen_report 产物）
├── start.json / component_check.json / gen_api_deps.json / explore.json / entity_pool.json / skill_review.json   ← run 级共享产物
└── cases/<idx>/
    ├── gen_intent.json / gen_checklist.json / pass_k.json   ← per-case 节点产物
    └── attempts/<n>/
        └── gen_trajectory.json / eval.json / attribution.json   ← per-attempt 节点产物（K=1 时 n=1）
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
