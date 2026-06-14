import Anthropic from "@anthropic-ai/sdk";

const PROMPT_TEMPLATE = `あなたはYouTube動画の内容を整理・要約するAIアシスタントです。
以下はYouTube動画の文字起こしです。
動画URL: {videoUrl}

以下の構成でMarkdown形式の要約を作成してください。
タイトルは動画の内容から適切なものを推定してください。

# [動画タイトルを推定して記載]

## 📌 概要
3〜5文で動画全体の要点をまとめてください。

## 🔑 重要ポイント
箇条書きで5〜8個、各ポイントを1〜2文で説明してください。

## 📝 詳細メモ
重要な説明、事例、数字などを段落形式で記述してください。

## 💡 学び・アクションアイテム
視聴者がすぐ実践できることや、記憶すべき学びをリストアップしてください。

---
文字起こし:
{transcript}`;

export async function summarizeWithClaude(
  transcript: string,
  videoUrl: string
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEYが設定されていません");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = PROMPT_TEMPLATE
    .replace("{videoUrl}", videoUrl)
    .replace("{transcript}", transcript);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("予期しないレスポンス形式です");

  return content.text;
}
