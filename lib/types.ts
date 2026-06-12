import type { AnalysisResult, ViralShort } from "./shorts";

export type VoiceoverResult = {
  shortId: string;
  provider: "elevenlabs" | "openai" | "mock";
  status: "completed" | "failed";
  path?: string;
  error?: string;
};

export type VideoGenerationResult = {
  shortId: string;
  provider: "kling" | "mock";
  prompt: string;
  jobId: string;
  status: "completed" | "failed" | "submitted" | "processing";
  url?: string;
  path?: string;
  error?: string;
};

export type RenderResult = {
  shortId: string;
  status: "completed" | "failed";
  path?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasAudio?: boolean;
  error?: string;
};

export type UploadResult = {
  shortId: string;
  status: "uploaded" | "dry-run" | "failed";
  objectKey: string;
  publicUrl?: string;
  error?: string;
};

export type PublishResult = {
  shortId: string;
  status: "published" | "dry-run" | "failed";
  requestId: string;
  response?: unknown;
  error?: string;
};

export type PipelineShortResult = {
  short: ViralShort;
  voiceover?: VoiceoverResult;
  clip?: VideoGenerationResult;
  render?: RenderResult;
  upload?: UploadResult;
  publish?: PublishResult;
};

export type PipelineReport = {
  mode: "real" | "dry-run";
  source: AnalysisResult["source"];
  startedAt: string;
  finishedAt: string;
  outputDir: string;
  shorts: PipelineShortResult[];
};
