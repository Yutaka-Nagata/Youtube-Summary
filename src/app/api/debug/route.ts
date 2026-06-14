import { NextResponse } from "next/server";
import { existsSync, chmodSync, createWriteStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import https from "https";
import { YoutubeTranscript } from "youtube-transcript";

export const maxDuration = 60;

const execFileAsync = promisify(execFile);
const YTDLP_TMP = join(tmpdir(), "yt-dlp");
const YTDLP_LINUX_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", reject);
  });
}

async function resolveYtDlpPath(): Promise<string> {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  if (process.platform === "linux") {
    const bundled = join(process.cwd(), "bin", "yt-dlp");
    if (existsSync(bundled)) return bundled;
    if (existsSync(YTDLP_TMP)) return YTDLP_TMP;
    await downloadFile(YTDLP_LINUX_URL, YTDLP_TMP);
    chmodSync(YTDLP_TMP, 0o755);
    return YTDLP_TMP;
  }
  return "yt-dlp";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("v") ?? "dQw4w9WgXcQ";

  const cwd = process.cwd();
  const platform = process.platform;
  const bundledPath = join(cwd, "bin", "yt-dlp");
  const bundledExists = existsSync(bundledPath);
  const tmpExists = existsSync(YTDLP_TMP);

  // resolve (may trigger runtime download)
  let ytdlpResolved = "(error)";
  let resolveError = "";
  let downloadElapsed = 0;
  try {
    const t0 = Date.now();
    ytdlpResolved = await resolveYtDlpPath();
    downloadElapsed = Date.now() - t0;
  } catch (e: unknown) {
    resolveError = e instanceof Error ? e.message : String(e);
  }

  const ytdlpExists = existsSync(ytdlpResolved);

  // version check
  let ytdlpVersion = "(skipped)";
  if (ytdlpExists) {
    try {
      const r = await execFileAsync(ytdlpResolved, ["--version"], { timeout: 10000 });
      ytdlpVersion = r.stdout.trim();
    } catch (e: unknown) {
      ytdlpVersion = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // library check
  let libraryResult = "(not tested)";
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    libraryResult = `OK: ${items.length} items`;
  } catch (e: unknown) {
    libraryResult = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // yt-dlp actual VTT download check
  let ytdlpDownloadResult = "(skipped)";
  if (ytdlpExists) {
    const { readdirSync, readFileSync, unlinkSync, existsSync: fsExists } = await import("fs");
    const tmpBase = join(tmpdir(), `debug_vtt_${videoId}_${Date.now()}`);
    const baseName = tmpBase.split("/").pop()!;
    let stdout2 = "", stderr2 = "";
    try {
      const r = await execFileAsync(
        ytdlpResolved,
        [
          "--write-auto-subs", "--write-subs",
          "--sub-langs", "ja,en",
          "--skip-download",
          "--sub-format", "vtt",
          "--no-playlist",
          "--extractor-args", "youtube:player_client=android,web",
          "-o", tmpBase,
          `https://www.youtube.com/watch?v=${videoId}`,
        ],
        { timeout: 30000 }
      );
      stdout2 = r.stdout;
      stderr2 = r.stderr;
    } catch (e: unknown) {
      const err = e as { message?: string; stdout?: string; stderr?: string };
      stdout2 = err.stdout ?? "";
      stderr2 = err.stderr ?? `(exec error: ${err.message})`;
    }
    // find any created VTT files
    const tmp = tmpdir();
    const vttFiles = readdirSync(tmp).filter(f => f.startsWith(baseName) && f.endsWith(".vtt"));
    let vttContent = "";
    for (const f of vttFiles) {
      const p = join(tmp, f);
      vttContent = readFileSync(p, "utf-8").slice(0, 200);
      unlinkSync(p);
    }
    ytdlpDownloadResult = `vttFiles=${JSON.stringify(vttFiles)} | vttContent=${vttContent.slice(0,100)} | stderr=${stderr2.slice(0,300)}`;
  }

  return NextResponse.json({
    platform,
    cwd,
    bundledPath,
    bundledExists,
    tmpPath: YTDLP_TMP,
    tmpExists,
    ytdlpResolved,
    resolveError,
    downloadElapsed,
    ytdlpExists,
    ytdlpVersion,
    libraryResult,
    ytdlpDownloadResult,
  });
}
