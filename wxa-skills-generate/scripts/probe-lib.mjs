// probe-lib.mjs — Automator 探针核心库
// 通过 evaluate 覆写 wx.request 捕获请求/响应，按 plan 执行交互

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "node:net";
import automator from "miniprogram-automator";

export const DEFAULT_AUTO_PORT = 9420;
export const DEFAULT_LAUNCH_TIMEOUT = 60_000;
export const DEFAULT_INTERACTION_TIMEOUT = 10_000;

// macOS 默认 CLI 路径
export const DEFAULT_CLI_PATH_MAC = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
// Windows 默认 CLI 路径
export const DEFAULT_CLI_PATH_WIN = "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat";

const PROBE_COLLECTOR_PREFIX = "__ai_mode_probe_results__";

export function isPortInUse(port) {
  return new Promise((resolve) => {
    const client = createConnection(port, "127.0.0.1", () => { client.destroy(); resolve(true); });
    client.on("error", () => { client.destroy(); resolve(false); });
    client.setTimeout(2000, () => { client.destroy(); resolve(false); });
  });
}

export function detectDefaultCliPath() {
  const envCliPath = process.env.WX_CLI_PATH;
  if (envCliPath && existsSync(envCliPath)) return envCliPath;

  const defaultPath = process.platform === "darwin" ? DEFAULT_CLI_PATH_MAC
    : process.platform === "win32" ? DEFAULT_CLI_PATH_WIN
    : null;

  if (defaultPath && existsSync(defaultPath)) return defaultPath;
  return null;
}

export function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const nextArg = argv[i + 1];
    if (!nextArg || nextArg.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = nextArg;
      i++;
    }
  }
  return result;
}

async function injectRequestCapture(miniProgram, collectorKey) {
  await miniProgram.evaluate((key) => {
    var global = window;
    global[key] = [];
    var originalRequest = wx.request;

    wx.request = function (options) {
      // 记录请求信息（仅用于观察，不影响真实请求参数）
      var requestInfo = {
        url: options.url,
        method: options.method || "GET",
        data: options.data,
        header: options.header,
      };
      var origSuccess = options.success;
      var origFail = options.fail;
      options.success = function (response) {
        try {
          global[key].push({
            request: requestInfo,
            response: { statusCode: response.statusCode, header: response.header, data: response.data },
          });
        } catch (e) {}
        if (origSuccess) origSuccess(response);
      };
      options.fail = function (error) {
        try {
          global[key].push({
            request: requestInfo,
            response: { error: error && error.errMsg },
          });
        } catch (e) {}
        if (origFail) origFail(error);
      };
      return originalRequest(options);
    };
  }, collectorKey);
}

async function readCapturedRequests(miniProgram, collectorKey) {
  const json = await miniProgram.evaluate((key) => {
    var results = window[key] || [];
    window[key] = [];
    return JSON.stringify(results);
  }, collectorKey);
  return json ? JSON.parse(json) : [];
}

async function executeStep(miniProgram, page, step) {
  switch (step.kind) {
    case "tap":
    case "longpress": {
      const element = await page.$(step.selector);
      if (!element) throw new Error(`未找到元素：${step.selector}`);
      await element[step.kind]();
      break;
    }
    case "input": {
      const element = await page.$(step.selector);
      if (!element) throw new Error(`未找到元素：${step.selector}`);
      await element.input(step.value);
      break;
    }
    case "callMethod":
      await page.callMethod(step.method, ...(step.args || []));
      break;
    case "request":
      await miniProgram.evaluate((opts) => { wx.request(opts); }, step.options || {});
      break;
    case "evaluate":
      await miniProgram.evaluate(new Function(step.code));
      break;
    case "wait":
      await delay(step.ms || 500);
      break;
    default:
      throw new Error(`未知 trigger.kind=${step.kind}`);
  }
}

