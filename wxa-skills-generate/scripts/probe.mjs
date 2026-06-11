#!/usr/bin/env node
// scripts/probe.mjs
// 用法：node probe.mjs --project <path> --plan <plan.json> [--output <path>] [--auto-port 9420] [--cli-path <path>] [--mode launch|connect] [--ws-endpoint <url>]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, detectDefaultCliPath, runProbePlan, summarize, DEFAULT_AUTO_PORT } from "./probe-lib.mjs";

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(`用法: node probe.mjs --project <path> --plan <plan.json> [--output] [--auto-port ${DEFAULT_AUTO_PORT}] [--cli-path] [--mode launch|connect] [--ws-endpoint]`);
    process.exit(0);
  }
  if (!opts.project || !opts.plan) {
    console.error("错误：必须提供 --project 和 --plan");
    process.exit(2);
  }

  let plan;
  try {
    plan = JSON.parse(await readFile(resolve(opts.plan), "utf8"));
  } catch (err) {
    console.error(`错误：读取 plan 失败：${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(plan) || !plan.length) {
    console.error("错误：plan 必须是非空数组");
    process.exit(2);
  }

  const cliPath = opts["cli-path"] || detectDefaultCliPath();
  if (!cliPath && opts.mode !== "connect") {
    console.error("错误：未找到微信开发者工具 CLI，请通过 --cli-path 指定或设置 WX_CLI_PATH 环境变量");
    process.exit(2);
  }

  if (cliPath) console.log(`[probe] CLI: ${cliPath}`);

  let payload;
  try {
    payload = await runProbePlan({
      projectPath: resolve(opts.project),
      plan,
      autoPort: Number(opts["auto-port"]) || DEFAULT_AUTO_PORT,
      cliPath,
      launchTimeoutMs: Number(opts["launch-timeout"]) || undefined,
      interactionTimeoutMs: Number(opts["interaction-timeout"]) || undefined,
      outputPath: opts.output ? resolve(opts.output) : null,
      mode: opts.mode === "connect" ? "connect" : "launch",
      wsEndpoint: opts["ws-endpoint"],
    });
  } catch (err) {
    console.error(`[probe] 执行失败：${err.message}`);
    process.exit(2);
  }

  const sum = summarize(payload);
  if (opts.output) {
    console.log(`[probe] 结果已写入 ${opts.output}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  console.log(`[probe] 汇总：成功 ${sum.ok}/${sum.total}，失败 ${sum.failed}`);

  if (sum.failures.length) {
    for (const f of sum.failures) {
      console.error(`  - ${f.api_name}: ${f.status} (${f.error || "未知"})`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[probe] 未处理异常：${err?.stack || err}`);
  process.exit(2);
});
