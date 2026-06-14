#!/usr/bin/env node
// Vercel build 時 (Linux) にのみ yt-dlp バイナリをダウンロードする
import { existsSync, mkdirSync, chmodSync, createWriteStream } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, "..", "bin");
const BIN_PATH = join(BIN_DIR, "yt-dlp");

if (process.platform !== "linux") {
  console.log("[download-ytdlp] Non-Linux platform, skipping.");
  process.exit(0);
}

if (existsSync(BIN_PATH)) {
  console.log("[download-ytdlp] yt-dlp already exists, skipping.");
  process.exit(0);
}

if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });

const URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

console.log("[download-ytdlp] Downloading yt-dlp for Linux...");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          download(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

try {
  await download(URL, BIN_PATH);
  chmodSync(BIN_PATH, 0o755);
  console.log("[download-ytdlp] Done:", BIN_PATH);
} catch (err) {
  console.error("[download-ytdlp] Failed:", err.message);
  process.exit(1);
}
