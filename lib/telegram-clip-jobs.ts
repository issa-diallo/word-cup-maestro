import { randomUUID } from "node:crypto";
import { runClippingPipeline, type RunPipelineOptions } from "./pipeline";
import type { ClippingPipelineReport } from "./types";
import type { TelegramPlatform } from "./telegram-agent";

export type TelegramClipPreview = {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  durationSeconds: number;
  previewUrl: string | undefined;
  platforms: TelegramPlatform[];
};

export type TelegramClipResult = {
  status: "ready" | "failed";
  source: {
    url: string;
    title: string;
  };
  clips: TelegramClipPreview[];
};

export type TelegramClipJobStatus = "queued" | "processing" | "ready" | "failed";

export type TelegramClipJob = {
  id: string;
  status: TelegramClipJobStatus;
  createdAt: string;
  updatedAt: string;
  url: string;
  limit: number;
  platforms: TelegramPlatform[];
  result?: TelegramClipResult;
  error?: string;
};

const MAX_JOBS = 100;
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

const globalForTelegramJobs = globalThis as typeof globalThis & {
  __telegramClipJobs?: Map<string, TelegramClipJob>;
};

const jobs = globalForTelegramJobs.__telegramClipJobs ?? new Map<string, TelegramClipJob>();
globalForTelegramJobs.__telegramClipJobs = jobs;

export function formatTelegramClipReport(
  report: ClippingPipelineReport,
  platforms: TelegramPlatform[],
): TelegramClipResult {
  const clips = report.clips
    .filter((clip) => clip.upload?.status === "uploaded" && clip.upload.publicUrl)
    .map((clip) => ({
      id: clip.segment.id,
      title: clip.segment.title,
      description: clip.segment.description,
      hashtags: clip.segment.hashtags,
      durationSeconds: Math.round((clip.segment.end - clip.segment.start) * 10) / 10,
      previewUrl: clip.upload?.publicUrl,
      platforms,
    }));

  return {
    status: clips.length ? "ready" : "failed",
    source: {
      url: report.source.url,
      title: report.source.title ?? report.source.id,
    },
    clips,
  };
}

export function createTelegramClipJob(options: {
  url: string;
  limit: number;
  platforms: TelegramPlatform[];
}) {
  cleanupJobs();

  const now = new Date().toISOString();
  const job: TelegramClipJob = {
    id: randomUUID(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    url: options.url,
    limit: options.limit,
    platforms: options.platforms,
  };

  jobs.set(job.id, job);
  void runTelegramClipJob(job.id, {
    url: options.url,
    mode: "real",
    limit: options.limit,
    publish: false,
    platforms: options.platforms,
  });

  return job;
}

export function getTelegramClipJob(jobId: string) {
  cleanupJobs();
  return jobs.get(jobId);
}

async function runTelegramClipJob(jobId: string, options: RunPipelineOptions) {
  updateJob(jobId, { status: "processing" });

  try {
    const report = await runClippingPipeline(options);
    const result = formatTelegramClipReport(report, options.platforms as TelegramPlatform[]);
    updateJob(jobId, {
      status: result.status,
      result,
      error: result.status === "failed" ? "Aucune preview uploadable n'a ete generee." : undefined,
    });
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Generation des previews impossible.",
    });
  }
}

function updateJob(jobId: string, patch: Partial<TelegramClipJob>) {
  const current = jobs.get(jobId);
  if (!current) return;

  jobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function cleanupJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (now - Date.parse(job.createdAt) > JOB_TTL_MS) jobs.delete(jobId);
  }

  while (jobs.size > MAX_JOBS) {
    const firstJobId = jobs.keys().next().value;
    if (!firstJobId) break;
    jobs.delete(firstJobId);
  }
}
