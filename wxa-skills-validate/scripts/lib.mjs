import { writeFile, mkdir, access, readFile, unlink } from "node:fs/promises";
import { resolve, dirname, join, basename } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as FS, openSync, closeSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";

export const DEFAULT_CLI_PATH = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
export const DEFAULT_AUTO_PORT = 9420;
export const DEFAULT_TIMEOUT_MS = 45000;

// Windows 下微信开发者工具 CLI 候选路径（cli.bat 所在目录）
export const WIN_CLI_CANDIDATES = [
  "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat",
  "C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat",
  "D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat",
  "D:\\微信web开发者工具\\cli.bat",
];

// 按平台解析默认 CLI 路径：环境变量优先；Windows 走 WIN_CLI_CANDIDATES；其它平台保持 macOS 默认。
export function resolveDefaultCliPath() {
  const fromEnv = process.env.WECHAT_DEVTOOLS_CLI || process.env.WXA_CLI;
  if (fromEnv) return fromEnv;
  if (process.platform === "win32") {
    return WIN_CLI_CANDIDATES.find((p) => existsSync(p)) || DEFAULT_CLI_PATH;
  }
  return DEFAULT_CLI_PATH;
}

// Windows：把 cli.bat 解析为「不经 shell 的直接调用」，等价 cli.bat 但用 spawn(argv) 传参。
// 必须绕开 shell：cmd.exe 经 %* 转发时会吞掉 JSON 里的双引号（--args 的 JSON 会变成非法 JSON）。
// - 新版 Electron 布局：主程序 exe 以 node 模式跑 bootstrap + resources/app.asar.unpacked/.../cli/index.js。
// - 旧版 nwjs 布局：node.exe 跑 cli.js（旧 bootstrap 自行定位 code/package.nw）。
// bootstrap 串镜像 cli.bat（厂商若改了 cli.bat 这里需同步）。
const WIN_ELECTRON_BOOTSTRAP = "const e=process.argv[1],a=process.argv.slice(2).filter(function(x){return x!=='--electron'});process.env.cwd=process.cwd();process.argv=[process.execPath,'--ms-enable-electron-run-as-node',e,'--electron'].concat(a);require(e)";
const WIN_EXE_BLACKLIST = new Set(["node.exe", "node-18.exe", "wxfilewatcher.exe", "wxfilewatcher_x64.exe", "notification_helper.exe", "wechatdevtools.exe"]);

function findWinElectronExe(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return null; }
  let best = null;
  for (const name of entries) {
    if (!/\.exe$/i.test(name)) continue;
    if (WIN_EXE_BLACKLIST.has(name.toLowerCase())) continue;
    let st;
    try { st = statSync(join(dir, name)); } catch { continue; }
    if (!st.isFile() || st.size <= 50000000) continue; // 镜像 cli.bat 的 >50MB 判定
    if (!best || st.size > best.size) best = { path: join(dir, name), size: st.size };
  }
  return best ? best.path : null;
}

function resolveWinCliTarget(cliPath) {
  const dir = dirname(cliPath);
  // 新版 Electron 布局
  const electronCli = join(dir, "resources", "app.asar.unpacked", "js", "common", "cli", "index.js");
  if (existsSync(electronCli)) {
    const exe = findWinElectronExe(dir);
    if (exe) {
      return { cmd: exe, prepend: ["-e", WIN_ELECTRON_BOOTSTRAP, electronCli], env: { ELECTRON_RUN_AS_NODE: "1" } };
    }
  }
  // 旧版 nwjs 布局
  const nodeExe = join(dir, "node.exe");
  const oldBootstrap = join(dir, "cli.js");
  if (existsSync(nodeExe) && existsSync(oldBootstrap)) {
    return { cmd: nodeExe, prepend: [oldBootstrap], env: {} };
  }
  return null;
}

