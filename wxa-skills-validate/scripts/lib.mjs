import { writeFile, mkdir, access, readFile, unlink } from "node:fs/promises";
import { resolve, dirname, join, basename } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as FS } from "node:fs";
import { tmpdir } from "node:os";

const isWin = process.platform === "win32";

export const DEFAULT_CLI_PATH = isWin
  ? "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat"
  : "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
export const DEFAULT_AUTO_PORT = 9420;
export const DEFAULT_TIMEOUT_MS = 45000;

export function runCli(cliPath, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((res, rej) => {
    const stdoutFile = join(tmpdir(), `wxa-cli-stdout-${randomUUID()}.log`);
    const stderrFile = join(tmpdir(), `wxa-cli-stderr-${randomUUID()}.log`);
    const shellCmd = [
      shellQuote(cliPath),
      ...args.map(shellQuote),
      `>${shellQuote(stdoutFile)}`,
      `2>${shellQuote(stderrFile)}`,
    ].join(" ");

    let proc;
    try {
      proc = spawn("/bin/sh", ["-c", shellCmd], { stdio: ["ignore", "ignore", "ignore"] });
    } catch (err) {
      rej(new Error(`启动 CLI 失败: ${err.message}`));
      return;
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill("SIGTERM"); } catch {}
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      rej(new Error(`启动 CLI 失败: ${err.message}（cliPath=${cliPath}）`));
    });

    proc.on("close", async (code) => {
      clearTimeout(timer);
      let stdout = "", stderr = "";
      try { stdout = await readFile(stdoutFile, "utf-8"); } catch {}
      try { stderr = await readFile(stderrFile, "utf-8"); } catch {}
      unlink(stdoutFile).catch(() => {});
      unlink(stderrFile).catch(() => {});

      let parsed = null;
      const trimmed = stdout.trim();
      if (trimmed) {
        const jsonBody = extractJsonBody(trimmed);
        if (jsonBody) { try { parsed = JSON.parse(jsonBody); } catch {} }
      }
      res({ code, stdout, stderr, parsed, timedOut });
    });
  });
}

function shellQuote(s) {
  if (s === undefined || s === null) return "''";
  const str = String(s);
  if (str === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(str)) return str;
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

export async function checkCliAvailable(cliPath = DEFAULT_CLI_PATH) {
  try { await access(cliPath, FS.X_OK); } catch { return false; }
  const { code, timedOut } = await runCli(cliPath, ["-h"], 5000);
  return !timedOut && code === 0;
}

export async function startAutoService({
  project,
  autoPort = DEFAULT_AUTO_PORT,
  cliPath = DEFAULT_CLI_PATH,
  timeout = 60000,
  autoAccount,
  testTicket,
  ticket,
} = {}) {
  if (!project) throw new Error("缺少必需参数: project");
  const args = ["auto", "--project", resolve(project), "--auto-port", String(autoPort), "--trust-project"];
  if (autoAccount) args.push("--auto-account", autoAccount);
  if (testTicket) args.push("--test-ticket", testTicket);
  if (ticket) args.push("--ticket", ticket);
  return runCli(cliPath, args, timeout);
}

export async function callAgentTool({
  project, name, args,
  autoPort = DEFAULT_AUTO_PORT, cliPath = DEFAULT_CLI_PATH,
  skill,
  timeout = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!project) throw new Error("缺少必需参数: project");
  if (!name) throw new Error("缺少必需参数: name");

  const cliArgs = [
    "agent", "tool",
    "--project", resolve(project),
    "--name", name,
    "--auto-port", String(autoPort),
    "--trust-project",
  ];
  if (args !== undefined && args !== null && args !== "") {
    cliArgs.push("--args", typeof args === "string" ? args : JSON.stringify(args));
  }
  if (skill) cliArgs.push("--skill", skill);
  if (timeout && timeout !== DEFAULT_TIMEOUT_MS) cliArgs.push("--timeout", String(timeout));

  return runCli(cliPath, cliArgs, timeout + 5000);
}

export async function callAgentRender({
  project,
  name,
  args,
  cliPath = DEFAULT_CLI_PATH,
  output,
  timeout = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!project) throw new Error("缺少必需参数: project");
  if (!name) throw new Error("缺少必需参数: name");

  const hasFinalOutput = !!output;
  const cliOutput = hasFinalOutput
    ? resolve(output)
    : join(tmpdir(), `wxa-cli-render-${randomUUID()}.json`);

  const cliArgs = [
    "agent", "render",
    "--project", resolve(project),
    "--name", name,
    "--output", cliOutput,
    "--trust-project",
  ];
  if (args !== undefined && args !== null && args !== "") {
    cliArgs.push("--args", typeof args === "string" ? args : JSON.stringify(args));
  }
  if (timeout && timeout !== DEFAULT_TIMEOUT_MS) cliArgs.push("--timeout", String(timeout));

  const raw = await runCli(cliPath, cliArgs, timeout + 10000);

  let outputJson = null;
  try {
    const text = await readFile(cliOutput, "utf-8");
    outputJson = JSON.parse(text);
  } catch {}

  const snapshotPngAbs = cliOutput.replace(/\.json$/i, "") + ".snapshot.png";

  if (outputJson) {
    const extracted = extractSnapshotDataUrl(outputJson);
    if (extracted) {
      try {
        await writeFile(snapshotPngAbs, extracted.buffer);
        const summary = {
          mime: extracted.mime,
          file: basename(snapshotPngAbs),
          absolutePath: snapshotPngAbs,
          dataUrlLength: extracted.dataUrlLength,
        };
        replaceSnapshotWithSummary(outputJson, summary);
      } catch {}
    }

    if (hasFinalOutput) {
      try {
        await writeFile(cliOutput, JSON.stringify(outputJson, null, 2), "utf-8");
      } catch {}
    }
  }

  return {
    ...raw,
    parsed: outputJson || raw.parsed,
    outputFile: cliOutput,
    outputFileKept: hasFinalOutput,
    snapshotPngPath: snapshotPngAbs,
  };
}

function extractSnapshotDataUrl(json) {
  if (!json) return null;
  const candidates = [];
  if (typeof json.snapshotBase64 === "string") candidates.push(json.snapshotBase64);
  if (json.snapshot && typeof json.snapshot.dataUrl === "string") candidates.push(json.snapshot.dataUrl);
  for (const url of candidates) {
    const m = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m) continue;
    try {
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > 0) return { buffer, mime: m[1], dataUrlLength: url.length };
    } catch {}
  }
  return null;
}