async function navigateToPage(miniProgram, pagePath) {
  try { return await miniProgram.reLaunch(pagePath); }
  catch { return await miniProgram.navigateTo(pagePath); }
}

async function probeOneApi({ miniProgram, planItem, interactionTimeoutMs }) {
  const result = {
    api_name: planItem.api_name,
    target_page: planItem.target_page,
    status: "pending",
    request: null,
    response: null,
    requests: null, // 多请求链路（matchUrlIncludes 为数组时）的有序结果
    duration_ms: 0,
    error: null,
  };
  const startTime = Date.now();
  const collectorKey = `${PROBE_COLLECTOR_PREFIX}${startTime}`;

  try {
    await injectRequestCapture(miniProgram, collectorKey);

    // 执行前置步骤（如登录）
    if (planItem.preSteps?.length) {
      console.log(`[probe] ${planItem.api_name}: ${planItem.preSteps.length} 个前置步骤`);
      const preStepPage = await navigateToPage(miniProgram, planItem.preSteps[0].target_page || planItem.target_page);
      await delay(1000);
      for (const preStep of planItem.preSteps) {
        if (preStep.trigger) {
          for (const triggerStep of preStep.trigger) {
            await executeStep(miniProgram, preStepPage, triggerStep);
            if (triggerStep.delayAfterMs) await delay(triggerStep.delayAfterMs);
          }
        }
        if (preStep.waitMs) await delay(preStep.waitMs);
      }
      // 清空前置步骤产生的请求记录
      await readCapturedRequests(miniProgram, collectorKey);
    }

    // 导航到目标页面+ 执行触发操作
    // trigger 可为空：纯靠进页面自动发请求
    const targetPage = await navigateToPage(miniProgram, planItem.target_page);
    await delay(800);
    for (const triggerStep of planItem.trigger || []) {
      await executeStep(miniProgram, targetPage, triggerStep);
      if (triggerStep.delayAfterMs) await delay(triggerStep.delayAfterMs);
    }

    // 匹配关键词：支持单个（string）或多个有序（array，对应「一个能力 = 多请求」）
    const patterns = Array.isArray(planItem.matchUrlIncludes)
      ? planItem.matchUrlIncludes
      : planItem.matchUrlIncludes ? [planItem.matchUrlIncludes] : [];
    const isMulti = Array.isArray(planItem.matchUrlIncludes);

    // 轮询收集全部捕获请求（不再命中一条就停，确保多请求链路抓全）
    const deadline = Date.now() + (planItem.captureWaitMs || interactionTimeoutMs);
    const captured = [];
    const allHit = () => patterns.length > 0 && patterns.every((p) => captured.some((c) => c.request?.url?.includes(p)));
    while (Date.now() < deadline) {
      await delay(500);
      const batch = await readCapturedRequests(miniProgram, collectorKey);
      if (batch.length) captured.push(...batch);
      if (patterns.length ? allHit() : captured.length) break;
    }

    // 处理探测结果
    if (!captured.length) {
      result.status = "no_request";
      result.error = "未捕获到 wx.request 调用";
    } else if (!patterns.length) {
      result.status = "ok";
      result.request = captured[0].request;
      result.response = captured[0].response;
      if (captured.length > 1) result.extras = captured.slice(1).map((c) => ({ request: c.request, response: c.response }));
    } else {
      const matched = patterns.map((p) => {
        const hit = captured.find((c) => c.request?.url?.includes(p));
        return { matchUrlIncludes: p, request: hit?.request || null, response: hit?.response || null, matched: !!hit };
      });
      const hitCount = matched.filter((m) => m.matched).length;
      if (hitCount === 0) {
        result.status = "url_unmatched";
        result.error = `${captured.length} 条请求均不匹配 ${JSON.stringify(patterns)}`;
        result.request = captured.map((c) => c.request);
      } else {
        result.status = hitCount === patterns.length ? "ok" : "partial";
        if (isMulti) {
          result.requests = matched;
        } else {
          result.request = matched[0].request;
          result.response = matched[0].response;
        }
        if (hitCount < patterns.length) result.error = `部分命中：${hitCount}/${patterns.length}`;
        const usedUrls = new Set(matched.filter((m) => m.matched).map((m) => m.request?.url));
        const others = captured.filter((c) => !usedUrls.has(c.request?.url));
        if (others.length) result.extras = others.map((c) => ({ request: c.request, response: c.response }));
      }
    }
  } catch (error) {
    result.status = "error";
    result.error = error?.stack || error?.message || String(error);
  } finally {
    result.duration_ms = Date.now() - startTime;
  }
  return result;
}

