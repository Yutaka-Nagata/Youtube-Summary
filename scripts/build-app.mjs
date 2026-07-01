/**
 * electron-builder を使わず手動でポータブルアプリを組み立てる
 * 出力: dist-electron/app/ フォルダ（そのまま使える）
 */
import { cpSync, mkdirSync, copyFileSync, existsSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "dist-electron", "app");

// クリーン
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// 1) Electron バイナリをコピー（node_modules/electron/dist/ から）
const electronDist = join(ROOT, "node_modules", "electron", "dist");
if (!existsSync(electronDist)) {
  console.error("Electron dist not found:", electronDist);
  process.exit(1);
}
console.log("Copying Electron binary...");
cpSync(electronDist, OUT, { recursive: true });

// 2) resources/app/ を作成してアプリファイルを配置
const appResources = join(OUT, "resources", "app");
mkdirSync(appResources, { recursive: true });

console.log("Copying app files...");
// electron main
cpSync(join(ROOT, "electron"), join(appResources, "electron"), { recursive: true });
// Next.js build output
cpSync(join(ROOT, ".next"), join(appResources, ".next"), { recursive: true });
// public assets
cpSync(join(ROOT, "public"), join(appResources, "public"), { recursive: true });
// package.json
copyFileSync(join(ROOT, "package.json"), join(appResources, "package.json"));

// 3) node_modules（必要なものだけ）
console.log("Copying node_modules (this takes a while)...");
cpSync(join(ROOT, "node_modules"), join(appResources, "node_modules"), { recursive: true });

// 4) .env.local をコピー
const envSrc = join(ROOT, ".env.local");
if (existsSync(envSrc)) {
  copyFileSync(envSrc, join(OUT, ".env.local"));
  console.log("Copied .env.local");
} else {
  console.warn(".env.local not found — API keys will not be set");
}

// 5) exe の名前を変更（electron.exe → YouTube Notion Summary.exe）
const exeSrc = join(OUT, "electron.exe");
const exeDst = join(OUT, "YouTube Notion Summary.exe");
if (existsSync(exeSrc)) {
  // rcedit で ProductName を変えることもできるが、ここでは単純リネーム
  cpSync(exeSrc, exeDst);
  rmSync(exeSrc);
}

// 6) 起動用バッチファイル（ダブルクリック起動）
writeFileSync(
  join(ROOT, "dist-electron", "起動.bat"),
  `@echo off\nstart "" "%~dp0app\\YouTube Notion Summary.exe"\n`,
  "utf-8"
);

console.log("\n✅ Build complete!");
console.log("📁 App folder:", OUT);
console.log("🚀 Launch: double-click dist-electron\\起動.bat");
console.log("   or run:", join(OUT, "YouTube Notion Summary.exe"));
