import { NextRequest, NextResponse } from "next/server";
import { getTranscript } from "@/lib/youtube";
import type { TranscriptRequest } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { url }: TranscriptRequest = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URLを入力してください" }, { status: 400 });
    }
    const result = await getTranscript(url);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文字起こしの取得に失敗しました" },
      { status: 500 }
    );
  }
}
