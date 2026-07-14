#!/usr/bin/env node
import { readFile, writeFile, stat, readdir, mkdir, unlink, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join, resolve, relative, dirname, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { runCli, DEFAULT_CLI_PATH, WIN_CLI_CANDIDATES } from "./lib.mjs";

const BUILTIN_RULES = {
  rules: [
    {
      id: "V001", name: "禁止依赖主包",
      stage: "registration", level: "error", type: "regex_absent",
      targets: ["**/*.js"],
      patterns: [
        { regex: "getApp\\s*\\(\\s*\\)", message: "独立分包中禁止使用 getApp()" },
        { regex: "import\\s+[^;]+from\\s+['\"]@/", message: "禁止 import 主包模块（@/）" },
      ],
      escapeCheck: [
        { regex: "require\\s*\\(\\s*['\"]([^'\"]+)['\"]\\s*\\)", message: "require 引用超出 skill 分包边界" },
        { regex: "import\\s+[^;]+from\\s+['\"]([^'\"]+)['\"]", message: "import 引用超出 skill 分包边界" },
      ],
    },
    {
      id: "V003", name: "WXML 组件白名单",
      stage: "component", level: "error", type: "regex_absent",
      targets: ["*/components/*/index.wxml"],
      patterns: [
        { regex: "<(?!view|text|image|map|button|canvas|scroll-view|block|template|\\/|!--)[a-zA-Z]", message: "WXML 仅允许 view/text/image/map/button/canvas/scroll-view 七种组件（含 block/template/注释），不支持 navigator/swiper/input/textarea/picker/checkbox/radio 等" },
        { regex: "<button[^>]*\\sopen-type\\s*=", message: "原子组件的 button 不支持 open-type 属性（任何 open-type 值均不允许），改为 bindtap + 调用对应 JSAPI" },
        { regex: "<scroll-view(?![^>]*\\sscroll-x(?:[\\s=>]|$))", message: "原子组件的 scroll-view 必须显式声明 scroll-x（仅支持横向滚动），如：<scroll-view scroll-x=\"true\">" },
        { regex: "<scroll-view[^>]*\\sscroll-y\\s*=\\s*[\"']?(?:true|\\{\\{\\s*true\\s*\\}\\})", message: "原子组件的 scroll-view 不支持纵向滚动（scroll-y），仅支持横向滚动（scroll-x）" },
      ],
    },
    {
      id: "V005", name: "CSS 禁止属性",
      stage: "component", level: "error", type: "regex_absent",
      targets: ["*/components/*/index.wxss"],
      patterns: [
        { regex: "position\\s*:\\s*fixed", message: "不支持 position: fixed（仅支持 relative/absolute）" },
        { regex: "position\\s*:\\s*sticky", message: "不支持 position: sticky" },
        { regex: "z-index\\s*:", message: "不支持 z-index" },
        { regex: "display\\s*:\\s*grid", message: "不支持 display: grid" },
        { regex: "display\\s*:\\s*table", message: "不支持 display: table" },
        { regex: "display\\s*:\\s*inline-flex", message: "不支持 display: inline-flex" },
        { regex: "float\\s*:", message: "不支持 float" },
        { regex: "text-decoration\\s*:", message: "不支持 text-decoration" },
        { regex: "--[a-zA-Z][\\w-]*\\s*:", message: "不支持 CSS 变量（--*）" },
        { regex: "transition\\s*:[^;]*(?!opacity|transform)[a-zA-Z-]+", message: "transition 仅支持 opacity 和 transform" },
      ],
    },
    {
      id: "V006", name: "CSS 禁止选择器",
      stage: "component", level: "error", type: "regex_absent",
      targets: ["*/components/*/index.wxss"],
      patterns: [
        { regex: ">\\s*[.#a-zA-Z][\\w-]*\\s*\\{", message: "不支持子选择器 >" },
        { regex: "\\+\\s*[.#a-zA-Z][\\w-]*\\s*\\{", message: "不支持相邻兄弟选择器 +" },
        { regex: "~\\s*[.#a-zA-Z][\\w-]*\\s*\\{", message: "不支持通用兄弟选择器 ~" },
        { regex: "::[a-z-]+\\s*\\{", message: "不支持伪元素选择器 ::" },
        { regex: ":(hover|focus|active|checked|disabled|first-child|last-child|nth-child)", message: "不支持伪类选择器" },
        { regex: "\\[[a-zA-Z][\\w-]*[\\^$*~|]?=", message: "不支持属性选择器 []" },
      ],
    },
  ],
  crossFileRules: [
    { id: "V002", name: "已注册接口必须为 async function", stage: "registration", level: "error" },
    { id: "V007", name: "定义-注册一致性", stage: "registration", level: "error" },
    { id: "V008", name: "注册-实现一致性", stage: "registration", level: "error" },
    { id: "V009", name: "接口返回值-outputSchema一致性", stage: "output", level: "error" },
    { id: "V010", name: "组件取值-接口返回一致性", stage: "component", level: "error" },
    { id: "V011", name: "setData-WXML绑定一致性", stage: "component", level: "error" },
    { id: "V012", name: "原子接口若关联原子组件则需文件齐全", stage: "component", level: "error",
      pathPattern: "^components/[\\w-]+/index$", requireFiles: ["index.js", "index.json", "index.wxml", "index.wxss"] },
    { id: "V013", name: "mcp.json 体积限制", stage: "registration", level: "error",
      maxChars: 24000 },
    { id: "V014", name: "SKILL.md 必须存在且文件名严格大写", stage: "registration", level: "error" },
    { id: "V016", name: "app.json 的 agent.skills[].description 必须存在且非空", stage: "registration", level: "error" },
    { id: "V017", name: "handoff 接力页 pagePath 校验", stage: "registration", level: "error" },
  ],
};

const mk = (r, status, message, extra = {}) => ({ id: r.id, stage: r.stage, level: extra.level ?? r.level, status, message, ...extra });
const pass = (r, message, extra = {}) => mk(r, "pass", message, extra);
const fail = (r, message, extra = {}) => mk(r, "fail", message, extra);

async function glob(patterns, basePath) {
  const out = new Set();
  for (const p of patterns) for (const f of await matchPattern(p, basePath)) out.add(f);
  return [...out];
}

async function matchPattern(pattern, basePath) {
  async function traverse(dir, parts) {
    if (parts.length === 0) {
      try { return (await stat(dir)).isFile() ? [dir] : []; } catch { return []; }
    }
    const [cur, ...rest] = parts;
    if (cur === "**") {
      const res = [...await traverse(dir, rest)];
      try {
        for (const e of await readdir(dir, { withFileTypes: true }))
          if (e.isDirectory()) res.push(...await traverse(join(dir, e.name), parts));
      } catch {}
      return res;
    }
    if (cur.includes("*")) {
      const re = new RegExp("^" + cur.replace(/\./g, "\\.").replace(/\*/g, "[^/]*") + "$");
      const res = [];
      try {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          if (!re.test(e.name)) continue;
          const fp = join(dir, e.name);
          if (rest.length === 0) { if (e.isFile()) res.push(fp); }
          else if (e.isDirectory()) res.push(...await traverse(fp, rest));
        }
      } catch {}
      return res;
    }
    const fp = join(dir, cur);
    try {
      const s = await stat(fp);
      if (rest.length === 0) return s.isFile() ? [fp] : [];
      if (s.isDirectory()) return traverse(fp, rest);
    } catch {}
    return [];
  }
  return traverse(resolve(basePath), pattern.split("/"));
}

