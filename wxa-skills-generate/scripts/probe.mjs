#!/usr/bin/env node
// scripts/probe.mjs
// 调用方式见 references/RUNTIME_PROBE.md「三、标准探测流程」
//
// 用法：
//   node probe.mjs --project /path/to/source-mp --plan ./plan.json --output ./.probe/run-1.json
//   node probe.mjs --project /path/to/source-mp --plan ./plan.json --auto-port 9420 --cli-path /path/to/cli
//   node probe.mjs --mode connect --ws-endpoint ws://localhost:9420 --plan ./plan.json --project /path/to/source-mp
//
// plan.json 格式（数组）：
// [
//   {
//     "api_name": "searchMovies",
//     "target_page": "/pages/movie/list",
//     "matchUrlIncludes": "/api/movie/search",
//     "captureWaitMs": 6000,
//     "trigger": [
//       { "kind": "input", "selector": "#search-input", "value": "阿凡达" },
//       { "kind": "tap", "selector": "#search-btn", "delayAfterMs": 200 }
//     ],
//     "preSteps": [                          // 可选：前置步骤（如登录）
//       {
//         "target_page": "/pages/login/index",
//         "trigger": [
//           { "kind": "tap", "selector": "#login-btn" }
//         ],
//         "waitMs": 3000
//       }
//     ]
//   }
// ]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseArgs,
  detectDefaultCliPath,
  runProbePlan,
  summarize,
  DEFAULT_AUTO_PORT,
} from "./probe-lib.mjs";

const USAGE = `用法: node probe.mjs --project <path> --plan <plan.json> [options]

必需参数:
  --project <path>           源小程序项目根目录（含 project.config.json）
  --plan <path>              探测计划 JSON 文件路径

可选参数:
  --output <path>            结果落盘路径（默认 stdout）
  --auto-port <port>         automator 端口（默认 ${DEFAULT_AUTO_PORT}）
  --cli-path <path>          开发者工具 CLI 路径（默认按平台自动检测）
  --mode launch|connect      启动方式（默认 launch；已开 cli --auto 时用 connect）
  --ws-endpoint <url>        connect 模式下的 ws 端点（如 ws://localhost:9420）
  --launch-timeout <ms>      启动超时（默认 60000）
  --interaction-timeout <ms> 单接口等待请求的超时（默认 10000）

CLI 自动检测顺序:
  1. 环境变量 WX_CLI_PATH
  2. 默认安装路径（macOS: /Applications/wechatwebdevtools.app/Contents/MacOS/cli）
  3. 用户目录下安装路径
  4. macOS: mdfind 搜索
  如自动检测失败，请通过 --cli-path 或设置 WX_CLI_PATH 环境变量指定

依赖:
  在当前 skill 目录执行：npm i -D miniprogram-automator
  开发者工具 → 设置 → 安全设置 → 服务端口：开启
`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || (!opts.project && !opts.plan)) {
    console.log(USAGE);
    process.exit(opts.help ? 0 : 2);
  }
  if (!opts.project) {
    console.error("错误：缺少 --project");
    process.exit(2);
  }
  if (!opts.plan) {
    console.error("错误：缺少 --plan");
    process.exit(2);
  }

  const planPath = resolve(opts.plan);
  let plan;
  try {
    const txt = await readFile(planPath, "utf8");
    plan = JSON.parse(txt);
  } catch (err) {
    console.error(`错误：读取或解析 plan 文件失败 (${planPath})：${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(plan) || plan.length === 0) {
    console.error("错误：plan 必须是非空数组");
    process.exit(2);
  }

  const cliPath = opts["cli-path"] || detectDefaultCliPath();
  if (!cliPath && opts.mode !== "connect") {
    console.error("错误：未提供 --cli-path 且未能自动检测到微信开发者工具 CLI");
    console.error("");
    console.error("请尝试以下方式之一：");
    console.error("  1. 通过 --cli-path 参数指定，例如：");
    console.error("     --cli-path /Applications/wechatwebdevtools.app/Contents/MacOS/cli");
    console.error("  2. 设置环境变量：");
    console.error("     export WX_CLI_PATH=/path/to/cli");
    console.error("  3. 在开发者工具中确认安装位置后重试");
    console.error("");
    console.error("常见安装路径：");
    console.error("  macOS: /Applications/wechatwebdevtools.app/Contents/MacOS/cli");
    console.error("  Windows: C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat");
    process.exit(2);
  }

  if (cliPath) {
    console.log(`[ai-mode:probe] CLI: ${cliPath}`);
  }

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
    console.error(`[ai-mode:probe] 执行失败：${err.message}`);
    process.exit(2);
  }

  const sum = summarize(payload);
  if (opts.output) {
    console.log(`[ai-mode:probe] 结果已写入 ${opts.output}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  console.log(`[ai-mode:probe] 汇总：成功 ${sum.ok}/${sum.total}，失败 ${sum.failed}`);
  if (sum.failures.length) {
    for (const f of sum.failures) {
      console.error(`  - ${f.api_name}: ${f.status} (${f.error || "未知原因"})`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[ai-mode:probe] 未处理异常：${err?.stack || err?.message || err}`);
  process.exit(2);
});
