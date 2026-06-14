"use client";

interface Props {
  summary: string;
  notionUrl?: string;
}

export default function SummaryResult({ summary, notionUrl }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">要約結果</h2>
      <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
        {summary}
      </pre>
      {notionUrl && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <a
            href={notionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            📎 Notionで確認する →
          </a>
        </div>
      )}
    </div>
  );
}