function findMatchingBracket(text, openIdx) {
  const open = text[openIdx];
  const close = { "{": "}", "[": "]", "(": ")" }[open];
  if (!close) return -1;
  let depth = 1, inStr = false, strCh = "", esc = false;
  for (let i = openIdx + 1; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === strCh) inStr = false;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { inStr = true; strCh = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const parseMcpApis = raw => (raw && typeof raw === "object" && Array.isArray(raw.apis)) ? raw.apis : [];
const extractMcpNames = apis => apis.filter(x => x && typeof x.name === "string").map(x => x.name);

function extractRegisterNames(js) {
  return [...js.matchAll(/registerAPI\s*\(\s*['"](\w+)['"]/g)].map(m => m[1]);
}
function extractRequireNames(js) {
  return [...js.matchAll(/require\s*\(\s*['"]\.\/apis\/(\w+)['"]/g)].map(m => m[1]);
}
function extractStructuredFields(js) {
  const fields = [];
  for (const m of js.matchAll(/structuredContent\s*:\s*\{([^}]+)\}/g))
    for (const fm of m[1].matchAll(/(\w+)\s*:/g)) fields.push(fm[1]);
  return fields;
}
function extractOutputSchemaFields(schema) {
  return schema?.properties ? Object.keys(schema.properties) : [];
}
function extractPropertiesFields(js) {
  const fields = new Set();
  for (const m of js.matchAll(/properties\s*:\s*\{([^}]+)\}/g))
    for (const fm of m[1].matchAll(/(\w+)\s*:/g)) fields.add(fm[1]);
  return fields;
}
function extractComponentStructuredFields(js) {
  return [...js.matchAll(/result\.structuredContent\.(\w+)/g)].map(m => m[1]);
}
function collectTopLevelKeys(body, sink) {
  let depth = 0, inStr = false, strCh = "", esc = false, cur = "";
  const tokens = [];
  for (const c of body) {
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === strCh) inStr = false;
      cur += c; continue;
    }
    if (c === "'" || c === '"' || c === "`") { inStr = true; strCh = c; cur += c; continue; }
    if ("{[(".includes(c)) { depth++; cur += c; continue; }
    if ("}])".includes(c)) { depth--; cur += c; continue; }
    if (c === "," && depth === 0) { tokens.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) tokens.push(cur);
  for (const t of tokens) {
    const s = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").trim();
    if (!s || s.startsWith("...")) continue;

    let d = 0, iS = false, sCh = "", e = false, colon = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (iS) { if (e) e = false; else if (c === "\\") e = true; else if (c === sCh) iS = false; continue; }
      if (c === "'" || c === '"' || c === "`") { iS = true; sCh = c; continue; }
      if ("{[(".includes(c)) d++;
      else if ("}])".includes(c)) d--;
      else if (c === ":" && d === 0) { colon = i; break; }
    }
    if (colon === -1) continue;
    let key = s.slice(0, colon).trim().replace(/^['"`]|['"`]$/g, "");
    if (key.startsWith("[")) continue;
    key = key.split(".")[0];
    if (/^[A-Za-z_$][\w$]*$/.test(key)) sink.add(key);
  }
}

function extractSetDataFields(js) {
  const fields = new Set();

  for (let i = js.indexOf("setData"); i !== -1; i = js.indexOf("setData", i + 7)) {
    let j = i + 7;
    while (j < js.length && /\s/.test(js[j])) j++;
    if (js[j] !== "(") continue;
    const close = findMatchingBracket(js, j);
    if (close === -1) continue;
    const arg = js.slice(j + 1, close).replace(/^\s+/, "");
    if (!arg.startsWith("{")) continue;
    const innerClose = findMatchingBracket(arg, 0);
    if (innerClose !== -1) collectTopLevelKeys(arg.slice(1, innerClose), fields);
  }
  for (const m of js.matchAll(/setData\s*\(\s*\{[^}]*['"]([\w.]+)['"]\s*:/g)) fields.add(m[1].split(".")[0]);
  for (const entry of ["Component", "Page"]) {
    const entryRe = new RegExp("\\b" + entry + "\\s*\\(\\s*\\{", "g");
    for (const m of js.matchAll(entryRe)) {
      const rootOpen = m.index + m[0].length - 1;
      const rootClose = findMatchingBracket(js, rootOpen);
      if (rootClose === -1) continue;
      let depth = 1, inStr = false, strCh = "", esc = false;
      for (let k = rootOpen + 1; k < rootClose; k++) {
        const c = js[k];
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === strCh) inStr = false;
          continue;
        }
        if (c === "'" || c === '"' || c === "`") { inStr = true; strCh = c; continue; }
        if (c === "{") {
          if (depth === 1 && /(^|[^A-Za-z0-9_$])data\s*:\s*$/.test(js.slice(Math.max(0, k - 32), k))) {
            const dClose = findMatchingBracket(js, k);
            if (dClose !== -1) {
              collectTopLevelKeys(js.slice(k + 1, dClose), fields);
              k = dClose;
              continue;
            }
          }
          depth++;
        } else if (c === "}") depth--;
      }
    }
  }
  return [...fields];
}

function extractWxmlBindings(wxml) {
  const scope = new Set(["item", "index"]);
  for (const m of wxml.matchAll(/wx:for-item\s*=\s*["']([\w$]+)["']/g)) scope.add(m[1]);
  for (const m of wxml.matchAll(/wx:for-index\s*=\s*["']([\w$]+)["']/g)) scope.add(m[1]);
  for (const m of wxml.matchAll(/<wxs[^>]*\smodule\s*=\s*["']([\w$]+)["']/g)) scope.add(m[1]);
  const stripped = wxml.replace(/<template\s+name=[^>]*>[\s\S]*?<\/template>/g, "");
  const fields = [];
  for (const m of stripped.matchAll(/\{\{([\w.$]+)/g)) {
    const f = m[1].split(".")[0];
    if (!f || scope.has(f) || /^(true|false|null|undefined)$/.test(f) || /^\d/.test(f)) continue;
    if (!fields.includes(f)) fields.push(f);
  }
  return fields;
}

function hasDynamicSetData(js) {
  const signals = [
    [/setData\s*\(\s*(?!\{)[A-Za-z_$]/m, "setData 传入变量（非对象字面量）"],
    [/setData\s*\(\s*\{[^}]*\.\.\./, "setData 使用了 ...展开"],
    [/setData\s*\(\s*\{[^}]*['"][A-Za-z_$][\w$]*\[/, "setData 使用了数组下标路径 key"],
    [/\bbehaviors\s*:\s*\[|\bBehavior\s*\(/, "组件使用 behaviors，可能注入额外 data/属性"],
    [/\bobservers\s*:\s*\{/, "组件使用 observers 动态派生字段"],
  ];
  for (const [re, reason] of signals) if (re.test(js)) return { reason };
  return null;
}

const API_IMPL_CANDIDATES = ["apis", "tools/services", "tools"];

const exists = p => stat(p).then(() => true).catch(() => false);

async function resolveApiFile(skillDir, name) {
  for (const sub of API_IMPL_CANDIDATES) {
    const p = join(skillDir, sub, `${name}.js`);
    if (await exists(p)) return { path: p, subdir: sub };
  }
  return null;
}

async function listApiFiles(skillDir) {
  const out = [];
  for (const sub of API_IMPL_CANDIDATES) {
    try {
      for (const e of await readdir(join(skillDir, sub), { withFileTypes: true })) {
        if (!e.isFile() || !e.name.endsWith(".js")) continue;
        if (["util.js", "index.js"].includes(e.name) || e.name.endsWith("Store.js")) continue;
        out.push({ path: join(skillDir, sub, e.name), subdir: sub, name: e.name.slice(0, -3) });
      }
    } catch {}
  }
  return out;
}

async function isSkillRoot(p) {
  return (await exists(join(p, "mcp.json"))) || (await exists(join(p, "index.js")));
}

async function findSkillDirs(skillsPath) {
  if (await isSkillRoot(skillsPath)) return [skillsPath];
  const dirs = [];
  try {
    for (const e of await readdir(skillsPath, { withFileTypes: true })) {
      if (e.isDirectory() && await isSkillRoot(join(skillsPath, e.name))) dirs.push(join(skillsPath, e.name));
    }
  } catch {}
  return dirs;
}

async function findComponentDirs(skillPath) {
  const dirs = [];
  try {
    for (const e of await readdir(join(skillPath, "components"), { withFileTypes: true }))
      if (e.isDirectory()) dirs.push(join(skillPath, "components", e.name));
  } catch {}
  return dirs;
}

async function checkSingleRule(rule, skillsPath, ctx = {}) {
  const files = await glob(rule.targets, skillsPath);
  const ex = rule.exclude?.length ? new Set(await glob(rule.exclude, skillsPath)) : null;
  const filtered = ex ? files.filter(f => !ex.has(f)) : files;

  if (filtered.length === 0) {
    if (rule.type === "regex_absent") return [pass(rule, `${rule.name}: 无匹配文件，自动通过`)];
    if (rule.passIfNoFiles) return [pass(rule, `${rule.name}: 无匹配文件，跳过（skill 可能使用聚合入口）`)];
    return [fail(rule, `${rule.name}: 无匹配文件`, { fix: `检查路径模式 ${rule.targets.join(", ")}` })];
  }

  const results = [];
  const skillRoots = await findSkillDirs(skillsPath);
  const skillRootOf = fp => skillRoots.find(r => fp === r || fp.startsWith(r + sep)) || skillsPath;
  const packageRoot = ctx.packageRoot || skillsPath;
  const siblingSkillRoots = (ctx.allSkillRoots || skillRoots).filter(r => r !== skillsPath);

  for (const fp of filtered) {
    const rel = relative(skillsPath, fp);
    if (rule.type === "file_exists") {
      try { await stat(fp); results.push(pass(rule, `${rule.name}: ${rel} 存在`, { file: rel })); }
      catch { results.push(fail(rule, `${rule.name}: ${rel} 不存在`, { file: rel, fix: `创建文件 ${rel}` })); }
      continue;
    }
    let content;
    try { content = await readFile(fp, "utf-8"); }
    catch { results.push(fail(rule, `${rule.name}: 无法读取 ${rel}`, { file: rel, fix: "检查文件权限" })); continue; }

    for (const p of rule.patterns ?? []) {
      const re = new RegExp(p.regex);
      const hit = re.test(content);
      if (rule.type === "regex_present") {
        results.push(hit
          ? pass(rule, `${rule.name}: ${p.message}`, { file: rel })
          : fail(rule, `${rule.name}: ${rel} - ${p.message}`, { file: rel, fix: `在 ${rel} 中添加匹配 /${p.regex}/ 的内容` }));
      } else if (rule.type === "regex_absent") {
        results.push(!hit
          ? pass(rule, `${rule.name}: ${rel} - ${p.message}（未发现违规）`, { file: rel })
          : fail(rule, `${rule.name}: ${rel} - ${p.message}`, { file: rel, fix: `在 ${rel} 中移除匹配 /${p.regex}/ 的内容` }));
      }
    }

    if (Array.isArray(rule.escapeCheck) && rule.escapeCheck.length) {
      results.push(...checkRelativeEscape(rule, fp, rel, content, skillRootOf(fp), skillsPath, packageRoot, siblingSkillRoots));
    }
  }
  return results;
}

function checkRelativeEscape(rule, fp, rel, content, skillRoot, skillsPath, packageRoot = skillRoot, siblingSkillRoots = []) {
  const pkgAbs = resolve(packageRoot);
  const skillAbs = resolve(skillRoot);
  const fileDir = dirname(fp);
  const inside = (abs, root) => abs === root || abs.startsWith(root + sep);
  const escapes = [];
  for (const p of rule.escapeCheck) {
    for (const m of content.matchAll(new RegExp(p.regex, "g"))) {
      const spec = m[1];
      if (!spec || !spec.startsWith(".")) continue;
      const abs = resolve(fileDir, spec);
      if (!inside(abs, pkgAbs)) {
        escapes.push({ spec, abs, message: p.message });
        continue;
      }
      const intoOtherSkill = siblingSkillRoots.find(r => inside(abs, resolve(r)) && !inside(abs, skillAbs));
      if (intoOtherSkill) {
        escapes.push({
          spec, abs,
          message: `相对引用落入另一个 skill 的私有目录（${relative(packageRoot, intoOtherSkill)}）`,
        });
      }
    }
  }
  if (escapes.length === 0) {
    return [pass(rule, `${rule.name}: ${rel} - 相对引用均在分包内（未发现违规）`, { file: rel })];
  }
  const pkgName = packageRoot.split(sep).pop() || ".";
  return escapes.map(e => fail(rule, `${rule.name}: ${rel} - ${e.message}：'${e.spec}' → ${relative(skillsPath, e.abs)}`, {
    file: rel,
    fix: `保持引用在分包 "${pkgName}/" 子树内；跨 skill 共享请抽到分包根下 _shared/ 公共目录`,
  }));
}

const CROSS_CHECKERS = {
  V002: checkV002_AsyncApi,
  V007: checkV007_DefineRegister,
  V008: checkV008_RegisterImpl,
  V009: checkV009_OutputSchema,
  V010: checkV010_ComponentApi,
  V011: checkV011_WxmlSetData,
  V012: checkV012_ComponentFiles,
  V013: checkV013_McpSize,
  V014: checkV014_SkillMdCase,
  V016: checkV016_SkillDescription,
  V017: checkV017_HandoffPagePath,
};

async function checkCrossFileRule(rule, skillsPath, ctx = {}) {
  return (CROSS_CHECKERS[rule.id] || (async () => []))(rule, skillsPath, ctx);
}

async function checkV002_AsyncApi(rule, skillsPath) {
  const out = [];
  for (const skillDir of await findSkillDirs(skillsPath)) {
    let mcpNames;
    try { mcpNames = extractMcpNames(parseMcpApis(JSON.parse(await readFile(join(skillDir, "mcp.json"), "utf-8")))); }
    catch { continue; }
    if (mcpNames.length === 0) continue;

    for (const name of mcpNames) {
      const found = await resolveApiFile(skillDir, name);
      if (!found) continue; 
      const fileRel = relative(skillsPath, found.path);
      let body;
      try { body = await readFile(found.path, "utf-8"); }
      catch { out.push(fail(rule, `${rule.name}: ${fileRel} 无法读取`, { file: fileRel, fix: "检查文件权限" })); continue; }

      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const asyncPatterns = [
        new RegExp(`async\\s+function\\s+${esc}\\b`),
        new RegExp(`\\b(?:const|let|var)\\s+${esc}\\s*=\\s*async\\b`),
        new RegExp(`\\b${esc}\\s*=\\s*async\\b`),
        new RegExp(`(?:^|[,{\\s])${esc}\\s*:\\s*async\\b`),
        new RegExp(`(?:^|[,{\\s])async\\s+${esc}\\s*\\(`),
      ];
      const isAsync = asyncPatterns.some(re => re.test(body));
      if (isAsync) {
        out.push(pass(rule, `${rule.name}: ${fileRel} - '${name}' 是 async 函数`, { file: fileRel }));
      } else {
        out.push(fail(rule, `${rule.name}: ${fileRel} - 已注册接口 '${name}' 必须声明为 async function`, {
          file: fileRel,
          fix: `将 ${name} 改为 async function ${name}(...) { ... } 或 const ${name} = async (...) => { ... }；若 ${name} 只是工具函数，请将其移到同级 utils/ 目录并在 mcp.json 中取消注册`,
        }));
      }
    }
  }
  return out;
}

async function checkV007_DefineRegister(rule, skillsPath) {
  const out = [];
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    let mcpNames;
    try { mcpNames = extractMcpNames(parseMcpApis(JSON.parse(await readFile(join(skillDir, "mcp.json"), "utf-8")))); }
    catch { out.push(fail(rule, `${rule.name}: ${rel}/mcp.json 不存在或无法解析`, { file: `${rel}/mcp.json`, fix: "创建 mcp.json 或检查文件格式" })); continue; }
    let regNames;
    try { regNames = extractRegisterNames(await readFile(join(skillDir, "index.js"), "utf-8")); }
    catch { out.push(fail(rule, `${rule.name}: ${rel}/index.js 不存在或无法读取`, { file: `${rel}/index.js`, fix: "创建 index.js" })); continue; }
    const mcpSet = new Set(mcpNames), regSet = new Set(regNames);
    for (const n of mcpSet) if (!regSet.has(n))
      out.push(fail(rule, `mcp.json 定义了 '${n}'，但 index.js 未注册`, { file: `${rel}/index.js`, fix: `添加 wx.modelContext.registerAPI('${n}', ${n})` }));
    for (const n of regSet) if (!mcpSet.has(n))
      out.push(fail(rule, `index.js 注册了 '${n}'，但 mcp.json 未定义`, { file: `${rel}/mcp.json`, fix: `在 mcp.json 中添加 '${n}' 的定义` }));
    if (mcpSet.size === regSet.size && [...mcpSet].every(n => regSet.has(n)))
      out.push(pass(rule, `${rule.name}: ${rel} - 一致`));
  }
  return out;
}

async function checkV008_RegisterImpl(rule, skillsPath) {
  const out = [];
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    try {
      const reqNames = extractRequireNames(await readFile(join(skillDir, "index.js"), "utf-8"));
      let allExist = true;
      for (const n of reqNames) {
        if (!await resolveApiFile(skillDir, n)) {
          allExist = false;
          out.push(fail(rule, `require('./apis/${n}') 但未找到对应实现文件（已在 ${API_IMPL_CANDIDATES.join("/, ")}/ 下查找 ${n}.js）`,
            { file: `${rel}/apis/${n}.js`, fix: `创建 ${rel}/apis/${n}.js 或 ${rel}/tools/services/${n}.js` }));
        }
      }
      if (allExist) out.push(pass(rule, `${rule.name}: ${rel} - 通过`));
    } catch {
      out.push(fail(rule, `${rule.name}: ${rel}/index.js 不存在`, { file: `${rel}/index.js`, fix: "创建 index.js" }));
    }
  }
  return out;
}

async function checkV009_OutputSchema(rule, skillsPath) {
  const out = [];
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    let apis;
    try { apis = parseMcpApis(JSON.parse(await readFile(join(skillDir, "mcp.json"), "utf-8"))); } catch { continue; }
    for (const item of apis) {
      if (!item?.name) continue;
      const { name } = item;
      const found = await resolveApiFile(skillDir, name);
      if (!found) {
        out.push(fail(rule, `${rule.name}: ${rel} 接口 '${name}' 未找到实现文件（已查找 ${API_IMPL_CANDIDATES.map(s => `${s}/${name}.js`).join(" / ")}）`,
          { file: `${rel}/tools/services/${name}.js`, fix: `创建 ${name}.js 实现文件，或检查 index.js 的 require 路径` }));
        continue;
      }
      const fileRel = relative(skillsPath, found.path);
      let retFields, schemaFields;
      try {
        const body = await readFile(found.path, "utf-8");
        retFields = extractStructuredFields(body);
        schemaFields = extractOutputSchemaFields(item.outputSchema);
      } catch {
        out.push(fail(rule, `${rule.name}: ${fileRel} 无法读取`, { file: fileRel, fix: "检查文件权限" }));
        continue;
      }
      if (!retFields.length) { out.push(pass(rule, `${rule.name}: ${fileRel} - 未识别到显式 structuredContent 字面量，跳过静态对比`, { file: fileRel })); continue; }
      if (!schemaFields.length) { out.push(pass(rule, `${rule.name}: ${fileRel} - outputSchema 未声明字段，跳过`)); continue; }
      const retSet = new Set(retFields), schemaSet = new Set(schemaFields);
      for (const f of retSet) if (!schemaSet.has(f))
        out.push(fail(rule, `接口 ${name} 返回了 '${f}' 但 outputSchema 未声明`, { file: fileRel, fix: `在 mcp.json 的 ${name} outputSchema 中添加 '${f}'` }));
      const required = Array.isArray(item.outputSchema?.required) ? item.outputSchema.required : [];
      for (const f of required) if (!retSet.has(f))
        out.push(fail(rule, `接口 ${name} outputSchema required 声明了 '${f}' 但接口未返回`, { file: fileRel, fix: `在 ${name} structuredContent 中添加 '${f}'` }));
      const allOk = [...retSet].every(f => schemaSet.has(f)) && required.every(f => retSet.has(f));
      if (allOk) out.push(pass(rule, `${rule.name}: ${fileRel} - 一致`));
    }
  }
  return out;
}

async function checkV010_ComponentApi(rule, skillsPath) {
  const out = [];
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    const apiFiles = await listApiFiles(skillDir);
    for (const compDir of await findComponentDirs(skillDir)) {
      const compName = compDir.split("/").pop();
      const compRel = `${rel}/components/${compName}`;
      let compJs;
      try { compJs = await readFile(join(compDir, "index.js"), "utf-8"); } catch { continue; }
      const usedFields = extractComponentStructuredFields(compJs);
      if (!usedFields.length) continue;
      let apiName = "", apiPath = "";
      const m = compJs.match(/atomicApi\s*[:=]\s*['"](\w+)['"]/);
      if (m) {
        apiName = m[1];
        const f = await resolveApiFile(skillDir, apiName);
        if (f) apiPath = f.path;
      }
      if (!apiName) {
        for (const af of apiFiles) {
          try {
            const fields = extractStructuredFields(await readFile(af.path, "utf-8"));
            if (fields.length && usedFields.every(u => fields.includes(u))) { apiName = af.name; apiPath = af.path; break; }
          } catch {}
        }
      }
      if (!apiName) {
        out.push(pass(rule, `${rule.name}: ${compRel} - 未确定关联接口（跳过检查）`, { file: `${compRel}/index.js` }));
        continue;
      }
      try {
        const apiSet = new Set(extractStructuredFields(await readFile(apiPath, "utf-8")));
        let ok = true;
        for (const f of usedFields) if (!apiSet.has(f)) {
          ok = false;
          out.push(fail(rule, `组件 ${compName} 引用 structuredContent.${f} 但接口 ${apiName} 未返回`,
            { file: `${compRel}/index.js`, fix: `在 ${apiName} structuredContent 中添加 '${f}'` }));
        }
        if (ok) out.push(pass(rule, `${rule.name}: ${compRel} - 与接口 ${apiName} 一致`));
      } catch {
        out.push(fail(rule, `${rule.name}: 关联接口 ${apiName} 实现文件无法读取`, { file: relative(skillsPath, apiPath), fix: `检查 ${apiName} 实现文件` }));
      }
    }
  }
  return out;
}

async function checkV011_WxmlSetData(rule, skillsPath) {
  const out = [];
  const IGNORE = new Set(["item", "index", "wx"]);
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    for (const compDir of await findComponentDirs(skillDir)) {
      const compName = compDir.split("/").pop();
      const compRel = `${rel}/components/${compName}`;
      let jsText, setFields, propFields, wxmlFields;
      try {
        jsText = await readFile(join(compDir, "index.js"), "utf-8");
        setFields = extractSetDataFields(jsText);
        propFields = extractPropertiesFields(jsText);
      } catch { continue; }
      try { wxmlFields = extractWxmlBindings(await readFile(join(compDir, "index.wxml"), "utf-8")); } catch { continue; }
      if (!setFields.length && !wxmlFields.length) continue;

      const setSet = new Set(setFields), wxmlSet = new Set(wxmlFields);
      const dynamic = hasDynamicSetData(jsText); 
      let hasError = false;
      for (const f of setSet) if (!IGNORE.has(f) && !wxmlSet.has(f)) {
        out.push(fail(rule, `组件 ${compName} setData/data 有 '${f}' 但 WXML 未使用 {{${f}}}（可能是仅 JS 内部使用的状态）`,
          { level: "warning", file: `${compRel}/index.js`, fix: `在 WXML 中使用 {{${f}}}、或移除 '${f}'、或确认其用途仅限 JS` }));
      }
      for (const f of wxmlSet) if (!IGNORE.has(f) && !propFields.has(f) && !setSet.has(f)) {
        const level = dynamic ? "warning" : rule.level;
        if (!dynamic) hasError = true;
        const suffix = dynamic ? `（${dynamic.reason}，静态无法完全解析 data 字段，降级提示）` : "";
        out.push(fail(rule, `组件 ${compName} WXML 使用 {{${f}}} 但 setData/data/properties 均未定义${suffix}`,
          { level, file: `${compRel}/index.wxml`, fix: `在 data 或 properties 中显式声明 '${f}'，或修正 WXML 绑定` }));
      }
      if (!hasError) out.push(pass(rule, `${rule.name}: ${compRel} - WXML 绑定字段均已声明`));
    }
  }
  return out;
}

async function checkV012_ComponentFiles(rule, skillsPath) {
  const out = [];
  const pathPat = new RegExp(rule.pathPattern ?? "^components/[\\w-]+/index$");
  const reqFiles = rule.requireFiles ?? ["index.js", "index.json", "index.wxml", "index.wxss"];
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    let apis;
    try { apis = parseMcpApis(JSON.parse(await readFile(join(skillDir, "mcp.json"), "utf-8"))); } catch { continue; }
    for (const item of apis) {
      const name = typeof item?.name === "string" ? item.name : "(unknown)";
      const compPath = item?._meta?.ui?.componentPath;
      if (!compPath) { out.push(pass(rule, `${rule.name}: ${rel} 接口 '${name}' 未声明 componentPath（跳过组件校验）`)); continue; }
      if (!pathPat.test(compPath)) { out.push(fail(rule, `接口 '${name}' componentPath '${compPath}' 格式不对`, { file: `${rel}/mcp.json`, fix: `格式应为 "components/<name>/index"` })); continue; }
      const compDir = join(skillDir, compPath.replace(/\/index$/, ""));
      const missing = [];
      for (const f of reqFiles) if (!await exists(join(compDir, f))) missing.push(f);
      if (missing.length) out.push(fail(rule, `接口 '${name}' 组件 ${rel}/${compPath.replace(/\/index$/, "")} 缺少：${missing.join(", ")}`, { file: `${rel}/mcp.json`, fix: `补齐 ${missing.join(", ")}` }));
      else out.push(pass(rule, `${rule.name}: ${rel} 接口 '${name}' 组件完整`));
    }
  }
  return out;
}

async function checkV013_McpSize(rule, skillsPath) {
  const out = [];
  const maxChars = rule.maxChars ?? 24000;
  const warnRatio = rule.warnRatio ?? 0.9;
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    const mcpRel = `${rel}/mcp.json`;
    let raw;
    try { raw = await readFile(join(skillDir, "mcp.json"), "utf-8"); }
    catch { continue; } 
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { out.push(fail(rule, `${rule.name}: ${mcpRel} JSON 解析失败`, { file: mcpRel, fix: "修复 JSON 语法" })); continue; }

    const apis = Array.isArray(parsed?.apis) ? parsed.apis : [];
    const stripped = { ...parsed, apis: apis.map(({ outputSchema: _outputSchema, ...rest }) => rest) };
    const body = JSON.stringify(stripped);
    const len = body.length;

    if (len > maxChars) {
      out.push(fail(rule, `${rule.name}: ${mcpRel} 去除 outputSchema 后长度 ${len} 字符，超过上限 ${maxChars}`, {
        file: mcpRel,
        fix: `精简 description/title/inputSchema 描述文字；若接口数量多难以精简，按职责拆分为多个 skill 分包；当前超出 ${len - maxChars} 字符`,
      }));
    } else if (len >= Math.floor(maxChars * warnRatio)) {
      out.push(fail(rule, `${rule.name}: ${mcpRel} 去除 outputSchema 后长度 ${len} 字符，接近上限 ${maxChars}（${Math.round(len / maxChars * 100)}%）`, {
        level: "warning",
        file: mcpRel,
        fix: `建议精简 description/title/inputSchema 描述文字，避免后续后台侧超限；若接口数量多可按职责拆分为多个 skill 分包`,
      }));
    } else {
      out.push(pass(rule, `${rule.name}: ${mcpRel} ${len}/${maxChars} 字符`));
    }
  }
  return out;
}

async function checkV014_SkillMdCase(rule, skillsPath) {
  const out = [];
  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    let names = [];
    try { names = (await readdir(skillDir, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name); } catch {}
    if (names.includes("SKILL.md")) { out.push(pass(rule, `${rule.name}: ${rel}/SKILL.md`)); continue; }
    const wrong = names.find(n => n.toLowerCase() === "skill.md");
    out.push(fail(rule, `${rule.name}: ${rel} 缺少严格大写的 SKILL.md${wrong ? `（发现 ${wrong}）` : ""}`, {
      file: `${rel}/${wrong || "SKILL.md"}`,
      fix: wrong ? `将 ${wrong} 重命名为 SKILL.md（若文件系统不区分大小写，先改临时名再改回：mv skill.md tmp && mv tmp SKILL.md）` : `创建 ${rel}/SKILL.md（文件名严格全大写）`,
    }));
  }
  return out;
}

async function checkV016_SkillDescription(rule, _skillsPath, ctx = {}) {
  const out = [];
  if (!ctx.projectRoot) return out;
  let appJson;
  try { appJson = JSON.parse(await readFile(join(ctx.projectRoot, "app.json"), "utf-8")); } catch { return out; }
  const skills = appJson?.agent?.skills;
  if (!Array.isArray(skills) || skills.length === 0) return out;
  for (const s of skills) {
    const entry = typeof s === "object" && s !== null ? s : {};
    const name = entry.name || entry.path || "(unknown)";
    const desc = typeof entry.description === "string" ? entry.description.trim() : "";
    if (!desc) {
      out.push(fail(rule, `app.json 中 agent.skills 条目 '${name}' 缺少 description 或 description 为空`, {
        file: "app.json",
        fix: `在 app.json 的 agent.skills 中为该条目补充非空的 description 字段，如：{ "name": "${name}", "description": "该 skill 的业务描述", "path": "${entry.path || ""}" }`,
      }));
    } else {
      out.push(pass(rule, `${rule.name}: skill '${name}' description 已配置`));
    }
  }
  return out;
}

async function checkV017_HandoffPagePath(rule, skillsPath, ctx = {}) {
  const out = [];
  let appPages = null;
  if (ctx.projectRoot) {
    try {
      const appJson = JSON.parse(await readFile(join(ctx.projectRoot, "app.json"), "utf-8"));
      appPages = collectAppPages(appJson);
    } catch {}
  }

  for (const skillDir of await findSkillDirs(skillsPath)) {
    const rel = relative(skillsPath, skillDir);
    const mcpRel = `${rel}/mcp.json`;
    let mcp;
    try { mcp = JSON.parse(await readFile(join(skillDir, "mcp.json"), "utf-8")); } catch { continue; }

    for (const item of parseMcpApis(mcp)) {
      const name = typeof item?.name === "string" ? item.name : "(unknown)";
      const pp = item?._meta?.ui?.pagePath;
      if (pp === undefined || pp === null) continue; // pagePath 按需，未声明则跳过
      const ppStr = typeof pp === "string" ? pp.trim() : "";
      if (!ppStr) {
        out.push(fail(rule, `接口 '${name}' _meta.ui.pagePath 为空`, {
          file: mcpRel,
          fix: `删除该字段，或填真实接力页 path（必须以 '/' 开头、不含 query，取自 app.json 主包 pages[] 或分包 root+pages）`,
        }));
        continue;
      }
      if (!ppStr.startsWith("/")) {
        out.push(fail(rule, `接口 '${name}' pagePath='${ppStr}' 必须以 '/' 开头（绝对路径）`, {
          file: mcpRel,
          fix: `将 pagePath 改为 '/${ppStr.replace(/^\/+/, "")}'`,
        }));
        continue;
      }
      if (ppStr.includes("?")) {
        out.push(fail(rule, `接口 '${name}' pagePath='${ppStr}' 不应带 query`, {
          file: mcpRel,
          fix: `去掉 '?' 及其后内容；query 由原子接口返回值的 handoff.query 传递（详见 wxa-skills-generate SKILL.md C.3.3）`,
        }));
        continue;
      }
      if (appPages && !appPages.includes(ppStr.replace(/^\/+/, ""))) {
        out.push(fail(rule, `接口 '${name}' pagePath='${ppStr}' 不在项目 app.json 的主包 pages[] 与分包 root+pages 拼接结果中`, {
          file: mcpRel,
          fix: `改为 app.json 中真实存在的页面（带前导 '/'、不含 query）`,
        }));
        continue;
      }
      // 声明了 pagePath 表示"停下等用户确认后进接力页"，实现应返回 handoff 承接 query/payload
      let handoffWarned = false;
      const found = await resolveApiFile(skillDir, name);
      if (found) {
        try {
          const body = await readFile(found.path, "utf-8");
          if (!/\bhandoff\b/.test(body)) {
            handoffWarned = true;
            out.push(fail(rule, `接口 '${name}' 声明了 pagePath 但实现未返回 handoff（用户点卡片进接力页时缺少 query/payload 传递）`, {
              level: "warning",
              file: relative(skillsPath, found.path),
              fix: `在返回值顶层（与 content/structuredContent 同级）增加 handoff: { query: '...', payload? }（详见 wxa-skills-generate SKILL.md C.3.3）`,
            }));
          }
        } catch {}
      }
      if (!handoffWarned) out.push(pass(rule, `${rule.name}: ${rel} 接口 '${name}' pagePath='${ppStr}'`));
    }
  }
  return out;
}

function collectAppPages(appJson) {
  const set = new Set();
  const trimSlash = s => String(s).replace(/^\/+/, "").replace(/\/+$/, "");
  if (Array.isArray(appJson?.pages)) {
    for (const p of appJson.pages) {
      if (typeof p === "string" && p.trim()) set.add(trimSlash(p));
    }
  }
  const subs = Array.isArray(appJson?.subPackages)
    ? appJson.subPackages
    : (Array.isArray(appJson?.subpackages) ? appJson.subpackages : []);
  for (const sp of subs) {
    if (!sp || typeof sp !== "object") continue;
    const root = typeof sp.root === "string" ? trimSlash(sp.root) : "";
    if (!root) continue;
    if (!Array.isArray(sp.pages)) continue;
    for (const p of sp.pages) {
      if (typeof p !== "string" || !p.trim()) continue;
      set.add(`${root}/${trimSlash(p)}`);
    }
  }
  return Array.from(set);
}


function groupFindings(findings) {
  const map = new Map(), standalone = [];
  for (const f of findings) {
    if (!f.file) { standalone.push(f); continue; }
    const key = [f.id, f.level, f.detail || "", f.fix || ""].join("\u0001");
    let g = map.get(key);
    if (!g) {
      g = { id: f.id, level: f.level, files: [] };
      if (f.detail) g.detail = f.detail;
      if (f.fix) g.fix = f.fix;
      map.set(key, g);
    }
    g.files.push(f.file);
  }
  const grouped = [...map.values()].map(g => {
    if (g.files.length === 1) return { id: g.id, level: g.level, file: g.files[0], ...(g.detail && { detail: g.detail }), ...(g.fix && { fix: g.fix }) };
    return g;
  });
  return [...grouped, ...standalone];
}

function compactFinding(r, ruleNameById) {
  const ruleName = ruleNameById[r.id] || "";
  let detail = r.message || "";
  if (ruleName && detail.startsWith(ruleName + ": ")) detail = detail.slice(ruleName.length + 2);
  if (r.file && detail.startsWith(r.file + " - ")) detail = detail.slice(r.file.length + 3);
  let fix = r.fix;
  if (fix && r.file) {
    fix = fix.replace(new RegExp("^在\\s*" + r.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*中\\s*"), "");
  }
  return {
    id: r.id, level: r.level,
    ...(r.file && { file: r.file }),
    ...(detail && { detail }),
    ...(fix && { fix }),
  };
}

async function loadRules(customPath) {
  const builtin = structuredClone(BUILTIN_RULES);
  if (!customPath) return builtin;
  const custom = JSON.parse(await readFile(resolve(customPath), "utf-8"));
  const merge = (base, add = []) => {
    const m = new Map(base.map(r => [r.id, r]));
    for (const r of add) m.set(r.id, r);
    return [...m.values()];
  };
  return { rules: merge(builtin.rules, custom.rules), crossFileRules: merge(builtin.crossFileRules, custom.crossFileRules) };
}

function mapTargets(ruleSet, fn) {
  return {
    rules: ruleSet.rules.map(r => ({ ...r, targets: r.targets.map(fn), exclude: r.exclude?.map(fn) })),
    crossFileRules: ruleSet.crossFileRules,
  };
}

const stripSkillsPrefix = ruleSet => mapTargets(ruleSet, p => p.replace(/^skills\//, ""));

const adaptTargetsForSingleSkill = ruleSet => mapTargets(ruleSet, p => {
  const parts = p.split("/");
  return parts.length >= 2 && parts[0] === "*" ? parts.slice(1).join("/") : p;
});

async function resolveCliPath(userInput) {
  const isWin = process.platform === "win32";
  const candidates = (typeof userInput === "string" && userInput)
    ? [userInput]
    : [
        process.env.WECHAT_DEVTOOLS_CLI,
        process.env.WXA_CLI,
        ...(isWin ? WIN_CLI_CANDIDATES : []),
        DEFAULT_CLI_PATH,
      ].filter(p => typeof p === "string" && p.length > 0);
  for (const p of candidates) {
    // Windows 无可执行位概念，统一用存在性（F_OK）判定
    try { await access(p, isWin ? FS.F_OK : FS.X_OK); return p; } catch {}
  }
  return null;
}

async function runBuildCheck(projectPath, { cliPath, timeoutMs = 180000 } = {}) {
  const startedAt = Date.now();
  const effectiveCliPath = await resolveCliPath(cliPath);
  if (!effectiveCliPath) {
    return { ran: false, success: false, stage: "unknown", durationMs: 0, message: `跳过：未找到微信开发者工具 CLI（已尝试 --cli-path / $WECHAT_DEVTOOLS_CLI / $WXA_CLI / 默认路径 ${DEFAULT_CLI_PATH}）。请通过 --cli-path <cli 绝对路径> 或环境变量 WECHAT_DEVTOOLS_CLI 指定后重试。`, logTail: "", exitCode: 0 };
  }

  const workDir = join(tmpdir(), `wxa-validate-build-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const infoFile = join(workDir, "info.json"), qrFile = join(workDir, "qr.png");

  let raw;
  try {
    raw = await runCli(effectiveCliPath, [
      "preview", "--project", resolve(projectPath),
      "--info-output", infoFile, "--qr-output", qrFile, "--qr-format", "base64",
    ], timeoutMs);
  } catch (err) {
    return { ran: true, success: false, stage: "unknown", durationMs: Date.now() - startedAt, message: `CLI 启动失败: ${err.message}`, logTail: "", exitCode: -1 };
  } finally {
    unlink(infoFile).catch(() => {});
    unlink(qrFile).catch(() => {});
  }

  const combined = (raw.stdout || "") + "\n" + (raw.stderr || "");
  const durationMs = Date.now() - startedAt;
  const logTail = combined.split(/\r?\n/).filter(Boolean).slice(-20).join("\n");

  const compileSignals = [
    /compile\s+(error|fail|failed)/i, /SyntaxError/, /Unexpected token/i, /Unterminated/i,
    /\[error\][^\n]*(compile|wxml|wxss|wxs|parser|syntax|模板|语法)/i,
    /✖\s*preparing/i, /✖\s*compile/i,
  ];
  const reachedUpload = /(^|\n)\s*[-✔✖]?\s*Upload(ing)?/i.test(combined) || /doUpload/.test(combined);
  const reachedPreview = /(^|\n)\s*[-✔✖]?\s*preview\b/i.test(combined);
  const hasCompileFail = compileSignals.some(re => re.test(combined));
  const hasAnyError = /\[error\]/i.test(combined) || raw.code !== 0 || raw.timedOut;

  if (raw.timedOut) return { ran: true, success: false, stage: "timeout", durationMs, message: `CLI 在 ${timeoutMs}ms 内未完成（可能是 preview 卡住或网络慢）；如需更长时间请加 --build-timeout <ms>`, logTail, exitCode: raw.code };
  if (hasCompileFail) return { ran: true, success: false, stage: "compile", durationMs, message: "编译失败（存在语法或编译错误）", logTail, exitCode: raw.code };
  if (reachedUpload) {
    const uploadFailed = /Error: 上传失败|✖\s*Upload/i.test(combined);
    return { ran: true, success: true, stage: "upload", durationMs,
      message: uploadFailed ? "编译通过；上传阶段失败（与本地代码编译无关，仅供参考）" : "编译通过且已生成预览二维码",
      logTail, exitCode: raw.code };
  }
  if (reachedPreview && !hasAnyError) return { ran: true, success: true, stage: "preview", durationMs, message: "编译通过（preview 阶段完成）", logTail, exitCode: raw.code };
  if (hasAnyError) return { ran: true, success: false, stage: "unknown", durationMs, message: "CLI 返回非预期错误，未识别到明确阶段", logTail, exitCode: raw.code };
  return { ran: true, success: true, stage: "unknown", durationMs, message: "CLI 未报编译错误", logTail, exitCode: raw.code };
}

async function ensureValidateIgnoreConfig(projectRoot) {
  const configPath = join(projectRoot, "project.config.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    
    const packOptions = (config.packOptions && typeof config.packOptions === "object") ? config.packOptions : {};
    const packIgnore = Array.isArray(packOptions.ignore) ? packOptions.ignore.slice() : [];
    const packTarget = { type: "folder", value: "cli-agent-run" };
    const packExists = packIgnore.some(it => it?.type === packTarget.type && it?.value === packTarget.value);
    
    const watchOptions = (config.watchOptions && typeof config.watchOptions === "object") ? config.watchOptions : {};
    const watchIgnore = Array.isArray(watchOptions.ignore) ? watchOptions.ignore.slice() : [];
    const watchPattern = "cli-agent-run/**/*";
    const watchExists = watchIgnore.includes(watchPattern);
    
    if (packExists && watchExists) {
      return { changed: false, added: [] };
    }
    
    const added = [];
    if (!packExists) { packIgnore.push(packTarget); added.push({ scope: "packOptions", ...packTarget }); }
    if (!watchExists) { watchIgnore.push(watchPattern); added.push({ scope: "watchOptions", value: watchPattern }); }
    
    config.packOptions = { ...packOptions, ignore: packIgnore };
    config.watchOptions = { ...watchOptions, ignore: watchIgnore };
    await writeFile(configPath, JSON.stringify(config, null, 2) + (raw.endsWith("\n") ? "\n" : ""), "utf-8");
    return { changed: true, added };
  } catch (err) {
    return { changed: false, added: [], reason: `跳过配置同步: ${err.message}` };
  }
}

async function loadSubPackageRoots(projectRoot) {
  try {
    const appJson = JSON.parse(await readFile(join(projectRoot, "app.json"), "utf-8"));
    const list = [...(appJson.subPackages || []), ...(appJson.subpackages || [])];
    const roots = [];
    for (const s of list) {
      const root = typeof s === "string" ? s : s?.root;
      if (root) roots.push(resolve(projectRoot, root));
    }
    return [...new Set(roots)];
  } catch {
    return [];
  }
}

async function discoverSkillDirsFromProject(projectRoot) {
  const dirs = [];
  try {
    const appJson = JSON.parse(await readFile(join(projectRoot, "app.json"), "utf-8"));
    const skills = appJson?.agent?.skills;
    if (Array.isArray(skills)) {
      for (const s of skills) {
        const p = typeof s === "string" ? s : s?.path;
        if (!p) continue;
        const abs = resolve(projectRoot, p);
        if (await isSkillRoot(abs)) dirs.push(abs);
      }
    }
  } catch {}
  if (dirs.length === 0) {
    for (const candidate of ["metaServicePkg", "skills"]) {
      const abs = join(projectRoot, candidate);
      if (await isSkillRoot(abs)) dirs.push(abs);
      else {
        try {
          for (const e of await readdir(abs, { withFileTypes: true })) {
            if (e.isDirectory() && await isSkillRoot(join(abs, e.name))) dirs.push(join(abs, e.name));
          }
        } catch {}
      }
    }
  }
  return [...new Set(dirs)];
}

async function validate(projectPath, opts = {}) {
  const projectRoot = resolve(projectPath);
  if (!await exists(join(projectRoot, "project.config.json"))) {
    throw new Error(`${projectRoot} 下未找到 project.config.json，请传入小程序项目根目录`);
  }

  const ignoreSync = await ensureValidateIgnoreConfig(projectRoot);

  const skillDirs = await discoverSkillDirsFromProject(projectRoot);
  if (skillDirs.length === 0) {
    throw new Error(`未在 ${projectRoot}/app.json 的 agent.skills 中发现 skill 分包；也未在 metaServicePkg/ 或 skills/ 下找到合法 skill 目录`);
  }

  const subPkgRoots = await loadSubPackageRoots(projectRoot);
  const packageRootOf = (skillDir) => {
    const cands = subPkgRoots.filter(r => skillDir === r || skillDir.startsWith(r + sep));
    if (cands.length) return cands.sort((a, b) => b.length - a.length)[0];
    const parent = dirname(skillDir);
    return parent && parent !== skillDir ? parent : skillDir;
  };

  const ruleSet = stripSkillsPrefix(await loadRules(opts.rules));
  const ruleDict = {};
  for (const r of [...ruleSet.rules, ...ruleSet.crossFileRules]) ruleDict[r.id] = { stage: r.stage, level: r.level, name: r.name };
  const ruleNameById = Object.fromEntries(Object.entries(ruleDict).map(([k, v]) => [k, v.name]));

  const skillsByPkg = new Map();
  for (const skillDir of skillDirs) {
    const pkgRoot = packageRootOf(skillDir);
    if (!skillsByPkg.has(pkgRoot)) skillsByPkg.set(pkgRoot, []);
    skillsByPkg.get(pkgRoot).push(skillDir);
  }
  const sharedDirsByPkg = new Map();
  for (const [pkgRoot, skills] of skillsByPkg) {
    const dirs = [];
    try {
      for (const e of await readdir(pkgRoot, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const abs = join(pkgRoot, e.name);
        if (skills.includes(abs)) continue;
        if (await isSkillRoot(abs)) continue;
        dirs.push(abs);
      }
    } catch {}
    if (dirs.length) sharedDirsByPkg.set(pkgRoot, dirs);
  }

  const all = [];
  const localRuleSet = adaptTargetsForSingleSkill(ruleSet);
  const projectLevelRuleIds = new Set(["V016"]);
  for (const skillDir of skillDirs) {
    const pkgRoot = packageRootOf(skillDir);
    const allSkillRoots = skillsByPkg.get(pkgRoot) || [skillDir];
    for (const r of localRuleSet.rules) all.push(...await checkSingleRule(r, skillDir, { packageRoot: pkgRoot, allSkillRoots }));
    for (const r of localRuleSet.crossFileRules) {
      if (projectLevelRuleIds.has(r.id)) continue;
      all.push(...await checkCrossFileRule(r, skillDir, { projectRoot }));
    }
  }
  for (const r of localRuleSet.crossFileRules) {
    if (!projectLevelRuleIds.has(r.id)) continue;
    all.push(...await checkCrossFileRule(r, null, { projectRoot }));
  }

  const sharedRuleIds = new Set(["V001"]);
  const sharedRules = localRuleSet.rules.filter(r => sharedRuleIds.has(r.id));
  for (const [pkgRoot, sharedDirs] of sharedDirsByPkg) {
    const allSkillRoots = skillsByPkg.get(pkgRoot) || [];
    for (const sharedDir of sharedDirs) {
      for (const r of sharedRules) {
        all.push(...await checkSingleRule(r, sharedDir, { packageRoot: pkgRoot, allSkillRoots }));
      }
    }
  }

  const fails = all.filter(r => r.status === "fail");
  const passes = all.filter(r => r.status === "pass");

  const passedByRule = {};
  for (const r of passes) {
    const e = passedByRule[r.id] || { id: r.id, name: ruleNameById[r.id] || r.id, count: 0 };
    e.count++;
    passedByRule[r.id] = e;
  }

  const staticErrors = fails.filter(r => r.level === "error").length;
  let build;
  if (staticErrors > 0) {
    build = { ran: false, success: false, stage: "unknown", durationMs: 0, message: `跳过：静态校验存在 ${staticErrors} 个 error，修复后会自动重新触发`, logTail: "", exitCode: 0 };
  } else {
    build = await runBuildCheck(projectRoot, { cliPath: opts.cliPath, timeoutMs: opts.buildTimeoutMs ?? 180000 });
  }

  return {
    timestamp: new Date().toISOString(),
    projectPath: projectRoot,
    skillDirs: skillDirs.map(d => relative(projectRoot, d)),
    ignoreSync,
    summary: {
      total: all.length, passed: passes.length, failed: fails.length,
      errors: fails.filter(r => r.level === "error").length,
      warnings: fails.filter(r => r.level === "warning").length,
      buildStatus: build ? (build.ran ? (build.success ? "pass" : "fail") : "skipped") : null,
    },
    rules: ruleDict,
    results: groupFindings(fails.map(r => compactFinding(r, ruleNameById))),
    passedSummary: Object.values(passedByRule).sort((a, b) => a.id.localeCompare(b.id)),
    build,
  };
}

function printSummary(report, outputPath) {
  const { summary, results, passedSummary = [], rules = {}, build, projectPath, skillDirs = [], ignoreSync } = report;
  console.log(`[validate] project=${projectPath}  skills=[${skillDirs.join(", ")}]  ${report.timestamp}`);
  console.log(`total=${summary.total} passed=${summary.passed} failed=${summary.failed} errors=${summary.errors} warnings=${summary.warnings}`);

  if (ignoreSync) {
    if (ignoreSync.changed && Array.isArray(ignoreSync.added) && ignoreSync.added.length) {
      const groups = { packOptions: [], watchOptions: [] };
      for (const it of ignoreSync.added) {
        if (it.scope === "packOptions") groups.packOptions.push(`${it.type}:${it.value}`);
        else if (it.scope === "watchOptions") groups.watchOptions.push(it.value);
      }
      const parts = [];
      if (groups.packOptions.length) parts.push(`packOptions.ignore +${groups.packOptions.length} [${groups.packOptions.join(", ")}]`);
      if (groups.watchOptions.length) parts.push(`watchOptions.ignore +${groups.watchOptions.length} [${groups.watchOptions.join(", ")}]`);
      console.log(`project.config.json: ${parts.join(" / ")}（避免循环编译）`);
    } else if (ignoreSync.reason) {
      console.log(`project.config.json: 跳过同步 - ${ignoreSync.reason}`);
    }
  }

  if (passedSummary.length) {
    console.log(`Passed (by rule): ${passedSummary.map(p => `${p.id}:${p.count}`).join("  ")}`);
  }

  if (results.length) {
    console.log("\nFailed:");
    for (const r of results) {
      const ruleName = rules[r.id]?.name || "";
      console.log(`  [${r.level.toUpperCase()}] ${r.id}${ruleName ? " " + ruleName : ""}${r.detail ? " - " + r.detail : ""}`);
      if (r.file) console.log(`       @ ${r.file}`);
      else if (Array.isArray(r.files)) for (const f of r.files) console.log(`       @ ${f}`);
      if (r.fix) console.log(`       fix: ${r.fix}`);
    }
  }

  if (build) {
    if (!build.ran) {
      console.log(`\nBuild: SKIPPED - ${build.message}`);
    } else {
      const status = build.success ? "PASS" : "FAIL";
      console.log(`\nBuild: ${status} [stage=${build.stage}, ${(build.durationMs / 1000).toFixed(1)}s] - ${build.message}`);
      if (!build.success && build.logTail) {
        console.log("Build log (last lines):");
        for (const l of build.logTail.split("\n")) console.log(`  > ${l}`);
      }
    }
  }

  console.log(`\nreport: ${outputPath}`);
  const buildFail = build && build.ran && !build.success;
  if (summary.errors > 0 || buildFail) {
    const bits = [];
    if (summary.errors > 0) bits.push(`${summary.errors} errors`);
    if (buildFail) bits.push(`build ${build.stage} failed`);
    console.log(`RESULT: FAIL (${bits.join(", ")})`);
  } else if (summary.warnings > 0) {
    console.log(`RESULT: PASS with ${summary.warnings} warnings`);
  } else {
    console.log("RESULT: PASS");
  }
}

const argv = process.argv.slice(2);
const cli = { output: null, rules: null, cliPath: null, buildTimeout: null, projectPath: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = argv[i + 1];
  if (a === "--output" && next) cli.output = argv[++i];
  else if (a === "--rules" && next) cli.rules = argv[++i];
  else if (a === "--cli-path" && next) cli.cliPath = argv[++i];
  else if (a === "--build-timeout" && next) cli.buildTimeout = Number(argv[++i]);
  else if (!a.startsWith("--")) cli.projectPath = a;
}
if (!cli.projectPath) {
  console.error("usage: node validate.mjs <miniprogram-project-path> [--output <path>] [--rules <path>] [--cli-path <path>] [--build-timeout <ms>]");
  console.error("说明：<miniprogram-project-path> 指小程序项目根目录（含 project.config.json + app.json）；脚本自动从 app.json 的 agent.skills[].path 发现 skill 分包并只在分包范围内做静态校验，静态 0 error 后自动调用 cli preview 做编译校验。");
  process.exit(2);
}

const defaultOutput = join(resolve(cli.projectPath), "cli-agent-run", "validate-report.json");

try {
  const report = await validate(cli.projectPath, {
    rules: cli.rules,
    cliPath: cli.cliPath,
    buildTimeoutMs: cli.buildTimeout,
  });
  const out = resolve(cli.output || defaultOutput);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2), "utf-8");
  printSummary(report, out);
  const buildFail = report.build && report.build.ran && !report.build.success;
  process.exit(report.summary.errors > 0 || buildFail ? 1 : 0);
} catch (err) {
  console.error("validate error:", err.message);
  process.exit(2);
}
