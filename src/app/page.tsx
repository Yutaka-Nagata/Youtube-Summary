"use client";

import { useState } from "react";
import type { ProcessStep, TranscriptResult, SummarizeResult, NotionSaveResult } from "@/types";
import ProgressSteps from "@/components/ProgressSteps";
import SummaryResult from "@/components/SummaryResult";

const initialSteps: ProcessStep[] = [
  { id: "transcript", label: "文字起こし取得", status: "idle" },
  { id: "summarize", label: "Claudeで要約", status: "idle" },
  { id: "notion", label: "Notionに保存", status: "idle" },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [steps, setSteps] = useState<ProcessStep[]>(initialSteps);
  const [transcriptResult, setTranscriptResult] = useState<TranscriptResult | null>(null);
  const [summaryResult, setSummaryResult] = useState<SummarizeResult | null>(null);
  const [notionResult, setNotionResult] = useState<NotionSaveResult | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const updateStep = (id: ProcessStep["id"], patch: Partial<ProcessStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setGlobalError(null);
    setTranscriptResult(null);
    setSummaryResult(null);
    setNotionResult(null);
    setSteps(initialSteps);
    setIsRunning(true);

    try {
      // Step 1: 文字起こし取得
      updateStep("transcript", { status: "loading" });
      const tRes = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!tRes.ok) {
        const { error } = await tRes.json();
        updateStep("transcript", { status: "error" });
        setGlobalError(error);
        return;
      }
      const tData: TranscriptResult = await tRes.json();
      setTranscriptResult(tData);
      updateStep("transcript", {
        status: "done",
        detail: `${tData.charCount.toLocaleString()}文字取得`,
      });

      // Step 2: Claudeで要約
      updateStep("summarize", { status: "loading" });
      const sRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: tData.transcript, videoUrl: url }),
      });
      if (!sRes.ok) {
        const { error } = await sRes.json();
        updateStep("summarize", { status: "error" });
        setGlobalError(error);
        return;
      }
      const sData: SummarizeResult = await sRes.json();
      setSummaryResult(sData);
      updateStep("summarize", { status: "done", detail: "要約完了" });

      // Step 3: Notion保存
      updateStep("notion", { status: "loading" });
      const nRes = await fetch("/api/save-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: sData.summary, videoUrl: url, transcript: tData.transcript }),
      });
      if (!nRes.ok) {
        const { error } = await nRes.json();
        updateStep("notion", { status: "error" });
        setGlobalError(error);
        return;
      }
      const nData: NotionSaveResult = await nRes.json();
      setNotionResult(nData);
      updateStep("notion", { status: "done", detail: "保存完了" });
    } finally {
      setIsRunning(false);
    }
  };

  const isActive = steps.some((s) => s.status !== "idle");

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">YouTube → Notion 要約サマリー</h1>
          <p className="text-sm text-gray-500 mt-1">動画URLを入力して、AIが要約してNotionに保存します</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">YouTube URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isRunning}
          />
          <button
            onClick={handleSubmit}
            disabled={isRunning || !url.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-md text-sm transition-colors"
          >
            {isRunning ? "処理中..." : "要約してNotionに保存する"}
          </button>
        </div>

        {isActive && <ProgressSteps steps={steps} />}

        {transcriptResult?.isTruncated && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            ⚠️ 動画が長いため文字起こしを80,000文字でカットしました
            （元: {transcriptResult.originalCharCount?.toLocaleString()}文字）
          </div>
        )}

        {globalError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            ❌ {globalError}
          </div>
        )}

        {summaryResult && (
          <SummaryResult
            summary={summaryResult.summary}
            notionUrl={notionResult?.notionUrl}
          />
        )}
      </div>
    </main>
  );
}
