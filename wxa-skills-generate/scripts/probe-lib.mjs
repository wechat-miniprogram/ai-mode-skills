// Automator 探针核心库：封装启动、注入捕获器、按 plan 执行交互
// 仅供 scripts/probe.mjs 调用，不直接对外暴露
//
// 捕获策略：使用 miniProgram.evaluate 在小程序运行时内覆写 wx.request，
// 在 success/fail 回调中同时记录请求参数与响应数据，通过 evaluate 读取结果。
// （mockWxMethod 的 this.origin 对 wx.request 等异步 API 的 success/fail 回调
//   无法触发，因此改用 evaluate 方案。）
//
// 使用方式与触发条件见 references/RUNTIME_PROBE.md

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "node:net";
import { execSync } from "node:child_process";

export const DEFAULT_AUTO_PORT = 9420;
export const DEFAULT_CLI_PATH_DARWIN = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
export const DEFAULT_CLI_PATH_WIN = "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat";
export const DEFAULT_LAUNCH_TIMEOUT = 60_000;
export const DEFAULT_INTERACTION_TIMEOUT = 10_000;

// 全局收集器名称（小程序端 window 上的 key）
const PROBE_COLLECTOR = "__ai_mode_probe_results__";

// ─── 端口检测 ───────────────────────────────────────────

/**
 * 检测端口是否已被占用（即开发者工具是否已在 auto 模式运行）
 * @param {number} port
 * @returns {Promise<boolean>} true = 端口已被占用
 */
export function isPortInUse(port) {
  return new Promise((resolve) => {
    const client = createConnection(port, "127.0.0.1", () => {
      client.destroy();
      resolve(true);
    });
    client.on("error", () => {
      client.destroy();
      resolve(false);
    });
    client.setTimeout(2000, () => {
      client.destroy();
      resolve(false);
    });
  });
}

// ─── CLI 路径检测 ────────────────────────────────────────

/**
 * 按优先级检测微信开发者工具 CLI 路径
 * 支持：默认路径 → 用户目录 → mdfind(macOS) → 环境变量
 */
export function detectDefaultCliPath() {
  // 1. 环境变量
  const envPath = process.env.WX_CLI_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  // 2. 常见路径列表
  const candidates = process.platform === "darwin"
    ? [
        DEFAULT_CLI_PATH_DARWIN,
        `${process.env.HOME}/Applications/wechatwebdevtools.app/Contents/MacOS/cli`,
        "/opt/homebrew/Caskroom/wechatwebdevtools/latest/wechatwebdevtools.app/Contents/MacOS/cli",
      ]
    : process.platform === "win32"
      ? [
          DEFAULT_CLI_PATH_WIN,
          "D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat",
          "E:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat",
        ]
      : [];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // 3. macOS: 用 mdfind 搜索
  if (process.platform === "darwin") {
    try {
      const found = execSync(
        "mdfind -name 'wechatwebdevtools' -onlyin / 2>/dev/null | grep -E 'cli$' | head -1",
        { encoding: "utf8", timeout: 5000 },
      ).trim();
      if (found && existsSync(found)) return found;
    } catch {}
  }

  return null;
}

// ─── 参数解析 ────────────────────────────────────────────

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

// ─── automator 加载 ──────────────────────────────────────

async function loadAutomator() {
  try {
    const mod = await import("miniprogram-automator");
    return mod.default || mod;
  } catch (err) {
    throw new Error(
      "无法加载 miniprogram-automator。请在当前 skill 目录执行：\n" +
      "  npm i -D miniprogram-automator\n" +
      "或在工作区根目录安装后通过 NODE_PATH 指向。\n" +
      `底层错误：${err.message}`,
    );
  }
}

// ─── 前置校验 ────────────────────────────────────────────

export async function ensureCliPort({ autoPort, cliPath, projectPath }) {
  if (!cliPath) throw new Error("未提供 cliPath，且未在默认路径检测到微信开发者工具 CLI。");
  if (!existsSync(cliPath)) throw new Error(`cliPath 不存在：${cliPath}`);
  if (!existsSync(projectPath)) throw new Error(`projectPath 不存在：${projectPath}`);
}

// ─── 交互步骤执行 ────────────────────────────────────────

