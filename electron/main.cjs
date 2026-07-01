const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

const PORT = 3579;
let win = null;
let server = null;

// ── パス解決 ──────────────────────────────────────
const IS_PACKAGED = app.isPackaged;

// アプリルート（.next / node_modules がある場所）
const APP_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

// .env.local の場所
const ENV_PATH = IS_PACKAGED
  ? path.join(path.dirname(process.execPath), ".env.local")
  : path.join(__dirname, "..", ".env.local");

// ── 環境変数 ──────────────────────────────────────
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.warn("[main] .env.local not found at", ENV_PATH);
    return;
  }
  const lines = fs.readFileSync(ENV_PATH, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
  console.log("[main] .env.local loaded from", ENV_PATH);
}

// ── Node.js 検索 ──────────────────────────────────
function findNode() {
  // 1) where コマンドで探す（Windows）
  try {
    const result = execSync("where node", { encoding: "utf8", timeout: 3000, windowsHide: true });
    const lines = result.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (fs.existsSync(line)) {
        console.log("[main] Found node via where:", line);
        return line;
      }
    }
  } catch {}

  // 2) 一般的なインストール先
  const candidates = [
    "C:\\Program Files\\nodejs\\node.exe",
    "C:\\Program Files (x86)\\nodejs\\node.exe",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs", "node.exe"),
    path.join(process.env.APPDATA || "", "..", "Local", "Programs", "node", "node.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log("[main] Found node at:", c);
      return c;
    }
  }

  // 3) 開発時は process.execPath（electron バイナリ）でも動く場合がある
  if (!IS_PACKAGED) {
    console.log("[main] Dev mode: using process.execPath as node fallback");
    return process.execPath;
  }

  return null;
}

// ── サーバー起動 ──────────────────────────────────
function startNextServer(nodePath) {
  const nextCli = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next");
  console.log("[main] spawn node:", nodePath);
  console.log("[main] next cli:", nextCli);
  console.log("[main] cwd:", APP_DIR);

  server = spawn(nodePath, [nextCli, "start", "-p", String(PORT)], {
    cwd: APP_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (d) => process.stdout.write("[next] " + d));
  server.stderr.on("data", (d) => process.stderr.write("[next] " + d));
  server.on("exit", (code, signal) =>
    console.log("[main] next exited code=" + code + " signal=" + signal)
  );
  server.on("error", (err) => console.error("[main] spawn error:", err));
}

// ── サーバー待機 ──────────────────────────────────
function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        res.resume();
        if (res.statusCode < 500) { resolve(); return; }
        retry();
      });
      req.on("error", retry);
      function retry() {
        if (++tries >= retries) { reject(new Error("Server did not start in time")); return; }
        setTimeout(check, 1000);
      }
    };
    setTimeout(check, 1500);
  });
}

// ── ウィンドウ作成 ────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 720,
    title: "YouTube → Notion サマリー",
    webPreferences: { contextIsolation: true },
  });
  win.loadURL(`http://localhost:${PORT}`);
  win.webContents.on("did-fail-load", (e, code, desc) =>
    console.error("[main] load failed:", code, desc)
  );
  win.on("closed", () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── 起動 ──────────────────────────────────────────
app.whenReady().then(async () => {
  console.log("[main] isPackaged:", IS_PACKAGED);
  console.log("[main] APP_DIR:", APP_DIR);

  loadEnv();

  const nodePath = findNode();
  if (!nodePath) {
    dialog.showErrorBox(
      "Node.js が見つかりません",
      "このアプリの実行には Node.js が必要です。\nhttps://nodejs.org からインストールしてください。"
    );
    app.quit();
    return;
  }

  startNextServer(nodePath);

  try {
    await waitForServer();
    console.log("[main] Server ready, opening window.");
    createWindow();
  } catch (e) {
    console.error("[main] Server failed:", e.message);
    dialog.showErrorBox("起動エラー", "サーバーの起動に失敗しました: " + e.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (server) { server.kill(); server = null; }
  app.quit();
});
