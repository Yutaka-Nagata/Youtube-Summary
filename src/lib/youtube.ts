import { execFile } from "child_process";
import { readFileSync, unlinkSync, existsSync, readdirSync, chmodSync, createWriteStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import https from "https";
import { YoutubeTranscript } from "youtube-transcript";
import type { TranscriptResult } from "@/types";

const execFileAsync = promisify(execFile);
const TRANSCRIPT_MAX_CHARS = 80000;

// --- VTT パーサー（yt-dlp用） ---

function parseVTT(vtt: string): string {
  const lines = vtt.split("\n");
  const textLines: string[] = [];
  let prevLine = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed === "WEBVTT" ||
      trimmed.startsWith("Kind:") ||
      trimmed.startsWith("Language:") ||
      /^\d{2}:\d{2}/.test(trimmed)
    ) {
      continue;
    }
    const cleaned = trimmed
      .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
      .replace(/<c>/g, "")
      .replace(/<\/c>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (cleaned && cleaned !== prevLine) {
      textLines.push(cleaned);
      prevLine = cleaned;
    }
  }

  return textLines.join(" ");
}

// --- youtube-transcript ライブラリで取得 ---

async function fetchViaLibrary(videoId: string): Promise<string> {
  const items = await YoutubeTranscript.fetchTranscript(videoId);
  if (!items || items.length === 0) return "";
  return items.map((item) => item.text).join(" ");
}

// --- yt-dlp CLI で取得（ローカル環境用フォールバック） ---

const YTDLP_TMP = join(tmpdir(), "yt-dlp");
const YTDLP_LINUX_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", reject);
  });
}

async function resolveYtDlpPath(): Promise<string> {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;

  if (process.platform === "linux") {
    // 1) bundle に含まれているか確認
    const bundled = join(process.cwd(), "bin", "yt-dlp");
    if (existsSync(bundled)) return bundled;

    // 2) /tmp にキャッシュ済みか確認
    if (existsSync(YTDLP_TMP)) return YTDLP_TMP;

    // 3) ランタイムダウンロード（コールドスタート時のみ）
    await downloadFile(YTDLP_LINUX_URL, YTDLP_TMP);
    chmodSync(YTDLP_TMP, 0o755);
    return YTDLP_TMP;
  }

  return "yt-dlp";
}

function findVttFiles(dir: string, prefix: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".vtt"))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

async function fetchViaYtDlp(url: string, videoId: string): Promise<string> {
  const ytdlpPath = await resolveYtDlpPath();
  const tmp = tmpdir();
  const baseName = `yt_transcript_${videoId}_${Date.now()}`;
  const tmpBase = join(tmp, baseName);

  for (const lang of ["ja", "en"]) {
    try {
      await execFileAsync(ytdlpPath, [
        "--write-auto-subs",
        "--write-subs",
        "--sub-langs", lang,
        "--skip-download",
        "--sub-format", "vtt",
        "--no-playlist",
        // JS不要の Android クライアントを優先（Vercel に Deno/Node がない環境向け）
        "--extractor-args", "youtube:player_client=android,web",
        "-o", tmpBase,
        url,
      ], { timeout: 30000 });
    } catch {
      // yt-dlp は字幕なし時も非ゼロ終了するので無視
    }

    // yt-dlp が実際に作ったファイルを glob で探す（en-US.vtt 等のバリアントに対応）
    const vttFiles = findVttFiles(tmp, baseName);
    for (const vttPath of vttFiles) {
      try {
        const vttContent = readFileSync(vttPath, "utf-8");
        unlinkSync(vttPath);
        const parsed = parseVTT(vttContent);
        if (parsed.length > 0) return parsed;
      } catch {
        // ignore
      }
    }
  }

  return "";
}

// --- メイン ---

export async function getTranscript(url: string): Promise<TranscriptResult> {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!match) throw new Error("有効なYouTube URLを入力してください");

  const videoId = match[1];
  let transcript = "";

  // Step 1: youtube-transcript ライブラリで試みる（Vercel環境で有効）
  try {
    transcript = await fetchViaLibrary(videoId);
  } catch {
    // ライブラリ失敗はログせずにフォールバックへ
  }

  // Step 2: ライブラリが空/失敗なら yt-dlp で試みる（ローカル環境）
  if (!transcript) {
    try {
      transcript = await fetchViaYtDlp(url, videoId);
    } catch {
      // yt-dlp も失敗
    }
  }

  if (!transcript) {
    throw new Error("この動画には字幕がありません。自動字幕が無効な動画は対応していません。");
  }

  const originalCharCount = transcript.length;
  const isTruncated = originalCharCount > TRANSCRIPT_MAX_CHARS;
  const finalTranscript = isTruncated ? transcript.slice(0, TRANSCRIPT_MAX_CHARS) : transcript;

  return {
    transcript: finalTranscript,
    videoId,
    charCount: finalTranscript.length,
    isTruncated,
    originalCharCount: isTruncated ? originalCharCount : undefined,
  };
}
