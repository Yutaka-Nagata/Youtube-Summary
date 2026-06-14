import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";

type RichTextItemRequest = {
  type: "text";
  text: { content: string };
  annotations?: { bold?: boolean; italic?: boolean };
};

function parseInlineMarkdown(text: string): RichTextItemRequest[] {
  const parts: RichTextItemRequest[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: { content: text.slice(lastIndex, match.index) } });
    }
    parts.push({
      type: "text",
      text: { content: match[1] },
      annotations: { bold: true },
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: { content: text.slice(lastIndex) } });
  }

  return parts.length > 0 ? parts : [{ type: "text", text: { content: text } }];
}

// テーブル行（| col | col |）かどうか判定
function isTableRow(line: string): boolean {
  return /^\|.+\|$/.test(line.trim());
}

// テーブル区切り行（|---|---|）かどうか判定
function isSeparatorRow(line: string): boolean {
  return /^\|[\s|:-]+\|$/.test(line.trim());
}

// テーブル行をセルの配列に分解
function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function markdownToBlocks(markdown: string): BlockObjectRequest[] {
  const lines = markdown.split("\n");
  const blocks: BlockObjectRequest[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // テーブル検出: 現在行と次行がテーブル行かチェック
    if (isTableRow(trimmed) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headerCells = parseTableRow(trimmed);
      const tableRows: string[][] = [];
      i += 2; // ヘッダー行と区切り行をスキップ

      // データ行を収集（テーブル行の間の空行は無視）
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (isTableRow(rowLine)) {
          tableRows.push(parseTableRow(rowLine));
          i++;
        } else if (rowLine === "") {
          // テーブル内の空行はスキップ（次がテーブル行なら継続）
          const next = lines[i + 1]?.trim() ?? "";
          if (isTableRow(next)) { i++; continue; }
          break;
        } else {
          break;
        }
      }

      const colCount = headerCells.length;

      blocks.push({
        object: "block",
        type: "table",
        table: {
          table_width: colCount,
          has_column_header: true,
          has_row_header: false,
          children: [
            // ヘッダー行
            {
              object: "block",
              type: "table_row",
              table_row: {
                cells: headerCells.map((cell) => parseInlineMarkdown(cell)),
              },
            },
            // データ行
            ...tableRows.map((row) => ({
              object: "block" as const,
              type: "table_row" as const,
              table_row: {
                cells: row.map((cell) => parseInlineMarkdown(cell)),
              },
            })),
          ],
        },
      } as BlockObjectRequest);
      continue;
    }

    if (trimmed === "---") {
      blocks.push({ object: "block", type: "divider", divider: {} });
    } else if (trimmed.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: trimmed.slice(4) } }] },
      });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: trimmed.slice(3) } }] },
      });
    } else if (trimmed.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: [{ type: "text", text: { content: trimmed.slice(2) } }] },
      });
    } else if (trimmed.match(/^-\s+\[[ x]?\]\s*/i)) {
      // チェックボックス: - [ ] / - [x] / - [  ] など揺れに対応
      const checked = /^-\s+\[x\]/i.test(trimmed);
      const content = trimmed.replace(/^-\s+\[[ x]?\]\s*/i, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: parseInlineMarkdown(content),
          checked,
        },
      });
    } else if (trimmed.match(/^-\s+\*\*\[[ x]?\]\*\*\s*/i)) {
      // 変則パターン: - **[ ] text** → チェックボックスとして扱う
      const checked = /^-\s+\*\*\[x\]\*\*/i.test(trimmed);
      const content = trimmed.replace(/^-\s+\*\*\[[ x]?\]\*\*\s*/i, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: { rich_text: parseInlineMarkdown(content), checked },
      });
    } else if (trimmed.match(/^[-*] /)) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: parseInlineMarkdown(trimmed.slice(2)) },
      });
    } else if (trimmed.match(/^\d+\. /)) {
      const content = trimmed.replace(/^\d+\. /, "");
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: parseInlineMarkdown(content) },
      });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: parseInlineMarkdown(trimmed) },
      });
    }

    i++;
  }

  return blocks;
}
