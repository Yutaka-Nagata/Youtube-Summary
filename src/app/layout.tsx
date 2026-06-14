import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube → Notion 要約サマリー",
  description: "YouTube動画の文字起こしをClaudeで要約してNotionに保存するアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
