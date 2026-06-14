export type StepStatus = "idle" | "loading" | "done" | "error";

export interface ProcessStep {
  id: "transcript" | "summarize" | "notion";
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface TranscriptResult {
  transcript: string;
  videoId: string;
  charCount: number;
  isTruncated: boolean;
  originalCharCount?: number;
}

export interface SummarizeResult {
  summary: string;
}

export interface NotionSaveResult {
  notionUrl: string;
  pageId: string;
}

export interface TranscriptRequest { url: string }
export interface SummarizeRequest {
  transcript: string;
  videoUrl: string;
}
export interface NotionSaveRequest {
  summary: string;
  videoUrl: string;
  transcript: string;
}
export interface ApiError { error: string }
