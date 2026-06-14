import { randomUUID } from "node:crypto";
import { getNumberEnv } from "./env";
import { runClippingPipeline, type RunPipelineOptions } from "./pipeline";
import type { ClippingPipelineReport } from "./types";
import { TelegramApiError, toTelegramSafeError, type TelegramPlatform } from "./telegram-agent";

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
const MAX_ACTIVE_JOBS = 1;
const DEFAULT_MAX_QUEUED_JOBS = 10;

const globalForTelegramJobs = globalThis as typeof globalThis & {
  __telegramClipJobs?: Map<string, TelegramClipJob>;
  __telegramClipJobQueue?: string[];
  __telegramActiveClipJobs?: Set<string>;
};

const jobs = globalForTelegramJobs.__telegramClipJobs ?? new Map<string, TelegramClipJob>();
globalForTelegramJobs.__telegramClipJobs = jobs;

const jobQueue = globalForTelegramJobs.__telegramClipJobQueue ?? [];
globalForTelegramJobs.__telegramClipJobQueue = jobQueue;

const activeJobs = globalForTelegramJobs.__telegramActiveClipJobs ?? new Set<string>();
globalForTelegramJobs.__telegramActiveClipJobs = activeJobs;

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
  start?: boolean;
}) {
  cleanupJobs();

  if (getQueuedJobCount() >= getTelegramMaxQueuedJobs()) {
    throw new TelegramApiError(429, "File de clipping pleine. Reessaie dans quelques minutes.");
  }

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
  jobQueue.push(job.id);
  if (options.start !== false) drainJobQueue();

  return job;
}

export function getTelegramClipJob(jobId: string) {
  cleanupJobs();
  return jobs.get(jobId);
}

export function getTelegramClipJobQueuePosition(jobId: string) {
  cleanupJobs();
  const index = jobQueue.findIndex((queuedJobId) => queuedJobId === jobId);
  return index >= 0 ? index + 1 : undefined;
}

export function getTelegramMaxQueuedJobs() {
  return Math.floor(getNumberEnv("TELEGRAM_CLIP_MAX_QUEUED_JOBS", DEFAULT_MAX_QUEUED_JOBS));
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
      error: toTelegramSafeError(error, "Generation des previews impossible."),
    });
  }
}

function drainJobQueue() {
  while (activeJobs.size < MAX_ACTIVE_JOBS) {
    const nextJobId = jobQueue.shift();
    if (!nextJobId) return;

    const job = jobs.get(nextJobId);
    if (!job || job.status !== "queued") continue;

    activeJobs.add(nextJobId);
    void runTelegramClipJob(nextJobId, {
      url: job.url,
      mode: "real",
      limit: job.limit,
      publish: false,
      platforms: job.platforms,
    }).finally(() => {
      activeJobs.delete(nextJobId);
      cleanupJobs();
      drainJobQueue();
    });
  }
}

function getQueuedJobCount() {
  return jobQueue.filter((jobId) => jobs.get(jobId)?.status === "queued").length;
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
    if (!activeJobs.has(jobId) && now - Date.parse(job.createdAt) > JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }

  while (jobs.size > MAX_JOBS) {
    const firstJobId = jobs.keys().next().value;
    if (!firstJobId) break;
    if (activeJobs.has(firstJobId)) break;
    jobs.delete(firstJobId);
  }

  for (let index = jobQueue.length - 1; index >= 0; index -= 1) {
    if (!jobs.has(jobQueue[index])) jobQueue.splice(index, 1);
  }
}
