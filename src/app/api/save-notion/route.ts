import { NextRequest, NextResponse } from "next/server";
import { saveToNotion } from "@/lib/notion/save";
import type { NotionSaveRequest } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const params: NotionSaveRequest = await req.json();
    const result = await saveToNotion(params);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notionへの保存に失敗しました" },
      { status: 500 }
    );
  }
}