async function runOneStep(page, step) {
  if (step.kind === "tap") {
    const el = await page.$(step.selector);
    if (!el) throw new Error(`未找到元素：${step.selector}`);
    await el.tap();
  } else if (step.kind === "longpress") {
    const el = await page.$(step.selector);
    if (!el) throw new Error(`未找到元素：${step.selector}`);
    await el.longpress();
  } else if (step.kind === "input") {
    const el = await page.$(step.selector);
    if (!el) throw new Error(`未找到元素：${step.selector}`);
    await el.input(step.value);
  } else if (step.kind === "callMethod") {
    await page.callMethod(step.method, ...(step.args || []));
  } else if (step.kind === "wait") {
    await delay(step.ms || 500);
  } else {
    throw new Error(`未知 trigger.kind=${step.kind}`);
  }
}

// ─── evaluate 注入：覆写 wx.request ─────────────────────

/**
 * 通过 evaluate 在小程序运行时内覆写 wx.request，
 * 在 success/fail 回调中记录请求参数 + 响应数据到全局变量。
 * 原始请求仍然正常发出，业务行为不受影响。
 *
 * @param {object} mp - miniProgram 实例
 * @param {string} collectorKey - 全局收集器变量名
 */
async function injectRequestCapture(mp, collectorKey) {
  await mp.evaluate((key) => {
    // eslint-disable-next-line no-undef
    var global = window;
    global[key] = [];

    // 保存原始 wx.request
    var _origRequest = wx.request;

    // 覆写（不用 Object.defineProperty / spread 语法，避免序列化问题）
    wx.request = function (opts) {
      var reqInfo = {
        url: opts && opts.url,
        method: (opts && opts.method) || "GET",
        data: opts && opts.data,
        header: opts && opts.header,
      };

      return _origRequest({
        url: opts && opts.url,
        method: opts && opts.method,
        data: opts && opts.data,
        header: opts && opts.header,
        success: function (res) {
          global[key].push({
            request: reqInfo,
            response: {
              statusCode: res.statusCode,
              header: res.header,
              data: res.data,
            },
          });
          if (opts && opts.success) opts.success(res);
        },
        fail: function (err) {
          global[key].push({
            request: reqInfo,
            response: { error: err && err.errMsg },
          });
          if (opts && opts.fail) opts.fail(err);
        },
      });
    };
  }, collectorKey);
}

/**
 * 从全局变量中读取已捕获的请求/响应，并清空收集器
 *
 * @param {object} mp - miniProgram 实例
 * @param {string} collectorKey - 全局收集器变量名
 * @returns {Promise<Array>} 已捕获的记录
 */
async function readCaptured(mp, collectorKey) {
  const json = await mp.evaluate((key) => {
    // eslint-disable-next-line no-undef
    var results = window[key] || [];
    window[key] = [];
    return JSON.stringify(results);
  }, collectorKey);
  return json ? JSON.parse(json) : [];
}

/**
 * 恢复原始 wx.request（可选，清理用）
 *
 * @param {object} mp - miniProgram 实例
 */
async function restoreRequestCapture(mp) {
  await mp.evaluate(() => {
    // 当前无法完美恢复原始 wx.request（因为 _origRequest 在闭包内），
    // 但由于每次 probeOne 开头都会重新 injectRequestCapture，
    // 所以不需要恢复——下一个 reLaunch 会重新初始化页面上下文。
    // 如果需要恢复，可以在 inject 时把 _origRequest 存到全局。
  });
}

// ─── 单接口探测 ──────────────────────────────────────────

