import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { createTelegramClipJob as createTelegramClipJobType } from "../lib/telegram-clip-jobs";
import { TelegramApiError } from "../lib/telegram-agent";

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verification queue Telegram impossible.");
  process.exit(1);
});

async function main() {
  const originalMaxQueuedJobs = process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS;
  const originalStatePath = process.env.TELEGRAM_CLIP_JOBS_STATE_PATH;
  const tempDir = mkdtempSync(path.join(tmpdir(), "telegram-clip-queue-"));
  process.env.TELEGRAM_CLIP_JOBS_STATE_PATH = path.join(tempDir, "jobs.json");

  try {
    process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS = "2";
    const {
      createTelegramClipJob,
      getTelegramClipJobQueuePosition,
      getTelegramMaxQueuedJobs,
      getTelegramClipJobsStatePath,
    } = await import("../lib/telegram-clip-jobs");

    if (getTelegramClipJobsStatePath() !== process.env.TELEGRAM_CLIP_JOBS_STATE_PATH) {
      throw new Error("Expected queue verification to use isolated temp job state.");
    }

    if (getTelegramMaxQueuedJobs() !== 2) {
      throw new Error("Expected TELEGRAM_CLIP_MAX_QUEUED_JOBS to configure queue depth.");
    }

    const firstJob = createTestJob(createTelegramClipJob);
    if (firstJob.status !== "queued") {
      throw new Error(`Expected new async Telegram job to start queued, got ${firstJob.status}.`);
    }

    const secondJob = createTestJob(createTelegramClipJob);
    if (getTelegramClipJobQueuePosition(firstJob.id) !== 1) {
      throw new Error("Expected first queued Telegram job to have queue position 1.");
    }
    if (getTelegramClipJobQueuePosition(secondJob.id) !== 2) {
      throw new Error("Expected second queued Telegram job to have queue position 2.");
    }

    try {
      createTestJob(createTelegramClipJob);
      throw new Error("Expected full Telegram clip queue to fail.");
    } catch (error) {
      if (!(error instanceof TelegramApiError)) throw error;
      if (error.status !== 429) throw new Error(`Expected HTTP 429, got ${error.status}.`);
      if (error.message !== "File de clipping pleine. Reessaie dans quelques minutes.") {
        throw new Error(`Unexpected queue-full message: ${error.message}`);
      }
    }

    console.log("PASS telegram clip queue");
  } finally {
    if (originalMaxQueuedJobs === undefined) {
      delete process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS;
    } else {
      process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS = originalMaxQueuedJobs;
    }

    if (originalStatePath === undefined) {
      delete process.env.TELEGRAM_CLIP_JOBS_STATE_PATH;
    } else {
      process.env.TELEGRAM_CLIP_JOBS_STATE_PATH = originalStatePath;
    }

    rmSync(tempDir, { recursive: true, force: true });
  }
}

function createTestJob(createTelegramClipJob: typeof createTelegramClipJobType) {
  return createTelegramClipJob({
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    limit: 1,
    platforms: ["youtube", "instagram"],
    start: false,
  });
}