export async function runProbePlan({
  projectPath,
  plan,
  autoPort = DEFAULT_AUTO_PORT,
  cliPath,
  launchTimeoutMs = DEFAULT_LAUNCH_TIMEOUT,
  interactionTimeoutMs = DEFAULT_INTERACTION_TIMEOUT,
  outputPath,
  mode = "launch",
  wsEndpoint,
}) {
  if (cliPath && !existsSync(cliPath)) throw new Error(`cliPath 不存在：${cliPath}`);
  if (!existsSync(projectPath)) throw new Error(`projectPath 不存在：${projectPath}`);

  let effectiveMode = mode;
  let effectiveWsEndpoint = wsEndpoint;
  if (mode === "launch" && await isPortInUse(autoPort)) {
    console.log(`[probe] 端口 ${autoPort} 已占用，尝试 connect 模式`);
    effectiveMode = "connect";
    effectiveWsEndpoint = `ws://127.0.0.1:${autoPort}`;
  }

  let miniProgram;
  const results = [];
  try {
    if (effectiveMode === "connect") {
      const endpoint = effectiveWsEndpoint || `ws://127.0.0.1:${autoPort}`;
      console.log(`[probe] 连接 ${endpoint} ...`);
      try {
        miniProgram = await automator.connect({ wsEndpoint: endpoint });
        console.log("[probe] 调用 currentPage 验证 App 层...");
        await miniProgram.currentPage();
        console.log("[probe] App 层就绪");
      } catch (verifyErr) {
        throw new Error(
          `connect ${endpoint} 后协议验证失败：${verifyErr.message}。\n`
        );
      }
    } else {
      console.log(`[probe] Launch 端口 ${autoPort} ...`);
      miniProgram = await automator.launch({ cliPath, projectPath, port: autoPort, timeout: launchTimeoutMs });
    }
    console.log("[probe] 已就绪");

    for (const planItem of plan) {
      console.log(`[probe] 探测: ${planItem.api_name} → ${planItem.target_page}`);
      const probeResult = await probeOneApi({ miniProgram, planItem, interactionTimeoutMs });
      results.push(probeResult);
      console.log(`[probe]   ${probeResult.status}${probeResult.error ? ` (${probeResult.error})` : ""}`);
    }
  } finally {
    if (miniProgram && effectiveMode !== "connect") {
      try { await miniProgram.close(); } catch {}
    }
  }

  const payload = {
    runId: new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13),
    project: projectPath,
    autoPort,
    mode: effectiveMode,
    results,
  };

  // 每次 probe.mjs 执行落盘一个文件；未指定 --output 时用 runId 作文件名（多轮重试会积累多个）
  const absolutePath = outputPath
    ? resolve(outputPath)
    : resolve(projectPath, ".ai-mode-skills/probe", `${payload.runId}.json`);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(payload, null, 2), "utf8");
  payload.outputPath = absolutePath;
  console.log(`[probe] 结果已写入 ${absolutePath}`);
  return payload;
}

export function summarize(payload) {
  const total = payload.results.length;
  const okCount = payload.results.filter((result) => result.status === "ok").length;
  const failures = payload.results.filter((result) => result.status !== "ok");
  return { total, ok: okCount, failed: failures.length, failures };
}