function replaceSnapshotWithSummary(json, summary) {
  if (Object.prototype.hasOwnProperty.call(json, "snapshotBase64")) {
    delete json.snapshotBase64;
  }
  json.snapshot = { ...summary };
}

export function normalizeCliResult({ code, stdout, stderr, parsed, timedOut }) {
  const diag = _diagnoseAppIdPermission(stdout, stderr, parsed);

  if (timedOut) {
    return { ok: false, result: null, error: "CLI 命令超时", diag };
  }
  if (!parsed) {
    return {
      ok: false, result: null,
      error: `CLI 输出非 JSON（code=${code}）\nstdout: ${stdout.slice(0, 1000)}\nstderr: ${stderr.slice(0, 1000)}`,
      diag,
    };
  }
  const statusOk = parsed.status === "ok";
  return {
    ok: code === 0 && statusOk,
    result: parsed,
    error: statusOk ? null : (parsed.error?.message || parsed.message || `status=${parsed.status}`),
    diag,
  };
}

function _diagnoseAppIdPermission(stdout, stderr, parsed) {
  const content = parsed?.invokeResult?.content;
  if (Array.isArray(content) && content.some(c => c.type === "text" && /agent compile mode is disabled/i.test(c.text || ""))) {
    const appid = parsed?.params?.appId || parsed?.params?.hostAppId || null;
    return { type: "miniprogram_not_runnable", appid, hint: _compileModeHint(appid) };
  }
  if (/timeout waiting for auto websocket/i.test(stdout)
    && /Fetching AppID/i.test(stderr)
    && /detailed information/i.test(stderr)
    && /✖/.test(stderr)) {
    const m = stderr.match(/Fetching AppID\s*\(([^)]+)\)/);
    const appid = m ? m[1] : null;
    return { type: "agent_env_unreachable", appid, hint: _envHint(appid) };
  }
  return null;
}

function _compileModeHint(appid) {
  return [
    `CLI 返回 agent compile mode is disabled，表示小程序主包/分包未能正常编译运行——agent 能力要在小程序能正常跑起来时才会自动就绪（cli preview 能打包不代表运行时不白屏）。请按此排查：`,
    `1. 在开发者工具打开项目，确认能正常运行、无白屏，控制台无 app.js/hack.js 运行时报错（如 "Cannot set properties of undefined"、appServiceSDKScriptError）。`,
    `2. regeneratorRuntime 类报错通常源于 project.config.json 的 es6/enhance 编译设置与线上不一致，按能正常运行的配置对齐。`,
    `3. appid missing / cloud init error 说明 project.config.json 缺 appid 或云开发未初始化，补齐后重试。`,
    `4. 确认 app.json 的 agent.skills、subPackages 配置正确，skill 目录含 mcp.json。`,
    `5. 首次打开可能尚未就绪，重开一次项目预热后再重试。`,
  ].join("\n");
}

function _envHint(appid) {
  const id = appid ? ` (${appid})` : "";
  return [
    `自动化通道连接超时、AppID${id} 详情拉取失败。该现象有多种可能，不能直接断定为无权限，请按可能性逐一排查：`,
    `1. 开发者工具 / 基础库的 agent 运行时异常或版本过旧 —— 先把基础库切到线上版本、用 --debug 重试。`,
    `2. 自动化通道未连上或端口不一致 —— 确认「设置→安全设置→服务端口」已开启，必要时显式指定 --auto-port。`,
    `3. 开发者工具未登录，或登录账号不是该 AppID 的项目成员 —— 重新登录并确认账号有该 AppID 权限。`,
    `4. 网络无法访问微信后台，AppID 详情接口失败 —— 检查代理 / VPN / 防火墙。`,
    `5. 以上都正常后仍失败，考虑 AppID 确实未开通 AI 开发模式权限。`,
  ].join("\n");
}

export function genId(prefix = "tc") {
  return `${prefix}_${randomUUID()}`;
}

export function extractJsonBody(text) {
  if (!text) return null;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{" || c === "[") { start = i; break; }
  }
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

export async function writeJson(outputPath, data) {
  const out = resolve(outputPath);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(data, null, 2), "utf-8");
  return out;
}

export function parseArgs(argv, spec, positional = []) {
  const out = {};
  const posQueue = [...positional];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const type = spec[key];
      if (type === undefined) continue;
      if (type === "boolean") {
        out[key] = true;
      } else {
        const v = argv[++i];
        if (v === undefined) continue;
        out[key] = type === "number" ? Number(v) : v;
      }
    } else {
      const key = posQueue.shift();
      if (key) out[key] = a;
    }
  }
  return out;
}
