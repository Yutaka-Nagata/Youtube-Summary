import { execFile } from "child_process";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import type { TranscriptResult } from "@/types";

const execFileAsync = promisify(execFile);
const TRANSCRIPT_MAX_CHARS = 80000;

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
    // Remove inline timing cues and tags
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

export async function getTranscript(url: string): Promise<TranscriptResult> {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!match) throw new Error("有効なYouTube URLを入力してください");

  const videoId = match[1];
  const tmpBase = join(tmpdir(), `yt_transcript_${videoId}_${Date.now()}`);
  const outputTemplate = `${tmpBase}`;

  // Try yt-dlp: prefer Japanese auto-sub, fall back to English
  const langAttempts = ["ja", "en"];
  let transcript = "";
  let downloadedLang = "";

  for (const lang of langAttempts) {
    const vttPath = `${outputTemplate}.${lang}.vtt`;
    try {
      // yt-dlp path: installed via winget, may not be in Node.js subprocess PATH
      const ytdlpPath = process.platform === "win32"
        ? (process.env.YTDLP_PATH ?? "yt-dlp")
        : "yt-dlp";
      await execFileAsync(ytdlpPath, [
        "--write-auto-subs",
        "--write-subs",
        "--sub-langs", lang,
        "--skip-download",
        "--sub-format", "vtt",
        "--no-playlist",
        "-o", outputTemplate,
        url,
      ], { timeout: 30000 });

      if (existsSync(vttPath)) {
        const vttContent = readFileSync(vttPath, "utf-8");
        unlinkSync(vttPath);
        const parsed = parseVTT(vttContent);
        if (parsed.length > 0) {
          transcript = parsed;
          downloadedLang = lang;
          break;
        }
      }
    } catch {
      // try next language
    }
    // Clean up any leftover files
    if (existsSync(vttPath)) unlinkSync(vttPath);
  }

  if (!transcript) {
    throw new Error("この動画には字幕がありません。自動字幕が無効な動画は対応していません。");
  }

  void downloadedLang; // suppress unused warning

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
