#!/usr/bin/env node
import { readFile, unlink, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  DEFAULT_CLI_PATH, DEFAULT_TIMEOUT_MS,
  callAgentRender, normalizeCliResult, writeJson, parseArgs,
} from "./lib.mjs";

const SPEC = {
  project: "string",
  name: "string",
  args: "string",
  "from-execute": "string",
  output: "string",
  "cli-path": "string",
  timeout: "number",
  help: "boolean",
};

const USAGE = `用法: node render.mjs --project <path> [--from-execute <path> | --name <name>] [options]

必需参数:
  --project <path>           项目根目录（含 project.config.json + app.json）

二选一:
  --from-execute <path>      execute 产物 JSON；自动继承 name / args（args 取 invokeResult.structuredContent；缺失时直接报错）
  --name <name>              原子接口名（独立调用时必填）

可选参数:
  --args <json>              JSON 参数字符串；独立调用时建议显式传；--from-execute 会继承
  --output <path>            最终 JSON 落盘路径；同时会在同目录生成 <basename>.snapshot.png
                             缺省时只打印到 stdout（snapshot.dataUrl 仍会被替换为摘要）
  --cli-path <path>          CLI 可执行文件路径（默认 ${DEFAULT_CLI_PATH}）
  --timeout <ms>             Node 侧 spawn 等待时间（默认 ${DEFAULT_TIMEOUT_MS}）；仅在非默认值时下发给 CLI
`;

async function loadExecuteContext(path) {
  const absPath = resolve(path);
  const raw = JSON.parse(await readFile(absPath, "utf-8"));
  const params = raw.params || {};
  const ir = raw.invokeResult || {};
  const sc = ir.structuredContent;

  if (!sc || typeof sc !== "object" || Array.isArray(sc)) {
    throw new Error(
      `execute 产物 ${absPath} 缺少 invokeResult.structuredContent，` +
      `render 无法从中继承 args。请先重新执行 execute 并确认 status=ok 且 ` +
      `invokeResult.isError!==true、invokeResult.structuredContent 是非空对象后，` +
      `再用 --from-execute 传入该产物。`
    );
  }

  return {
    name: params.name,
    args: JSON.stringify(sc),
  };
}

function verifyRender(result) {
  const snap = result?.snapshot || {};
  const hasSnapshotSummary = !!(snap.file || snap.absolutePath);
  const hasRawSnapshot = typeof result?.snapshotBase64 === "string" || typeof snap.dataUrl === "string";
  const ir = result?.invokeResult;
  const hasInvokeResult = ir && typeof ir === "object";

  const checks = {
    statusOk: result?.status === "ok",
    commandIsRender: result?.command === "render",
    hasSnapshot: hasSnapshotSummary || hasRawSnapshot,
    noInvokeError: !hasInvokeResult || ir.isError !== true,
    invokeResultOk: !hasInvokeResult || (ir.isError !== true),
  };
  const passed = checks.statusOk && checks.commandIsRender && checks.hasSnapshot && checks.noInvokeError;
  return { passed, checks };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2), SPEC);
  if (opts.help) { console.log(USAGE); process.exit(0); }

  if (!opts.project) {
    console.error(USAGE);
    console.error("\n错误: --project 必需。");
    process.exit(2);
  }
  if (!opts["from-execute"] && !opts.name) {
    console.error(USAGE);
    console.error("\n错误: --from-execute 或 --name 至少需提供一个。");
    process.exit(2);
  }

  let ctx = {};
  if (opts["from-execute"]) {
    try {
      ctx = await loadExecuteContext(opts["from-execute"]);
    } catch (err) {
      console.error(`[render] 读取 --from-execute 失败: ${err.message}`);
      process.exit(2);
    }
  }

  const name = opts.name || ctx.name;
  if (!name) {
    console.error("[render] 无法确定 --name（from-execute 中未含 params.name）");
    process.exit(2);
  }

  const finalOutput = opts.output ? resolve(opts.output) : null;
  if (finalOutput) await mkdir(dirname(finalOutput), { recursive: true });

  let raw;
  try {
    raw = await callAgentRender({
      project: opts.project,
      name,
      args: opts.args || ctx.args,
      cliPath: opts["cli-path"] ?? DEFAULT_CLI_PATH,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
      output: finalOutput || undefined,
    });
  } catch (err) {
    console.error(`[render] 调用 CLI 失败: ${err.message}`);
    process.exit(2);
  }

  const { ok, result, error, diag } = normalizeCliResult(raw);
  const payload = result ?? {
    command: "render",
    status: "error",
    error: { message: error || "unknown" },
    consoleMessages: [],
  };

  const { passed, checks } = verifyRender(payload);
  payload._meta = {
    ...(payload._meta || {}),
    name,
    snapshotPng: raw.snapshotPngPath,
    verify: { passed, checks },
    cliStderr: raw.stderr || undefined,
    cliExitCode: raw.code,
  };

  if (diag) {
    payload._meta.diagnosis = diag;
  }

  if (finalOutput) {
    await writeJson(finalOutput, payload);
    console.log(`[render] ${name}  saved -> ${finalOutput}`);
    if (payload?.snapshot?.file) {
      console.log(`[render] ${name}  snapshot -> ${raw.snapshotPngPath}`);
    }
  } else {
    console.log(JSON.stringify(payload, null, 2));
    unlink(raw.outputFile).catch(() => {});
    if (raw.snapshotPngPath) unlink(raw.snapshotPngPath).catch(() => {});
  }

  console.log(`[render] ${name}  checks: ${JSON.stringify(checks)}`);

  if (diag) {
    console.error(`\n⚠️  ${diag.hint}\n`);
  }

  if (ok && passed) {
    console.log(`[render] ${name}  RESULT: PASS`);
    process.exit(0);
  }
  console.error(`[render] ${name}  RESULT: FAIL`);
  if (error) console.error(`  error: ${error}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`[render] 未处理异常: ${err?.stack || err?.message || err}`);
  process.exit(2);
});
