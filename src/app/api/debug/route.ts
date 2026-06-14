import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { YoutubeTranscript } from "youtube-transcript";

const execFileAsync = promisify(execFile);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("v") ?? "dQw4w9WgXcQ";

  const cwd = process.cwd();
  const platform = process.platform;
  const ytdlpEnv = process.env.YTDLP_PATH ?? "(not set)";
  const ytdlpResolved =
    process.env.YTDLP_PATH ??
    (platform === "linux" ? join(cwd, "bin", "yt-dlp") : "yt-dlp");
  const ytdlpExists = existsSync(ytdlpResolved);

  // yt-dlp version check
  let ytdlpVersion = "(not tested)";
  try {
    const r = await execFileAsync(ytdlpResolved, ["--version"], {
      timeout: 10000,
    });
    ytdlpVersion = r.stdout.trim();
  } catch (e: unknown) {
    ytdlpVersion = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // youtube-transcript library check
  let libraryResult = "(not tested)";
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    libraryResult = `OK: ${items.length} items, first="${items[0]?.text?.slice(0, 50)}"`;
  } catch (e: unknown) {
    libraryResult = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // yt-dlp transcript check
  let ytdlpResult = "(not tested)";
  if (ytdlpExists) {
    try {
      const { stdout, stderr } = await execFileAsync(
        ytdlpResolved,
        [
          "--write-auto-subs",
          "--sub-langs",
          "ja,en",
          "--skip-download",
          "--sub-format",
          "vtt",
          "--no-playlist",
          "--list-subs",
          `https://www.youtube.com/watch?v=${videoId}`,
        ],
        { timeout: 30000 }
      );
      ytdlpResult = `OK stdout(200)=${stdout.slice(0, 200)} stderr(200)=${stderr.slice(0, 200)}`;
    } catch (e: unknown) {
      const err = e as { message?: string; stdout?: string; stderr?: string };
      ytdlpResult = `ERROR: ${err.message} | stdout=${err.stdout?.slice(0, 200)} | stderr=${err.stderr?.slice(0, 200)}`;
    }
  } else {
    ytdlpResult = "SKIPPED: binary not found";
  }

  return NextResponse.json({
    platform,
    cwd,
    ytdlpEnv,
    ytdlpResolved,
    ytdlpExists,
    ytdlpVersion,
    libraryResult,
    ytdlpResult,
  });
}