async function probeOne({ mp, item, interactionTimeoutMs }) {
  const result = {
    api_name: item.api_name,
    target_page: item.target_page,
    status: "pending",
    request: null,
    response: null,
    duration_ms: 0,
    error: null,
  };
  const startedAt = Date.now();
  const collectorKey = `${PROBE_COLLECTOR}${Date.now()}`;

  try {
    // 1. 注入请求捕获器
    await injectRequestCapture(mp, collectorKey);

    // 2. 执行 preSteps（登录等前置操作）
    if (item.preSteps && item.preSteps.length > 0) {
      console.log(`[ai-mode:probe] ${item.api_name}: 执行 ${item.preSteps.length} 个前置步骤`);
      let prePage;
      try {
        prePage = await mp.reLaunch(item.preSteps[0].target_page || item.target_page);
      } catch {
        prePage = await mp.navigateTo(item.preSteps[0].target_page || item.target_page);
      }
      await delay(1000);

      for (const step of item.preSteps) {
        if (step.target_page && step.target_page !== item.target_page) {
          // 如果前置步骤需要导航到不同页面
          // (已通过上面的 reLaunch 处理第一个)
        }
        if (step.trigger) {
          for (const s of step.trigger) {
            await runOneStep(prePage, s);
            if (s.delayAfterMs) await delay(s.delayAfterMs);
          }
        }
        if (step.waitMs) await delay(step.waitMs);
      }
      // 清空前置步骤产生的请求记录
      await readCaptured(mp, collectorKey);
    }

    // 3. 导航到目标页面
    let page;
    try {
      page = await mp.reLaunch(item.target_page);
    } catch (err) {
      page = await mp.navigateTo(item.target_page);
    }
    await delay(800);

    // 4. 执行触发操作
    for (const step of item.trigger || []) {
      await runOneStep(page, step);
      if (step.delayAfterMs) await delay(step.delayAfterMs);
    }

    // 5. 等待请求完成，轮询收集器
    const waitMs = item.captureWaitMs || interactionTimeoutMs;
    const deadline = Date.now() + waitMs;
    let captured = [];

    while (Date.now() < deadline) {
      await delay(500);
      captured = await readCaptured(mp, collectorKey);
      if (captured.length > 0) break;
    }

    // 6. 处理结果
    if (captured.length === 0) {
      result.status = "no_request";
      result.error = "等待窗口内未捕获到任何 wx.request 调用";
    } else {
      const matched = item.matchUrlIncludes
        ? captured.find((c) => c.request && c.request.url && c.request.url.includes(item.matchUrlIncludes))
        : captured[0];
      if (!matched) {
        result.status = "url_unmatched";
        result.error = `捕获到 ${captured.length} 条请求，但都不包含 '${item.matchUrlIncludes}'`;
        result.request = captured.map((c) => c.request);
      } else {
        result.status = "ok";
        result.request = matched.request;
        result.response = matched.response || null;
        // 如果还有其他匹配的请求，附加到 extras
        const others = captured.filter((c) => c !== matched);
        if (others.length > 0) {
          result.extras = others.map((c) => ({ request: c.request, response: c.response }));
        }
      }
    }
  } catch (err) {
    result.status = "error";
    result.error = err && (err.stack || err.message || String(err));
  } finally {
    result.duration_ms = Date.now() - startedAt;
  }

  return result;
}

// ─── 主流程 ──────────────────────────────────────────────

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
  await ensureCliPort({ autoPort, cliPath, projectPath });
  const automator = await loadAutomator();

  // 自动检测：如果 mode=launch 但端口已被占用，自动切换为 connect
  let effectiveMode = mode;
  let effectiveWsEndpoint = wsEndpoint;
  if (mode === "launch") {
    const portBusy = await isPortInUse(autoPort);
    if (portBusy) {
      console.log(`[ai-mode:probe] 端口 ${autoPort} 已被占用，自动切换为 connect 模式`);
      effectiveMode = "connect";
      effectiveWsEndpoint = `ws://127.0.0.1:${autoPort}`;
    }
  }

  const results = [];
  let mp;
  try {
    if (effectiveMode === "connect") {
      const endpoint = effectiveWsEndpoint || `ws://127.0.0.1:${autoPort}`;
      console.log(`[ai-mode:probe] 连接 ${endpoint} ...`);
      mp = await automator.connect({ wsEndpoint: endpoint });
      console.log("[ai-mode:probe] 连接成功");
    } else {
      console.log(`[ai-mode:probe] Launch 模式启动，端口 ${autoPort} ...`);
      mp = await automator.launch({
        cliPath,
        projectPath,
        port: autoPort,
        timeout: launchTimeoutMs,
      });
      console.log("[ai-mode:probe] Launch 成功");
    }

    for (const item of plan) {
      console.log(`[ai-mode:probe] 探测: ${item.api_name} (${item.target_page})`);
      // eslint-disable-next-line no-await-in-loop
      const r = await probeOne({ mp, item, interactionTimeoutMs });
      results.push(r);
      console.log(`[ai-mode:probe]   → ${r.status}${r.error ? ` (${r.error})` : ""}`);
    }
  } finally {
    if (mp && effectiveMode !== "connect") {
      try { await mp.close(); } catch {}
    }
  }

  const payload = {
    runId: new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13),
    project: projectPath,
    autoPort,
    mode: effectiveMode,
    requestedMode: mode,
    results,
  };

  if (outputPath) {
    const abs = resolve(outputPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, JSON.stringify(payload, null, 2), "utf8");
  }

  return payload;
}

export function summarize(payload) {
  const total = payload.results.length;
  const ok = payload.results.filter((r) => r.status === "ok").length;
  const failed = payload.results.filter((r) => r.status !== "ok");
  return { total, ok, failed: failed.length, failures: failed };
}
