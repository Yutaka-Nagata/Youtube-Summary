import { execFile } from "child_process";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
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

function resolveYtDlpPath(): string {
  // 明示的に環境変数で指定された場合はそれを優先（ローカル Windows 等）
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  // Linux (Vercel) では postinstall でダウンロードしたバイナリを使う
  if (process.platform === "linux") return join(process.cwd(), "bin", "yt-dlp");
  return "yt-dlp";
}

async function fetchViaYtDlp(url: string, videoId: string): Promise<string> {
  const ytdlpPath = resolveYtDlpPath();
  const tmpBase = join(tmpdir(), `yt_transcript_${videoId}_${Date.now()}`);

  for (const lang of ["ja", "en"]) {
    const vttPath = `${tmpBase}.${lang}.vtt`;
    try {
      await execFileAsync(ytdlpPath, [
        "--write-auto-subs",
        "--write-subs",
        "--sub-langs", lang,
        "--skip-download",
        "--sub-format", "vtt",
        "--no-playlist",
        "-o", tmpBase,
        url,
      ], { timeout: 30000 });

      if (existsSync(vttPath)) {
        const vttContent = readFileSync(vttPath, "utf-8");
        unlinkSync(vttPath);
        const parsed = parseVTT(vttContent);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // ignore, try next lang
    }
    if (existsSync(vttPath)) unlinkSync(vttPath);
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
