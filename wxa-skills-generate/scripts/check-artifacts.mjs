#!/usr/bin/env node
/**
 * check-artifacts.mjs — 生成阶段产物存在性 + 基本格式检查
 *
 * 用法：node check-artifacts.mjs <project-path> [--stage <0-6>]
 * 不传 --stage 时检查全部阶段（到当前为止应有的产物）。
 *
 * 只检查"文件是否存在 + JSON 能解析 / 目录结构正确"，不校验文件内容
 * （字段值、语义、对应关系等内容的校验不在本脚本职责内）。
 *
 * 退出码：0=全部通过；1=有缺失（stderr 列出缺失项 + 该回哪个阶段补）
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const projectPath = resolve(process.argv[2] || ".");
const stageArg = process.argv.indexOf("--stage");
const stage = stageArg !== -1 ? parseInt(process.argv[stageArg + 1], 10) : 6;

const aiDir = join(projectPath, ".ai-mode-skills");
const skillsDir = join(projectPath, "skills");

const errors = [];
const passes = [];

function check(label, cond, fixHint) {
  if (cond) {
    passes.push(`  ✅ ${label}`);
  } else {
    errors.push(`  ❌ ${label}` + (fixHint ? ` → ${fixHint}` : ""));
  }
}

/** 文件存在（不校验内容） */
function exists(path) {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

/** 文件存在且能解析为 JSON */
function existsJson(path) {
  if (!exists(path)) return false;
  try {
    JSON.parse(readFileSync(path, "utf-8"));
    return true;
  } catch {
    return false;
  }
}

/** 目录存在且非空 */
function existsDir(path) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 目录存在且含至少一个 .js */
function dirHasJs(path) {
  if (!existsDir(path)) return false;
  try {
    return readdirSync(path).some((f) => f.endsWith(".js"));
  } catch {
    return false;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// ============================================================
// 阶段 1 — auth-spec + capability-index
// ============================================================
if (stage >= 1) {
  console.log("\n阶段 1 — 鉴权与项目扫描产物：");
  check(
    "auth-spec.md",
    exists(join(aiDir, "auth-spec.md")),
    "回阶段 1.2 补落盘"
  );
  check(
    "auth-spec.snippets.txt",
    exists(join(aiDir, "auth-spec.snippets.txt")),
    "回阶段 1.2 补落盘"
  );
  // capability-index 仅大项目必检
  const appJson = readJson(join(projectPath, "app.json"));
  const pageCount = appJson?.pages?.length || 0;
  const subPkgCount =
    appJson?.subPackages?.length || appJson?.subpackages?.length || 0;
  if (pageCount > 30 || subPkgCount > 1) {
    check(
      "capability-index.json（大项目）",
      existsJson(join(aiDir, "capability-index.json")),
      "回阶段 1（SUBAGENT_PROTOCOL.md §一）补落盘"
    );
  }
}

// ============================================================
// 阶段 3 — interface-spec + merged-result + probe plan
// ============================================================
if (stage >= 3) {
  console.log("\n阶段 3 — 接口提取与 probe 产物：");

  check(
    "merged-result.json",
    existsJson(join(aiDir, "merged-result.json")),
    "回阶段 3.7 补 probe 合并"
  );

  check(
    "probe/plan.json",
    existsJson(join(aiDir, "probe", "plan.json")),
    "回阶段 3.7 补 plan"
  );

  // 至少一个 probe run 文件（存在即可，不查内容）
  const probeDir = join(aiDir, "probe");
  let hasRunFile = false;
  try {
    hasRunFile = readdirSync(probeDir).some(
      (f) => f.endsWith(".json") && f !== "plan.json"
    );
  } catch {}
  check(
    "至少一个 probe run 文件（probe/<run-id>.json）",
    hasRunFile,
    "回阶段 3.7 执行 probe"
  );

  // interface-spec.<cap>.md：只验"至少存在一个"
  let interfaceSpecCount = 0;
  try {
    interfaceSpecCount = readdirSync(aiDir).filter(
      (f) => f.startsWith("interface-spec.") && f.endsWith(".md")
    ).length;
  } catch {}
  check(
    `至少一个 interface-spec.<cap>.md（当前 ${interfaceSpecCount} 个）`,
    interfaceSpecCount > 0,
    "回阶段 3.2 补落盘"
  );
}

// ============================================================
// 阶段 5 — skills/ 目录结构
// ============================================================
if (stage >= 5) {
  console.log("\n阶段 5 — 代码生成产物：");

  check("skills/ 目录存在", existsDir(skillsDir), "回阶段 5 生成代码");

  if (existsDir(skillsDir)) {
    const skillNames = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .map((e) => e.name);

    if (skillNames.length === 0) {
      check("skills/ 下至少一个 skill 目录", false, "回阶段 5 生成 skill");
    }

    for (const name of skillNames) {
      const skillDir = join(skillsDir, name);
      check(`${name}/mcp.json`, existsJson(join(skillDir, "mcp.json")), "回阶段 5.7 补");
      check(`${name}/SKILL.md`, exists(join(skillDir, "SKILL.md")), "回阶段 5.7 补");
      check(`${name}/index.js`, exists(join(skillDir, "index.js")), "回阶段 5 补");

      // mcp.json 能解析时，按其声明的 api name 检查 apis/<name>.js 是否存在
      const mcp = readJson(join(skillDir, "mcp.json"));
      if (mcp?.apis) {
        for (const api of mcp.apis) {
          if (!api.name) continue;
          const candidates = [
            join(skillDir, "apis", `${api.name}.js`),
            join(skillDir, "tools", "services", `${api.name}.js`),
            join(skillDir, "tools", `${api.name}.js`),
          ];
          check(
            `${name}/apis/${api.name}.js`,
            candidates.some(exists),
            "回阶段 5 补"
          );
        }
      }

      // utils/ 至少有一个 .js
      check(
        `${name}/utils/ 有至少一个 .js`,
        dirHasJs(join(skillDir, "utils")),
        "回阶段 5.6 补 utils/request.js 或 utils/util.js"
      );

      // 声明了 componentPath 的，组件四件套存在
      if (mcp?.apis) {
        for (const api of mcp.apis) {
          const cp = api?._meta?.ui?.componentPath;
          if (!cp) continue;
          const compDir = join(skillDir, cp);
          for (const ext of ["index.js", "index.json", "index.wxml", "index.wxss"]) {
            check(
              `组件 ${cp} ${ext}`,
              exists(join(compDir, ext)),
              "回阶段 5.1-5.4 补"
            );
          }
        }
      }
    }
  }
}

// ============================================================
// 阶段 6 — 配置集成
// ============================================================
if (stage >= 6) {
  console.log("\n阶段 6 — 配置集成产物：");

  const appJson = readJson(join(projectPath, "app.json"));
  const projConfig = readJson(join(projectPath, "project.config.json"));

  check(
    "app.json 存在且可解析",
    appJson !== null,
    "回阶段 6 补 app.json"
  );
  check(
    "project.config.json 存在且可解析",
    projConfig !== null,
    "回阶段 6 补 project.config.json"
  );

  if (appJson) {
    check(
      "app.json 含 agent.skills 数组",
      Array.isArray(appJson.agent?.skills) && appJson.agent.skills.length > 0,
      "回阶段 6 补 agent.skills"
    );

    const subs = appJson.subPackages || appJson.subpackages || [];
    const hasSkillsSubPkg = subs.some(
      (s) => (typeof s === "string" ? s : s?.root) === "skills"
    );
    check(
      "app.json subPackages 含 skills",
      hasSkillsSubPkg,
      '回阶段 6 补 { "root": "skills", "independent": true }'
    );
  }

  if (projConfig) {
    const includes = projConfig.packOptions?.include || [];
    const hasSkillsInclude = includes.some(
      (i) => i?.type === "folder" && i?.value === "skills"
    );
    check(
      "project.config.json packOptions.include 含 skills",
      hasSkillsInclude,
      '回阶段 6 补 { "type": "folder", "value": "skills" }'
    );
  }
}

for (const p of passes) console.log(p);
if (errors.length > 0) {
  console.error("\n⚠️ 产物缺失或格式错误：");
  for (const e of errors) console.error(e);
  console.error(`\n共 ${errors.length} 项缺失，请回对应阶段补落盘后重跑。`);
  process.exit(1);
} else {
  console.log("\n✅ 全部产物检查通过（存在性 + 格式）。");
  process.exit(0);
}
