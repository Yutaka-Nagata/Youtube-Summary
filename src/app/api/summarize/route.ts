import { NextRequest, NextResponse } from "next/server";
import { summarizeWithClaude } from "@/lib/claude";
import type { SummarizeRequest } from "@/types";

// Phase 2 (Vercel) でのタイムアウト対策設定:
// export const maxDuration = 60; // Vercel Pro プランで60秒まで延長

export async function POST(req: NextRequest) {
  try {
    const { transcript, videoUrl }: SummarizeRequest = await req.json();
    if (!transcript || !videoUrl) {
      return NextResponse.json({ error: "transcript と videoUrl は必須です" }, { status: 400 });
    }
    const summary = await summarizeWithClaude(transcript, videoUrl);
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "要約に失敗しました" },
      { status: 500 }
    );
  }
}
