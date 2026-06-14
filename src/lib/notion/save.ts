import { Client } from "@notionhq/client";
import type { NotionSaveResult } from "@/types";
import { markdownToBlocks } from "./markdownToBlocks";

export async function saveToNotion(params: {
  summary: string;
  videoUrl: string;
  transcript: string;
}): Promise<NotionSaveResult> {
  if (!process.env.NOTION_API_KEY) throw new Error("NOTION_API_KEYが設定されていません");
  if (!process.env.NOTION_DATABASE_ID) throw new Error("NOTION_DATABASE_IDが設定されていません");

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const databaseId = process.env.NOTION_DATABASE_ID;

  // タイトル抽出（1行目の # を除去）
  const firstLine = params.summary.split("\n")[0] ?? "";
  const title = firstLine.startsWith("# ")
    ? firstLine.slice(2).trim()
    : `YouTube動画 要約 ${new Date().toISOString().slice(0, 10)}`;

  // まず "YouTube URL" プロパティ付きで試し、なければタイトルのみで作成
  let page;
  try {
    page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ type: "text", text: { content: title } }] },
        "YouTube URL": { url: params.videoUrl },
      },
    });
  } catch {
    page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ type: "text", text: { content: title } }] },
      },
    });
  }

  const blocks = markdownToBlocks(params.summary);

  // 100ブロック単位で追加
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: page.id,
      children: blocks.slice(i, i + 100) as Parameters<typeof notion.blocks.children.append>[0]["children"],
    });
  }

  // 文字起こしを toggle ブロックとして追加
  const transcriptChunks: string[] = [];
  for (let i = 0; i < params.transcript.length; i += 2000) {
    transcriptChunks.push(params.transcript.slice(i, i + 2000));
  }

  await notion.blocks.children.append({
    block_id: page.id,
    children: [
      {
        object: "block",
        type: "toggle",
        toggle: {
          rich_text: [{ type: "text", text: { content: "📄 元の文字起こし（クリックで展開）" } }],
          children: transcriptChunks.map((chunk) => ({
            object: "block" as const,
            type: "paragraph" as const,
            paragraph: { rich_text: [{ type: "text" as const, text: { content: chunk } }] },
          })),
        },
      },
    ],
  });

  const pageObj = page as { url: string; id: string };
  return { notionUrl: pageObj.url, pageId: pageObj.id };
}