export function runCli(cliPath, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((res, rej) => {
    const stdoutFile = join(tmpdir(), `wxa-cli-stdout-${randomUUID()}.log`);
    const stderrFile = join(tmpdir(), `wxa-cli-stderr-${randomUUID()}.log`);
    const isWin = process.platform === "win32";

    let proc;
    let outFd = null, errFd = null;
    const closeFds = () => {
      try { if (outFd != null) { closeSync(outFd); outFd = null; } } catch {}
      try { if (errFd != null) { closeSync(errFd); errFd = null; } } catch {}
    };

    try {
      if (isWin) {
        // Windows：优先不经 shell 直接 spawn（等价 cli.bat），用 stdio fd 重定向。
        // 绕开 /bin/sh（Windows 无）且避免 cmd.exe 经 %* 吞掉 JSON 引号。
        outFd = openSync(stdoutFile, "w");
        errFd = openSync(stderrFile, "w");
        const target = resolveWinCliTarget(cliPath);
        if (target) {
          proc = spawn(target.cmd, [...target.prepend, ...args], {
            cwd: dirname(cliPath), // 对齐 cli.bat 的 `cd /d %~dp0`：agent 工具会用 ./微信开发者工具.exe 相对路径拉起 IDE，必须以安装目录为 cwd
            env: { ...process.env, ...target.env },
            stdio: ["ignore", outFd, errFd],
            windowsHide: true,
          });
        } else {
          // 回退：直接跑 cli.bat，需 shell（仅用于无法识别布局时；JSON --args 可能被吞引号）
          proc = spawn(cliPath, args, {
            stdio: ["ignore", outFd, errFd],
            shell: true,
            windowsVerbatimArguments: false,
            windowsHide: true,
          });
        }
      } else {
        // POSIX（不变）：/bin/sh -c + 重定向
        const shellCmd = [
          shellQuote(cliPath),
          ...args.map(shellQuote),
          `>${shellQuote(stdoutFile)}`,
          `2>${shellQuote(stderrFile)}`,
        ].join(" ");
        proc = spawn("/bin/sh", ["-c", shellCmd], { stdio: ["ignore", "ignore", "ignore"] });
      }
    } catch (err) {
      closeFds();
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
      closeFds();
      rej(new Error(`启动 CLI 失败: ${err.message}（cliPath=${cliPath}）`));
    });

    proc.on("close", async (code) => {
      clearTimeout(timer);
      closeFds(); // 关闭父侧 fd，确保子进程输出全部落盘后再读
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

export async function checkCliAvailable(cliPath = resolveDefaultCliPath()) {
  // Windows 无可执行位概念，统一用存在性（F_OK）判定
  try { await access(cliPath, process.platform === "win32" ? FS.F_OK : FS.X_OK); } catch { return false; }
  const { code, timedOut } = await runCli(cliPath, ["-h"], 5000);
  return !timedOut && code === 0;
}

export async function startAutoService({
  project,
  autoPort = DEFAULT_AUTO_PORT,
  cliPath = resolveDefaultCliPath(),
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
  autoPort = DEFAULT_AUTO_PORT, cliPath = resolveDefaultCliPath(),
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
  cliPath = resolveDefaultCliPath(),
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
  if (/timeout waiting for auto websocket/i.test(stdout)
    && /Fetching AppID/i.test(stderr)
    && /detailed information/i.test(stderr)
    && /✖/.test(stderr)) {
    const m = stderr.match(/Fetching AppID\s*\(([^)]+)\)/);
    const appid = m ? m[1] : null;
    return { type: "appid_no_agent_permission", appid, hint: _appidHint(appid) };
  }
  const content = parsed?.invokeResult?.content;
  if (Array.isArray(content) && content.some(c => c.type === "text" && /agent compile mode is disabled/i.test(c.text || ""))) {
    const appid = parsed?.params?.appId || parsed?.params?.hostAppId || null;
    return { type: "appid_no_agent_permission", appid, hint: _appidHint(appid) };
  }
  return null;
}

function _appidHint(appid) {
  const id = appid ? ` (${appid})` : "";
  return `当前 AppID${id} 可能没有使用小程序 AI 的开发模式权限。若已有权限可直接重试；若需更换 AppID，修改 project.config.json 的 appid 后重跑即可，无需手动重启开发者工具。`;
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
