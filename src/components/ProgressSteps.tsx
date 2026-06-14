"use client";

import type { ProcessStep } from "@/types";

interface Props {
  steps: ProcessStep[];
}

const icons: Record<string, string> = {
  idle: "○",
  loading: "⏳",
  done: "✅",
  error: "❌",
};

export default function ProgressSteps({ steps }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">処理状況</h2>
      {steps.map((step) => (
        <div key={step.id} className="flex items-center gap-3">
          <span className="text-lg w-6 text-center">{icons[step.status]}</span>
          <span className="font-medium text-gray-800 w-32">{step.label}</span>
          {step.status === "loading" && (
            <span className="text-sm text-blue-500 animate-pulse">処理中...</span>
          )}
          {step.detail && step.status !== "loading" && (
            <span className="text-sm text-gray-500">{step.detail}</span>
          )}
        </div>
      ))}
    </div>
  );
}
